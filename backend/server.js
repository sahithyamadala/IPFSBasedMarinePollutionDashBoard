const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

require('dotenv').config();
console.log('✅ Loaded PINATA_API_KEY:', process.env.PINATA_API_KEY);
console.log('✅ Loaded PINATA_SECRET_API_KEY:', process.env.PINATA_SECRET_API_KEY);

const app = express();
app.use(cors({
  origin: ['http://localhost:3000'], // Add your React app's URL
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// MySQL connection pool
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Test MySQL connection
(async () => {
  try {
    const connection = await db.getConnection();
    console.log('✅ Connected to MySQL database');
    connection.release();
  } catch (err) {
    console.error('❌ Failed to connect to MySQL:', err.message);
  }
})();

// Test Pinata (IPFS) authentication
(async () => {
  try {
    const response = await axios.get('https://api.pinata.cloud/data/testAuthentication', {
      headers: {
        pinata_api_key: process.env.PINATA_API_KEY,
        pinata_secret_api_key: process.env.PINATA_SECRET_API_KEY,
      },
    });
    if (response.status === 200) {
      console.log('✅ Connected to Pinata (IPFS)');
    } else {
      console.warn('⚠️ Pinata auth returned status:', response.status);
    }
  } catch (error) {
    console.error('❌ Failed to connect to Pinata:', error.response?.data || error.message);
  }
})();

// JWT auth middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ message: 'Invalid or expired token' });
    req.user = user;
    next();
  });
};

// Check if user has authority role
const isAuthority = async (req, res, next) => {
  try {
    if (req.user.role !== 'authority') {
      return res.status(403).json({ message: 'Access denied. Authority role required.' });
    }
    next();
  } catch (error) {
    res.status(500).json({ message: 'Server error checking permissions' });
  }
};

// ========== AUTH ROUTES ==========

// Signup
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;
    const [existing] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query(
      'INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)',
      [name, email, phone, hashedPassword, role]
    );

    res.status(201).json({ message: 'User created successfully' });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ message: 'Signup failed' });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const [results] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (results.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      message: 'Login successful',
      role: user.role,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed' });
  }
});

// ========== PROTECTED ROUTE ==========

app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ message: 'This is a protected route', user: req.user });
});

// ========== IPFS / Pinata UPLOAD ==========

const upload = multer({ dest: 'uploads/' }); // temp storage

app.post('/api/upload-to-pinata', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ message: 'No file uploaded' });

  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(file.path));

    const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
      maxBodyLength: 'Infinity',
      headers: {
        ...formData.getHeaders(),
        pinata_api_key: process.env.PINATA_API_KEY,
        pinata_secret_api_key: process.env.PINATA_SECRET_API_KEY,
      },
    });

    // Cleanup uploaded file
    fs.unlinkSync(file.path);

    res.json({
      success: true,
      ipfsHash: response.data.IpfsHash,
      pinSize: response.data.PinSize,
      timestamp: response.data.Timestamp,
    });
  } catch (error) {
    console.error('❌ Pinata upload failed:', error.message);
    res.status(500).json({ message: 'Pinata upload failed', error: error.message });
  }
});

// ========== REPORT ROUTES ==========

// Get reports for regular users (only their own reports)
app.get('/api/user-reports', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const [reports] = await db.query('SELECT * FROM reports WHERE user_id = ?', [userId]);

    if (reports.length > 0) {
      res.status(200).json({ reports });
    } else {
      res.status(404).json({ message: 'No reports found' });
    }
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ message: 'Failed to fetch reports' });
  }
});

// Get all reports for authority users
app.get('/api/reports', authenticateToken, async (req, res) => {
  try {
    // Check if user is authority
    if (req.user.role !== 'authority') {
      return res.status(403).json({ message: 'Access denied' });
    }
    
    // For authority users, get all reports with user info
    const [reports] = await db.query(`
      SELECT r.*, u.name as user_name 
      FROM reports r
      JOIN users u ON r.user_id = u.id
      ORDER BY r.created_at DESC
    `);

    res.status(200).json({ reports });
  } catch (error) {
    console.error('Error fetching reports for authority:', error);
    res.status(500).json({ message: 'Failed to fetch reports' });
  }
});

// Submit a new report
app.post('/api/reports', authenticateToken, async (req, res) => {
  try {
    const { title, category, location, ipfs_hash } = req.body;
    const userId = req.user.id;

    console.log('Received report data:', req.body); // Log the incoming data
    
    await db.query(
      'INSERT INTO reports (user_id, title, category, location, ipfs_hash, status, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [userId, title, category, location, ipfs_hash || '', 'pending']
    );

    res.status(201).json({ message: 'Report submitted successfully' });
  } catch (error) {
    console.error('Error saving report:', error);
    res.status(500).json({ message: 'Failed to submit report' });
  }
});

// Get a specific report by ID
app.get('/api/reports/:id', authenticateToken, async (req, res) => {
  try {
    const reportId = req.params.id;
    const userId = req.user.id;
    const userRole = req.user.role;
    
    // Base query to get report with user info
    let query = `
      SELECT r.*, u.name as user_name 
      FROM reports r
      JOIN users u ON r.user_id = u.id
      WHERE r.id = ?
    `;
    
    // For regular users, add user ID restriction
    if (userRole !== 'authority') {
      query += ' AND r.user_id = ?';
      const [reports] = await db.query(query, [reportId, userId]);
      
      if (reports.length === 0) {
        return res.status(404).json({ message: 'Report not found or access denied' });
      }
      
      return res.status(200).json(reports[0]);
    } else {
      // For authority users, no additional restrictions
      const [reports] = await db.query(query, [reportId]);
      
      if (reports.length === 0) {
        return res.status(404).json({ message: 'Report not found' });
      }
      
      return res.status(200).json(reports[0]);
    }
  } catch (error) {
    console.error('Error fetching report:', error);
    res.status(500).json({ message: 'Failed to fetch report' });
  }
});
// Get report by IPFS hash (public endpoint)
app.get('/api/reports/ipfs/:cid', async (req, res) => {
  try {
    const cid = req.params.cid;

    const [reports] = await db.query('SELECT * FROM reports WHERE ipfs_hash = ?', [cid]);
    
    if (reports.length === 0) {
      return res.status(404).json({ success: false, message: 'Report not found with given CID' });
    }

    const report = reports[0];

    res.status(200).json({
      success: true,
      data: {
        id: report.id,
        title: report.title,
        category: report.category,
        location: report.location,
        description: report.description,
        submittedAt: report.created_at,
        attachments: `https://gateway.pinata.cloud/ipfs/${report.ipfs_hash}`
      }
    });
  } catch (error) {
    console.error('Error fetching report by IPFS hash:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch report by CID' });
  }
});


// Update report status endpoint for authorities
app.put('/api/reports/:id/status', authenticateToken, async (req, res) => {
  try {
    // Check if user is authority
    if (req.user.role !== 'authority') {
      return res.status(403).json({ message: 'Access denied. Authority role required.' });
    }
    
    const reportId = req.params.id;
    const { status } = req.body;
    
    // Validate status value
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }
    
    // Update the report status
    const [result] = await db.query(
      'UPDATE reports SET status = ? WHERE id = ?',
      [status, reportId]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    res.status(200).json({ 
      success: true, 
      message: 'Report status updated successfully',
      reportId,
      newStatus: status
    });
  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(500).json({ message: 'Failed to update report status' });
  }
});
 


// ========== START SERVER ==========

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});