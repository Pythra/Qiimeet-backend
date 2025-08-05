# Image Optimization Features

This backend now includes advanced image optimization capabilities using Sharp for compression and WebP conversion.

## Features

- **Automatic compression**: Images are resized to a maximum width (default: 800px)
- **WebP conversion**: All images are converted to WebP format for better compression
- **Quality control**: Configurable quality settings (default: 80%)
- **S3 integration**: Optimized images are automatically uploaded to AWS S3
- **Local cleanup**: Temporary files are automatically deleted after processing
- **Error handling**: Comprehensive error handling with cleanup

## API Endpoints

### Single Image Upload (Optimized)
```
POST /api/upload
Content-Type: multipart/form-data

Body:
- Profilepictures: image file
- userId: string (optional)
```

**Response:**
```json
{
  "success": true,
  "url": "https://your-bucket.s3.amazonaws.com/profilePictures/1234567890_compressed.webp"
}
```

### Bulk Image Upload (Optimized)
```
POST /api/upload-images-optimized
Content-Type: multipart/form-data

Body:
- images: array of image files (max 6)
```

**Response:**
```json
{
  "success": true,
  "imageUrls": [
    "https://your-bucket.s3.amazonaws.com/gallery/1234567890_0_compressed.webp",
    "https://your-bucket.s3.amazonaws.com/gallery/1234567890_1_compressed.webp"
  ],
  "uploaded": 2,
  "failed": 0
}
```

### Legacy Bulk Upload (No Optimization)
```
POST /api/upload-images
Content-Type: multipart/form-data

Body:
- images: array of image files (max 6)
```

## Utility Functions

### optimizeAndUpload(localPath, options)
Optimizes and uploads a single image.

**Parameters:**
- `localPath` (string): Path to local image file
- `options` (object):
  - `width` (number): Max width in pixels (default: 800)
  - `quality` (number): WebP quality 0-100 (default: 80)
  - `folder` (string): S3 folder path (default: 'images')
  - `filename` (string): Custom filename (optional)

**Returns:**
```json
{
  "success": true,
  "url": "https://s3-url.com/image.webp"
}
```

### optimizeAndUploadMultiple(localPaths, options)
Optimizes and uploads multiple images in parallel.

**Parameters:**
- `localPaths` (array): Array of local image file paths
- `options` (object): Same as optimizeAndUpload

**Returns:**
```json
[
  {
    "success": true,
    "url": "https://s3-url.com/image1.webp"
  },
  {
    "success": true,
    "url": "https://s3-url.com/image2.webp"
  }
]
```

### generateResponsiveImages(localPath, options)
Generates multiple sizes of an image for responsive design.

**Parameters:**
- `localPath` (string): Path to local image file
- `options` (object):
  - `sizes` (array): Array of widths (default: [400, 800, 1200])
  - `quality` (number): WebP quality (default: 80)
  - `folder` (string): S3 folder path (default: 'images')

**Returns:**
```json
{
  "success": true,
  "urls": {
    "400w": "https://s3-url.com/400w.webp",
    "800w": "https://s3-url.com/800w.webp",
    "1200w": "https://s3-url.com/1200w.webp"
  }
}
```

## Environment Variables

Make sure these environment variables are set:

```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=your_region
AWS_BUCKET_NAME=your_bucket_name
```

## File Structure

```
backend/
├── uploads/           # Temporary upload directory (gitignored)
├── utils/
│   └── imageOptimizer.js  # Image optimization utilities
└── app.js            # Main application with upload routes
```

## Benefits

1. **Reduced bandwidth**: WebP format provides 25-35% smaller file sizes
2. **Faster loading**: Optimized images load faster for users
3. **Better UX**: Responsive images for different screen sizes
4. **Cost savings**: Reduced S3 storage and bandwidth costs
5. **Automatic cleanup**: No temporary files left on server

## Error Handling

The system includes comprehensive error handling:
- Invalid file types are rejected
- Processing errors are logged and cleaned up
- S3 upload failures are handled gracefully
- Local files are always cleaned up, even on errors

## Performance Considerations

- Images are processed asynchronously
- Multiple images are processed in parallel
- Temporary files are cleaned up immediately after processing
- S3 uploads include cache headers for better performance 