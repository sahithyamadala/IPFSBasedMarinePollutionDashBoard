// src/ViewReport.jsx
import React, { useState, useEffect } from 'react';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './ViewReport.css';

const ViewReport = () => {
  const [cid, setCid] = useState('');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const savedCid = localStorage.getItem('lastCID');
    const savedReport = localStorage.getItem('lastReport');

    if (savedCid && savedReport) {
      setCid(savedCid);
      setReport(JSON.parse(savedReport));
    }
  }, []);

  const handleFetchReport = async (e) => {
    e.preventDefault();

    if (!cid.trim()) {
      toast.error('Please enter a valid IPFS hash (CID)');
      return;
    }

    const isValidCid = /^[A-Za-z0-9]{46}$/.test(cid);
    if (!isValidCid) {
      toast.error('Please enter a valid IPFS hash (CID)');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');

      if (!token) {
        toast.error('You are not logged in. Please log in first.');
        setLoading(false);
        return;
      }

      const response = await fetch(`http://localhost:5000/api/reports/ipfs/${cid}`, {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      

      if (!response.ok) {
        throw new Error(`Failed to fetch report. Status: ${response.status}`);
      }

      const result = await response.json();
      console.log(result);

      if (result.success) {
        if (!result.data.submittedAt || !result.data.attachments) {
          toast.warning('Some report details are missing (e.g., date or attachments).');
        }

        setReport(result.data);

        localStorage.setItem('lastCID', cid);
        localStorage.setItem('lastReport', JSON.stringify(result.data));

        toast.success('Report retrieved successfully!');
      } else {
        toast.error('Failed to retrieve report');
      }
    } catch (error) {
      console.error('Error fetching report:', error);
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date) => {
    return date ? new Date(date).toLocaleString() : 'Date not available';
  };

  return (
    <div className="view-report-container">
      <h2>View IPFS Report</h2>

      <form onSubmit={handleFetchReport}>
        <div className="form-group">
          <label htmlFor="cid">IPFS Hash (CID)</label>
          <input
            type="text"
            id="cid"
            value={cid}
            onChange={(e) => setCid(e.target.value)}
            placeholder="Enter IPFS hash..."
            required
          />
        </div>

        <button type="submit" disabled={loading}>
          {loading ? 'Fetching...' : 'Fetch Report'}
        </button>
      </form>

      {report && (
        <div className="report-display">
          <h3>{report.title}</h3>
          <p><strong>Submitted:</strong> {formatDate(report.submittedAt)}</p>
          <p><strong>Category:</strong> {report.category}</p>
          <p><strong>Location:</strong> {report.location}</p>
          <div className="report-description">
            <h4>Description:</h4>
            <p>{report.description}</p>
          </div>

          {report.attachments && report.attachments !== '' ? (
            <div className="report-attachment">
              <h4>Attachment:</h4>
              <img src={report.attachments} alt="Report attachment" style={{ maxWidth: '100%' }} />
            </div>
          ) : (
            <p>No attachment available</p>
          )}
        </div>
      )}

      <ToastContainer position="bottom-right" />
    </div>
  );
};

export default ViewReport;
