import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './AuthorityDashboard.css';

function AuthorityDashboard() {
  const [userData, setUserData] = useState({});
  const [reports, setReports] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [error, setError] = useState('');
  const [statusUpdateError, setStatusUpdateError] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [lastLoginTime, setLastLoginTime] = useState('');
  const [copySuccess, setCopySuccess] = useState(null);
  const navigate = useNavigate();

  const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');

      const response = await fetch(`${baseUrl}/api/reports`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.message || `Server error: ${response.status}`);
        } catch (e) {
          throw new Error(`Failed to fetch reports: ${response.status} ${response.statusText}`);
        }
      }

      const data = await response.json();
      console.log('Fetched reports data:', data);

      if (Array.isArray(data)) {
        setReports(data);
      } else if (data.reports && Array.isArray(data.reports)) {
        setReports(data.reports);
      } else {
        setReports([]);
        console.warn('Unexpected data format received:', data);
      }
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError(`Failed to load reports: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl]);

  useEffect(() => {
    const role = localStorage.getItem('role');
    const userDataStr = localStorage.getItem('userData');
    const loginTime = localStorage.getItem('lastLoginTime');

    if (!role || role !== 'authority' || !userDataStr) {
      navigate('/login');
      return;
    }

    if (loginTime) {
      setLastLoginTime(formatDateTime(loginTime));
    } else {
      // Set current time if first login
      const now = new Date().toISOString();
      localStorage.setItem('lastLoginTime', now);
      setLastLoginTime(formatDateTime(now));
    }

    try {
      const parsedUserData = JSON.parse(userDataStr);
      setUserData(parsedUserData);
      fetchReports();
    } catch (err) {
      console.error('Error parsing user data:', err);
      navigate('/login');
    }
  }, [navigate, fetchReports]);

  const handleStatusUpdate = async (reportId, newStatus) => {
    setStatusUpdateError('');
    setIsUpdating(true);

    try {
      if (!reportId || !['pending', 'approved', 'rejected'].includes(newStatus)) {
        throw new Error('Invalid parameters');
      }

      const token = localStorage.getItem('token');
      if (!token) throw new Error('No authentication token found');

      const response = await fetch(`${baseUrl}/api/reports/${reportId}/status`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.message || `Server error: ${response.status}`);
        } catch (e) {
          throw new Error(`Failed to update status: ${response.status} ${response.statusText}`);
        }
      }

      const result = await response.json();
      if (result && result.success === false) {
        throw new Error(result.message || 'Failed to update report status');
      }

      setReports(prev =>
        prev.map(r => (r.id === reportId ? { ...r, status: newStatus } : r))
      );
      setTimeout(fetchReports, 500);
    } catch (err) {
      console.error('Error updating report status:', err);
      setStatusUpdateError(`Error updating report status: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = () => {
    localStorage.clear();
    navigate('/login');
    window.location.reload();
  };

  const cancelLogout = () => {
    setShowLogoutConfirm(false);
  };

  const handleRetry = () => {
    fetchReports();
  };

  const handleCopyIpfsHash = async (hash, reportId) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopySuccess(reportId);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
      alert('Failed to copy IPFS hash to clipboard.');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString();
  };

  const formatDateTime = (dateTimeString) => {
    if (!dateTimeString) return 'Unknown';
    const date = new Date(dateTimeString);
    return date.toLocaleString();
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const getPendingReportsCount = () => {
    return reports.filter(report => report.status === 'pending').length;
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div className="welcome-section">
          <h1>{getGreeting()}, {userData.name || 'Authority User'}</h1>
          <p className="welcome-message">
            You have <strong>{getPendingReportsCount()}</strong> pending reports to review. 
            Last login: {lastLoginTime || 'First login'}
          </p>
        </div>
        <button onClick={handleLogout} className="logout-button">Logout</button>
      </header>

      <main className="dashboard-content">
        <section className="reports-section">
          <h2>Reports Management</h2>

          {error && (
            <div className="error-message">
              {error}
              <button onClick={handleRetry} className="retry-button">Retry</button>
            </div>
          )}

          {statusUpdateError && <div className="error-message">{statusUpdateError}</div>}

          {isLoading ? (
            <div className="loading">Loading reports...</div>
          ) : reports.length > 0 ? (
            <div className="reports-list">
              {reports.map(report => (
                <div key={report.id} className="report-card">
                  <h3>{report.title || 'Untitled Report'}</h3>
                  <p className="report-metadata">
                    Submitted by: {report.user_name || 'Unknown'} | Date: {formatDate(report.created_at)}
                  </p>
                  <p className="report-status">Status: {report.status || 'pending'}</p>
                  
                  {/* IPFS Hash Display and Copy Feature */}
                  <div className="report-ipfs-hash">
                    <span><strong>IPFS Hash:</strong></span>
                    <span className="report-ipfs-hash-value">{report.ipfs_hash || 'Not available'}</span>
                    {report.ipfs_hash && (
                      <button
                        className="copy-button"
                        onClick={() => handleCopyIpfsHash(report.ipfs_hash, report.id)}
                      >
                        {copySuccess === report.id ? 'Copied!' : 'Copy'}
                      </button>
                    )}
                  </div>
                  
                  <div className="report-actions">
                    <button 
                      onClick={() => navigate(`/reports/view/${report.id}`)} 
                      className="view-button"
                    >
                      View Details
                    </button>
                    <div className="status-buttons">
                      <button
                        className={`status-button approve ${isUpdating || report.status === 'approved' ? 'disabled' : ''}`}
                        onClick={() => handleStatusUpdate(report.id, 'approved')}
                        disabled={isUpdating || report.status === 'approved'}
                      >
                        Approve
                      </button>
                      <button
                        className={`status-button reject ${isUpdating || report.status === 'rejected' ? 'disabled' : ''}`}
                        onClick={() => handleStatusUpdate(report.id, 'rejected')}
                        disabled={isUpdating || report.status === 'rejected'}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-reports">
              <p>No reports available at this time.</p>
            </div>
          )}
        </section>
      </main>

      {showLogoutConfirm && (
        <div className="logout-modal-overlay">
          <div className="logout-modal">
            <h3>Confirm Logout</h3>
            <p>Are you sure you want to log out of the system?</p>
            <div className="logout-modal-buttons">
              <button onClick={confirmLogout} className="confirm-logout-button">Yes, Logout</button>
              <button onClick={cancelLogout} className="cancel-logout-button">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuthorityDashboard;