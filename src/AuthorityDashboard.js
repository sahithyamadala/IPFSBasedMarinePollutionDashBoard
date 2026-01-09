import React, { useEffect, useState, useCallback, useRef } from 'react';
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
  const [isClassifying, setIsClassifying] = useState(false);
  const [classificationError, setClassificationError] = useState('');
  const [predictServiceAvailable, setPredictServiceAvailable] = useState(true);

  const navigate = useNavigate();
  const hasInitialized = useRef(false);
  const isClassifyingRef = useRef(false);

  const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  const PREDICT_SERVICE_URL = process.env.REACT_APP_PREDICT_SERVICE_URL || 'http://localhost:5001';

  const buildImageUrls = (report) => {
    const urls = new Set();
    [report.image_url, report.image, report.imageUrl, report.img_url, report.photo_url, report.picture, report.thumbnail, report.url]
      .forEach(u => { if (u) urls.add(u); });

    if (report.ipfs_hash) {
      const cid = report.ipfs_hash.trim();
      if (cid) {
        urls.add(`https://gateway.pinata.cloud/ipfs/${cid}`);
        urls.add(`https://ipfs.io/ipfs/${cid}`);
        urls.add(`https://cloudflare-ipfs.com/ipfs/${cid}`);
      }
    }
    return Array.from(urls).filter(Boolean);
  };

  const classifyReports = async (reportsArray) => {
    if (!reportsArray || reportsArray.length === 0 || isClassifyingRef.current) {
      setIsClassifying(false);
      return;
    }
    
    isClassifyingRef.current = true;
    setIsClassifying(true);
    const token = localStorage.getItem('token');

    // Process each report and update state IMMEDIATELY after each classification
    for (const report of reportsArray) {
      if (report.predicted_label && !['none', 'unknown', 'undetected'].includes(report.predicted_label)) {
        continue;
      }

      const candidates = buildImageUrls(report);
      if (candidates.length === 0) {
        // Update immediately for no-image reports
        setReports(prev => prev.map(r => r.id === report.id ? { ...r, predicted_label: 'undetected', plastic_prob: 0, oil_prob: 0 } : r));
        continue;
      }

      let classified = false;
      for (const imageUrl of candidates) {
        try {
          const resp = await fetch(`${PREDICT_SERVICE_URL}/predict_url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ image_url: imageUrl })
          });

          if (resp.ok) {
            const data = await resp.json();
            const label = data.predicted_label || 'undetected';
            console.info(`✅ Report ${report.id} → ${label}`);
            
            // UPDATE STATE IMMEDIATELY after each successful classification
            setReports(prev => prev.map(r => r.id === report.id ? {
              ...r,
              predicted_label: label,
              plastic_prob: data.plastic_prob ?? 0,
              oil_prob: data.oil_prob ?? 0,
              is_water_detection: data.is_water_detection || false
            } : r));
            
            classified = true;
            break;
          }
        } catch (e) {
          console.warn(`Failed ${report.id}:`, e.message);
        }
      }

      if (!classified) {
        setReports(prev => prev.map(r => r.id === report.id ? { ...r, predicted_label: 'undetected', plastic_prob: 0, oil_prob: 0 } : r));
      }
    }

    isClassifyingRef.current = false;
    setIsClassifying(false);
  };

  const fetchReports = useCallback(async () => {
    setIsLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('No token');

      const response = await fetch(`${baseUrl}/api/reports`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        cache: 'no-store'
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const list = Array.isArray(data) ? data : (data.reports || []);
      setReports(list);

      // Check prediction service
      try {
        const healthResp = await fetch(`${PREDICT_SERVICE_URL}/health`);
        if (healthResp.ok) {
          setPredictServiceAvailable(true);
          setClassificationError('');
          classifyReports(list);
        } else {
          setPredictServiceAvailable(false);
          setClassificationError('Prediction service unavailable');
        }
      } catch {
        setPredictServiceAvailable(false);
        setClassificationError('Prediction service unreachable');
      }
    } catch (err) {
      setError(`Failed to load reports: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [baseUrl, PREDICT_SERVICE_URL]);

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    const role = localStorage.getItem('role');
    const userDataStr = localStorage.getItem('userData');

    if (role !== 'authority' || !userDataStr) {
      navigate('/login');
      return;
    }

    try {
      setUserData(JSON.parse(userDataStr));
      setLastLoginTime(new Date().toLocaleString());
      fetchReports();
    } catch {
      navigate('/login');
    }
  }, [navigate, fetchReports]);

  const handleStatusUpdate = async (reportId, newStatus) => {
    setStatusUpdateError('');
    setIsUpdating(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${baseUrl}/api/reports/${reportId}/status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      if (!response.ok) throw new Error('Failed');
      setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: newStatus } : r));
    } catch (err) {
      setStatusUpdateError(err.message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleLogout = () => setShowLogoutConfirm(true);
  const confirmLogout = () => { localStorage.clear(); navigate('/login'); };
  const cancelLogout = () => setShowLogoutConfirm(false);

  const toPct = (v) => v != null ? `${Math.round(v * 100)}%` : '—';

  const formatLabel = (label) => {
    if (!label) return 'Not classified';
    return label.charAt(0).toUpperCase() + label.slice(1).replace('_', ' ');
  };

  const renderReport = (report) => {
    // Use predicted_label from ML, NOT the original category from form
    const displayLabel = report.predicted_label || 'undetected';
    const isWater = report.is_water_detection === true;
    
    return (
      <div key={report.id} className="report-card">
        <h3>{report.title || 'Untitled Report'}</h3>
        <p className="report-metadata">By: {report.user_name || 'Unknown'} | {new Date(report.created_at).toLocaleDateString()}</p>
        <p className="report-status">Status: {report.status || 'pending'}</p>
        
        {/* Show original category from form (for reference only) */}
        <p className="report-category" style={{color: '#888', fontSize: '0.85em'}}>
          Original Category: {report.category || 'Not specified'}
        </p>
        
        <div className="report-ml">
          {/* ML PREDICTION - This is what matters! */}
          <p><strong>AI Prediction:</strong> {
            isWater 
              ? '💧 Clean Water (No Pollution)' 
              : formatLabel(displayLabel)
          }</p>
          
          {/* Show probabilities only if NOT water */}
          {!isWater && (report.plastic_prob != null || report.oil_prob != null) && (
            <div className="prediction-probs">
              <span>Plastic: <strong>{toPct(report.plastic_prob)}</strong></span>
              <span>Oil: <strong>{toPct(report.oil_prob)}</strong></span>
            </div>
          )}
          
          {/* Show water detection badge */}
          {isWater && (
            <div style={{color: '#17a2b8', fontWeight: 'bold', marginTop: '5px'}}>
              ✓ Water detected - No pollution found
            </div>
          )}
        </div>

        {/* IPFS Hash - Fixed block display */}
        <div className="report-ipfs-hash" style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '12px',
          backgroundColor: '#f8f9fa',
          borderRadius: '8px',
          marginTop: '10px',
          marginBottom: '10px'
        }}>
          <strong style={{fontSize: '0.9em', color: '#495057'}}>IPFS Hash:</strong>
          {report.ipfs_hash ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap'
            }}>
              <code style={{
                backgroundColor: '#e9ecef',
                padding: '8px 12px',
                borderRadius: '4px',
                fontSize: '0.85em',
                wordBreak: 'break-all',
                flex: '1',
                minWidth: '200px',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {report.ipfs_hash}
              </code>
              <button 
                className="copy-button" 
                onClick={() => navigator.clipboard.writeText(report.ipfs_hash).then(() => setCopySuccess(report.id))}
                style={{
                  padding: '6px 12px',
                  backgroundColor: copySuccess === report.id ? '#28a745' : '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.85em',
                  whiteSpace: 'nowrap'
                }}
              >
                {copySuccess === report.id ? '✓ Copied!' : 'Copy'}
              </button>
            </div>
          ) : (
            <span style={{color: '#6c757d', fontStyle: 'italic'}}>Not available</span>
          )}
        </div>

        <div className="report-actions">
          <button onClick={() => navigate(`/reports/view/${report.id}`)} className="view-button">View</button>
          <button className="status-button approve" onClick={() => handleStatusUpdate(report.id, 'approved')} disabled={isUpdating || report.status === 'approved'}>Approve</button>
          <button className="status-button reject" onClick={() => handleStatusUpdate(report.id, 'rejected')} disabled={isUpdating || report.status === 'rejected'}>Reject</button>
        </div>
      </div>
    );
  };

  // FIX: Categorize by predicted_label (ML result), NOT original category
  const plasticReports = reports.filter(r => r.predicted_label === 'plastic');
  const oilReports = reports.filter(r => r.predicted_label === 'oil_spill');
  const cleanWaterReports = reports.filter(r => 
    r.predicted_label === 'undetected' || 
    r.predicted_label === 'none' || 
    r.is_water_detection === true ||
    !r.predicted_label
  );

  // Add this right before the return statement to debug
  console.log('=== REPORTS STATE ===');
  console.log('Plastic:', plasticReports.map(r => ({ id: r.id, label: r.predicted_label })));
  console.log('Oil:', oilReports.map(r => ({ id: r.id, label: r.predicted_label })));
  console.log('Water/None:', cleanWaterReports.map(r => ({ id: r.id, label: r.predicted_label, isWater: r.is_water_detection })));

  return (
    <div className="dashboard-container">
      {!predictServiceAvailable && <div className="error-message">{classificationError}</div>}
      
      <header className="dashboard-header">
        <div className="welcome-section">
          <h1>Welcome, {userData.name || 'Authority'}</h1>
          <p>{reports.filter(r => r.status === 'pending').length} pending reports</p>
        </div>
        <div className="header-actions">
          <button onClick={fetchReports} className="refresh-button">Refresh</button>
          <button onClick={handleLogout} className="logout-button">Logout</button>
        </div>
      </header>

      <main className="dashboard-content">
        <section className="reports-section">
          <h2>Reports {isClassifying && <span style={{fontSize: '0.8em', color: '#888'}}>(classifying...)</span>}</h2>

          {error && <div className="error-message">{error}</div>}
          {statusUpdateError && <div className="error-message">{statusUpdateError}</div>}

          {isLoading ? <div className="loading">Loading...</div> : (
            <>
              {plasticReports.length > 0 && (
                <div className="reports-category-section">
                  <div className="category-header plastic-header"><h3>🔴 Plastic ({plasticReports.length})</h3></div>
                  <div className="reports-list">{plasticReports.map(renderReport)}</div>
                </div>
              )}

              {oilReports.length > 0 && (
                <div className="reports-category-section">
                  <div className="category-header oil-header"><h3>⚫ Oil Spill ({oilReports.length})</h3></div>
                  <div className="reports-list">{oilReports.map(renderReport)}</div>
                </div>
              )}

              {cleanWaterReports.length > 0 && (
                <div className="reports-category-section">
                  <div className="category-header none-header"><h3>💧 Clean Water / No Detection ({cleanWaterReports.length})</h3></div>
                  <div className="reports-list">{cleanWaterReports.map(renderReport)}</div>
                </div>
              )}

              {reports.length === 0 && <div className="no-reports">No reports available</div>}
            </>
          )}
        </section>
      </main>

      {showLogoutConfirm && (
        <div className="logout-modal-overlay">
          <div className="logout-modal">
            <h3>Logout?</h3>
            <button onClick={confirmLogout}>Yes</button>
            <button onClick={cancelLogout}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default AuthorityDashboard;