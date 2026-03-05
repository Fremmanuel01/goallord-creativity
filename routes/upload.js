const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// POST /api/upload — protected, single image
router.post('/', requireAuth, async (req, res) => {
  try {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key:    process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });

    const multer = require('multer');
    const { CloudinaryStorage } = require('multer-storage-cloudinary');

    const storage = new CloudinaryStorage({
      cloudinary,
      params: {
        folder: 'goallord',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        transformation: [{ width: 1200, crop: 'limit', quality: 'auto' }]
      }
    });

    const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }).single('image');

    upload(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      res.json({ url: req.file.path, public_id: req.file.filename });
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
