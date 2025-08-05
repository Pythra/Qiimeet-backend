const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/database');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const aws = require('aws-sdk');
const multerS3 = require('multer-s3');
const sharp = require('sharp');
const { optimizeAndUpload } = require('./utils/imageOptimizer');

dotenv.config();

const authRoutes = require('./routes/authRoutes');
const paystackRoutes = require('./routes/paystackroutes');
const transactionRoutes = require('./routes/transactionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const agoraRoutes = require('./routes/agoraRoutes');
const chatRoutes = require('./routes/chatRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

const app = express();
app.use(cors());
app.use(express.json());

// Root health check for Render
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'QiMeet API is running on Render',
    timestamp: new Date().toISOString()
  });
});

// Catch-all logger for all incoming requests
app.use((req, res, next) => {
  console.log('INCOMING:', req.method, req.originalUrl);
  next();
});

connectDB();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('Created uploads directory:', uploadsDir);
}

// S3 config
aws.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});
const s3 = new aws.S3();

// Local storage for temporary files
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir); // Use the ensured uploads directory
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  }
});

const upload = multer({ storage: multerStorage });

// S3 upload for multiple images (keeping original for bulk uploads)
const uploadS3 = multer({
  storage: multerS3({
    s3: s3,
    bucket: process.env.AWS_BUCKET_NAME,  
    metadata: (req, file, cb) => {
      cb(null, { fieldName: file.fieldname });
    },
    key: (req, file, cb) => {
      cb(null, `${Date.now()}_${file.originalname}`);
    }
  })
});

// Upload routes

app.post('/api/upload-images', uploadS3.array('images', 6), (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
  const imageUrls = req.files.map(file => file.location); // S3 public URL
  res.json({ success: true, imageUrls });
});

// New optimized bulk upload endpoint
app.post('/api/upload-images-optimized', upload.array('images', 6), async (req, res) => {
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });

  try {
    const { optimizeAndUploadMultiple } = require('./utils/imageOptimizer');
    
    const localPaths = req.files.map(file => file.path);
    const results = await optimizeAndUploadMultiple(localPaths, {
      width: 800,
      quality: 80,
      folder: 'gallery'
    });

    const successfulUploads = results.filter(result => result.success);
    const failedUploads = results.filter(result => !result.success);

    if (failedUploads.length > 0) {
      console.error('Some uploads failed:', failedUploads);
    }

    const imageUrls = successfulUploads.map(result => result.url);
    
    res.json({ 
      success: true, 
      imageUrls,
      uploaded: successfulUploads.length,
      failed: failedUploads.length
    });
  } catch (error) {
    console.error('Bulk upload error:', error);
    res.status(500).json({ error: 'Bulk upload failed' });
  }
});

// Updated upload endpoint to handle both field names
app.post('/api/upload', upload.single('Profilepictures'), async (req, res) => {
  console.log('Upload request received');
  console.log('File:', req.file);
  console.log('Body:', req.body);
  
  if (!req.file) {
    console.log('No file uploaded');
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    console.log('Processing file:', req.file.path);
    const result = await optimizeAndUpload(req.file.path, {
      width: 800,
      quality: 80,
      folder: 'profilePictures'
    });

    if (!result.success) {
      console.error('Optimization failed:', result.error);
      return res.status(500).json({ error: result.error });
    }

    const imageUrl = result.url;
    console.log('Upload successful, URL:', imageUrl);
    
    const userId = req.body.userId;

    if (userId) {
      const User = require('./models/User');
      try {
        await User.findByIdAndUpdate(
          userId,
          { $push: { profilePictures: imageUrl } },
          { new: true }
        );
        console.log('Database updated for user:', userId);
      } catch (dbErr) {
        console.error('Database update error:', dbErr);
        // Still return success since image was uploaded
      }
    }

    res.json({ success: true, url: imageUrl });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Audio upload endpoint (no image optimization)
app.post('/api/upload-audio', upload.single('audio'), async (req, res) => {
  console.log('Audio upload request received');
  console.log('File:', req.file);
  
  if (!req.file) {
    console.log('No audio file uploaded');
    return res.status(400).json({ error: 'No audio file uploaded' });
  }

  try {
    console.log('Processing audio file:', req.file.path);
    
    // Read the audio file
    const audioBuffer = fs.readFileSync(req.file.path);
    
    // Upload to S3 without image optimization
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `audio/${Date.now()}_${req.file.originalname}`,
      Body: audioBuffer,
      ContentType: req.file.mimetype,
      CacheControl: 'max-age=31536000, public',
    };

    const uploadResult = await new Promise((resolve, reject) => {
      s3.upload(params, (err, data) => {
        // Clean up local file
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkErr) {
          console.error('Error deleting local file:', unlinkErr);
        }

        if (err) {
          console.error('S3 upload error:', err);
          reject({ success: false, error: 'Upload failed' });
        } else {
          // Convert S3 URL to CloudFront URL
          const cloudFrontUrl = 'https://dk665xezaubcy.cloudfront.net';
          const s3Key = data.Key;
          const cloudFrontAudioUrl = `${cloudFrontUrl}/${s3Key}`;
          resolve({ success: true, url: cloudFrontAudioUrl });
        }
      });
    });

    if (!uploadResult.success) {
      console.error('Audio upload failed:', uploadResult.error);
      return res.status(500).json({ error: uploadResult.error });
    }

    const audioUrl = uploadResult.url;
    console.log('Audio upload successful, URL:', audioUrl);
    
    res.json({ success: true, url: audioUrl });
  } catch (error) {
    console.error('Audio upload error:', error);
    res.status(500).json({ error: 'Audio upload failed' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    s3Bucket: process.env.AWS_BUCKET_NAME,
    s3Region: process.env.AWS_REGION,
    uploadsDir: uploadsDir,
    uploadsDirExists: fs.existsSync(uploadsDir)
  });
});

// Debug route to check uploads directory
app.get('/api/debug/uploads', (req, res) => {
  try {
    const files = fs.readdirSync(uploadsDir);
    res.json({
      uploadsDir,
      exists: fs.existsSync(uploadsDir),
      files: files,
      fileCount: files.length
    });
  } catch (error) {
    res.json({
      uploadsDir,
      exists: fs.existsSync(uploadsDir),
      error: error.message
    });
  }
});

// Other routes
app.use('/api/auth', authRoutes);
app.use('/api/paystack', paystackRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', agoraRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationRoutes);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!' });
});

module.exports = app;
