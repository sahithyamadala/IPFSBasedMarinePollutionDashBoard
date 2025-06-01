const express = require('express');
const router = express.Router();
const multer = require('multer');
const FormData = require('form-data');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configure multer storage
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 } // Limit file size to 10MB
});

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Route to upload file to Pinata
router.post('/upload-to-pinata', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  console.log('Received file:', req.file);
  console.log('API Key available:', !!process.env.PINATA_API_KEY);
  console.log('API Secret available:', !!process.env.PINATA_API_SECRET);
  
  if (!process.env.PINATA_API_KEY || !process.env.PINATA_API_SECRET) {
    return res.status(500).json({ 
      success: false, 
      error: 'Pinata API credentials not configured' 
    });
  }

  try {
    const fileStream = fs.createReadStream(req.file.path);
    const formData = new FormData();

    formData.append('file', fileStream, { filename: req.file.originalname });

    const pinataOptions = JSON.stringify({
      pinataMetadata: {
        name: req.file.originalname,
        keyvalues: {
          uploadDate: new Date().toISOString(),
          fileSize: req.file.size,
          mimeType: req.file.mimetype
        }
      }
    });
    formData.append('pinataOptions', pinataOptions);

    console.log('Sending request to Pinata...');
    
    const pinataRes = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
      maxBodyLength: Infinity,
      headers: {
        ...formData.getHeaders(),
        pinata_api_key: process.env.PINATA_API_KEY,
        pinata_secret_api_key: process.env.PINATA_API_SECRET
      }
    });
    
    console.log('Pinata response:', pinataRes.data);

    res.json({
      success: true,
      message: 'File uploaded to IPFS successfully',
      ipfsHash: pinataRes.data.IpfsHash,  // This is the field from Pinata
      pinSize: pinataRes.data.PinSize,
      timestamp: pinataRes.data.Timestamp
    });
  } catch (err) {
    console.error('Pinata upload failed:', err);

    if (err.response) {
      console.error('Status:', err.response.status);
      console.error('Headers:', JSON.stringify(err.response.headers));
      console.error('Data:', JSON.stringify(err.response.data));
    }

    res.status(500).json({
      success: false,
      error: 'Failed to upload to Pinata',
      details: err.message,
      responseData: err.response?.data || null
    });
  } finally {
    // Clean up temporary file
    fs.unlink(req.file.path, (err) => {
      if (err) console.error('Failed to delete temporary file:', err);
    });
  }
});

// Test route
router.get('/test-pinata-route', (req, res) => {
  res.json({ message: 'Pinata route is correctly registered' });
});

module.exports = router;