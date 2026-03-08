const express = require('express');
const multer  = require('multer');
const cloudinary = require('cloudinary').v2;           // v2 required by multer-storage-cloudinary@4
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Configure once at module level (not per-request)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder:          'goallord',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
    transformation:  [{ width: 1200, crop: 'limit', quality: 'auto' }]
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }  // 5 MB
}).single('image');

// POST /api/upload — protected, single image
router.post('/', requireAuth, (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      console.error('Upload error:', err.message);
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file received. Make sure the field name is "image".' });
    }
    res.json({ url: req.file.path, public_id: req.file.filename });
  });
});

module.exports = router;
