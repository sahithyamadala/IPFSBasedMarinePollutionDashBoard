const express = require('express');
const router = express.Router();
const db = require('../db');

// Add a new report
router.post('/reports', (req, res) => {
  const { user_id, ipfs_hash, title, category, location } = req.body;

  console.log('Received report data:', req.body); // Log the incoming data

  const query = `
    INSERT INTO reports (user_id, ipfs_hash, title, category, location)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(query, [user_id, ipfs_hash, title, category, location], (err, result) => {
    if (err) {
      console.error('❌ Failed to insert report:', err);
      console.error('Error details:', err.message, err.code); // Log more error details
      return res.status(500).json({ error: 'Database error', details: err.message });
    }

    res.status(201).json({ message: 'Report saved successfully', reportId: result.insertId });
  });
});

// Get all reports
router.get('/reports', async (req, res) => {
  try {
    const [reports] = await db.query('SELECT * FROM reports');
    res.status(200).json({ reports });
  } catch (error) {
    console.error('Error fetching reports:', error);
    res.status(500).json({ message: 'Failed to fetch reports' });
  }
});

// Update report status
router.put('/reports/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const query = 'UPDATE reports SET status = ? WHERE id = ?';
    const result = await db.query(query, [status, id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }

    res.status(200).json({ success: true, message: 'Report status updated successfully' });
  } catch (error) {
    console.error('Error updating report status:', error);
    res.status(500).json({ message: 'Failed to update report status' });
  }
});

module.exports = router;