const sharp = require('sharp');
const aws = require('aws-sdk');
const fs = require('fs');

// Configure AWS S3
const s3 = new aws.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

/**
 * Optimize and upload image to S3
 * @param {string} localPath - Path to local image file
 * @param {Object} options - Optimization options
 * @param {number} options.width - Max width (default: 800)
 * @param {number} options.quality - WebP quality (default: 80)
 * @param {string} options.folder - S3 folder path (default: 'images')
 * @param {string} options.filename - Custom filename (optional)
 * @returns {Promise<Object>} - { success: boolean, url?: string, error?: string }
 */
const optimizeAndUpload = async (localPath, options = {}) => {
  const {
    width = 800,
    quality = 80,
    folder = 'images',
    filename = null
  } = options;

  const finalFilename = filename || `${Date.now()}_compressed.webp`;

  try {
    // Compress and convert to WebP
    const compressedBuffer = await sharp(localPath)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();

    // Upload to S3
    const params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: `${folder}/${finalFilename}`,
      Body: compressedBuffer,
      ContentType: 'image/webp',
      CacheControl: 'max-age=31536000, public', 
    };

    return new Promise((resolve, reject) => {
      s3.upload(params, (err, data) => {
        // Clean up local file
        try {
          fs.unlinkSync(localPath);
        } catch (unlinkErr) {
          console.error('Error deleting local file:', unlinkErr);
        }

        if (err) {
          console.error('S3 upload error:', err);
          reject({ success: false, error: 'Upload failed' });
        } else {
          resolve({ success: true, url: data.Location });
        }
      });
    });
  } catch (error) {
    // Clean up local file on error
    try {
      fs.unlinkSync(localPath);
    } catch (unlinkErr) {
      console.error('Error deleting local file:', unlinkErr);
    }
    
    console.error('Image processing error:', error);
    throw { success: false, error: 'Image processing failed' };
  }
};

/**
 * Optimize multiple images and upload to S3
 * @param {Array} localPaths - Array of local image file paths
 * @param {Object} options - Optimization options
 * @returns {Promise<Array>} - Array of upload results
 */
const optimizeAndUploadMultiple = async (localPaths, options = {}) => {
  const uploadPromises = localPaths.map((path, index) => {
    const filename = `${Date.now()}_${index}_compressed.webp`;
    return optimizeAndUpload(path, { ...options, filename });
  });

  return Promise.all(uploadPromises);
};

/**
 * Generate different sizes of an image for responsive design
 * @param {string} localPath - Path to local image file
 * @param {Object} options - Optimization options
 * @returns {Promise<Object>} - Object with different size URLs
 */
const generateResponsiveImages = async (localPath, options = {}) => {
  const {
    sizes = [400, 800, 1200],
    quality = 80,
    folder = 'images'
  } = options;

  const results = {};

  try {
    for (const size of sizes) {
      const filename = `${Date.now()}_${size}w.webp`;
      
      const compressedBuffer = await sharp(localPath)
        .resize({ width: size, withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();

      const params = {
        Bucket: process.env.AWS_BUCKET_NAME,
        Key: `${folder}/${filename}`,
        Body: compressedBuffer,
        ContentType: 'image/webp',
        CacheControl: 'max-age=31536000, public', 
      };

      const uploadResult = await new Promise((resolve, reject) => {
        s3.upload(params, (err, data) => {
          if (err) reject(err);
          else resolve(data.Location);
        });
      });

      results[`${size}w`] = uploadResult;
    }

    // Clean up local file
    try {
      fs.unlinkSync(localPath);
    } catch (unlinkErr) {
      console.error('Error deleting local file:', unlinkErr);
    }

    return { success: true, urls: results };
  } catch (error) {
    // Clean up local file on error
    try {
      fs.unlinkSync(localPath);
    } catch (unlinkErr) {
      console.error('Error deleting local file:', unlinkErr);
    }
    
    console.error('Responsive image generation error:', error);
    throw { success: false, error: 'Responsive image generation failed' };
  }
};

module.exports = {
  optimizeAndUpload,
  optimizeAndUploadMultiple,
  generateResponsiveImages
}; 