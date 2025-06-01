import React, { useState, useEffect } from 'react';
import './Dashboard.css'; // CSS styles defined below
import axios from 'axios';
import { useNavigate } from 'react-router-dom';



const Dashboard = () => {
  const [currentView, setCurrentView] = useState('home');
  const [currentMode, setCurrentMode] = useState('public');
  const [reports, setReports] = useState([]);
  const [showSubmissionSuccess, setShowSubmissionSuccess] = useState(false);
  const [filterType, setFilterType] = useState('All Types');
const [filterStatus, setFilterStatus] = useState('All Statuses');
const [authError, setAuthError] = useState(false);
const [searchQuery, setSearchQuery] = useState('');
const navigate = useNavigate();
  const [formData, setFormData] = useState({
    type: 'Oil Spill',
    location: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    severity: 'Medium',
    area: '',
    images: []
  });
    const fetchReports = async () => {
    try {
      const token = localStorage.getItem('token');
      
      if (!token) {
        setAuthError(true);
        console.error('No token found');
        return;
      }
      
      // Rest of your fetch logic...
      const res = await axios.get('http://localhost:5000/api/user-reports', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
  
      
      if (res.data.reports && Array.isArray(res.data.reports)) {
        const normalizedReports = res.data.reports.map((r, i) => ({
          id: r.id || `RPT${i + 1}`,
          date: r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : 'Unknown',
          type: r.category || 'Unknown',
          location: r.location || 'Unknown',
          status: r.status || 'Unknown',
          ipfsHash: r.ipfs_hash || 'Unknown',
        }));
        setReports(normalizedReports);
        setAuthError(false);
      }
    } catch (error) {
      // Check if it's an authentication error
      if (error.response && (error.response.status === 401 || error.response.status === 403)) {
        setAuthError(true);
        // Token is invalid, clear it
        localStorage.removeItem('authToken');
      }
      console.error('Failed to fetch reports:', error.response?.data || error.message);
    }
  };
  
  useEffect(() => {
    fetchReports();
  }, []);

  
  const handleSubmit = async (e) => {
    e.preventDefault();
  
    const token = localStorage.getItem('token');
    if (!token) {
      alert('You are not logged in. Please log in to submit the report.');
      return;
    }
  
    try {
      if (formData.images.length === 0) {
        alert("Please upload at least one image.");
        return;
      }
  
      // Try to extract user ID from token (for debugging/logging only)
      const tokenParts = token.split('.');
      let userId;
      try {
        const payload = JSON.parse(atob(tokenParts[1]));
        userId = payload.id;
      } catch {
        console.warn("Could not extract user ID from token, using fallback");
        userId = 1;
      }
  
      // Upload file to Pinata
      const fileData = new FormData();
      fileData.append('file', formData.images[0].file);
  
      console.log("Uploading file to Pinata...");
      const pinataResponse = await axios.post('http://localhost:5000/api/upload-to-pinata', fileData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${token}`,
        },
      });
  
      const ipfsHash = pinataResponse.data.ipfsHash;
      if (!ipfsHash) throw new Error("No IPFS hash returned from upload");
  
      console.log("IPFS Hash:", ipfsHash);
  
      // Submit report to backend
      console.log("Saving report to database...");
      const dbResponse = await axios.post('http://localhost:5000/api/reports', {
        title: formData.description,
        category: formData.type,
        location: formData.location,
        ipfs_hash: ipfsHash,
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
  
      console.log("Database response:", dbResponse.data);
  
      // Refresh only this user's reports
      const refreshed = await axios.get('http://localhost:5000/api/user-reports', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
  
      setReports(refreshed.data.reports || []);
      setShowSubmissionSuccess(true);
  
      // Reset form
      setFormData({
        type: 'Oil Spill',
        location: '',
        description: '',
        date: new Date().toISOString().split('T')[0],
        severity: 'Medium',
        area: '',
        images: [],
      });
  
    } catch (error) {
      console.error("Upload failed:", error);
      if (error.response) {
        console.error("Response data:", error.response.data);
        console.error("Response status:", error.response.status);
      }
      alert(`Upload failed: ${error.response?.data?.message || error.message}`);
    }
  };
  
  
  // Handle navigation
  const navigateTo = (route) => {
    setCurrentView(route);
    if (route === 'reports') {
    fetchReports();
  }
    // Hide submission success when navigating away
    if (route !== 'submit') {
      setShowSubmissionSuccess(false);
    }
  };

  // Toggle between different modes
  const switchMode = (mode) => {
    setCurrentMode(mode);
  };
  
  // Handle form input changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
  };
  
  // Handle file selection
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    
    // Create preview URLs for selected images
    const imageFiles = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      name: file.name
    }));
    
    setFormData({
      ...formData,
      images: [...formData.images, ...imageFiles]
    });
  };
  
  // Remove selected image
  const removeImage = (index) => {
    const updatedImages = [...formData.images];
    
    // Revoke object URL to prevent memory leaks
    URL.revokeObjectURL(updatedImages[index].preview);
    
    updatedImages.splice(index, 1);
    setFormData({
      ...formData,
      images: updatedImages
    });
  };
  
  
  
  const pollutionTypeData = [
    { type: 'Oil Spill', count: 78, color: '#e74c3c' },
    { type: 'Plastic Waste', count: 112, color: '#3498db' },
    { type: 'Chemical Runoff', count: 43, color: '#f39c12' },
    { type: 'Sewage', count: 14, color: '#9b59b6' }
  ];
  
  const filteredReports = reports.filter(report => {
    const matchesSearch = 
      searchQuery === '' || 
      Object.values(report).some(value => 
        String(value).toLowerCase().includes(searchQuery.toLowerCase())
      );
    
    const matchesType = 
      filterType === 'All Types' || 
      report.type === filterType;
    
    const matchesStatus = 
      filterStatus === 'All Statuses' || 
      report.status === filterStatus.toLowerCase();
    
    return matchesSearch && matchesType && matchesStatus;
  });
  const handleLoginRedirect = () => {
    // Clear any remaining token to ensure a fresh login
    localStorage.removeItem('authToken');
    // Direct navigation to login page
    window.location.href = '/login';
  };
  
  const handleLogout = () => {
    console.log('Logout button clicked'); // Debugging log
    localStorage.removeItem('token'); // Clear the token
    navigate('/login'); // Redirect to the login page
  };

  
  
  
  const reportsArray = Array.isArray(reports) ? reports : [];

  // Render the appropriate content based on current view
  const renderContent = () => {
    switch (currentView) {
      case 'reports':
        return (
          <section className="reports-view content-section">
            {authError ? (
              <div className="auth-error">
                <h3>Authentication Error</h3>
                <p>You need to log in to view this content.</p>
                <button 
                  onClick={handleLoginRedirect}
                  className="login-btn"
                >
                  Go to Login
                </button>
              </div>
            ) : (
              <>
                <div className="section-header">
                  <h2>Reports Database</h2>
                  <div className="filter-controls">
                    <input
                      type="text"
                      placeholder="Search reports..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
                      <option>All Types</option>
                      <option>Oil Spill</option>
                      <option>Plastic Waste</option>
                      <option>Chemical Runoff</option>
                      <option>Sewage</option>
                    </select>
                    <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                      <option>All Statuses</option>
                      <option>Verified</option>
                      <option>Pending</option>
                      <option>Investigating</option>
                    </select>
                  </div>
                </div>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Location</th>
                        <th>Status</th>
                        <th>IPFS Hash</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReports.map((report) => (
                        <tr key={report.id}>
                          <td>{report.id}</td>
                          <td>{report.date}</td>
                          <td>{report.type}</td>
                          <td>{report.location}</td>
                          <td>
                            <span className={`status-badge ${report.status || 'unknown'}`}>
                              {(report.status && report.status.charAt(0).toUpperCase() + report.status.slice(1)) || 'Unknown'}
                            </span>
                          </td>
                          <td>{report.ipfsHash}</td>
                          <td>
                            <div className="action-buttons">
                              <button className="action-btn view">View</button>
                              <button className="action-btn">Details</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        );
      case 'map':
        return (
          <section className="map-view content-section">
    <div className="section-header">
      <h2>Pollution Map</h2>
      <div className="map-controls">
        <select>
          <option>All Pollution Types</option>
          <option>Oil Spill</option>
          <option>Plastic Waste</option>
        </select>
        <select>
          <option>Last 30 Days</option>
          <option>Last 90 Days</option>
          <option>Last Year</option>
          <option>All Time</option>
        </select>
        <button className="control-btn">Show Heatmap</button>
      </div>
    </div>
    <div className="map-container">
      <div className="interactive-map">
        <div className="map-placeholder">
          <h3>Interactive Global Marine Pollution Map</h3>
          <p>Displaying {reportsArray.length} pollution incidents worldwide</p>
          <div className="map-markers">
            {reportsArray.length > 0 ? (
              reportsArray.map((report, index) => (
                <span 
                  key={index}
                  className={`marker ${report && report.type ? report.type.toLowerCase().replace(' ', '-') : 'unknown'}`} 
                  style={{ 
                    top: `${20 + (index * 10) % 60}%`, 
                    left: `${15 + (index * 15) % 70}%` 
                  }}
                ></span>
              ))
            ) : (
              <p>No data available or loading map data...</p>
            )}
          </div>
        </div>
      </div>
      <div className="map-sidebar">
        <div className="map-legend">
          <h4>Legend</h4>
          <div className="legend-item">
            <span className="legend-color oil"></span>
            <span>Oil Spill</span>
          </div>
          <div className="legend-item">
            <span className="legend-color plastic"></span>
            <span>Plastic Waste</span>
          </div>
          <div className="legend-item">
            <span className="legend-color chemical"></span>
            <span>Chemical Runoff</span>
          </div>
        </div>
        <div className="hotspot-list">
          <h4>Pollution Hotspots</h4>
          <ul>
            <li>Gulf of Mexico - 27 incidents</li>
            <li>Mediterranean Sea - 21 incidents</li>
            <li>South China Sea - 18 incidents</li>
            <li>North Sea - 15 incidents</li>
          </ul>
        </div>
      </div>
    </div>
    </section>
        );

      case 'submit':
        return (
          <section className="report-form-section content-section">
            <div className="section-header">
              <h2>Submit a Pollution Report</h2>
              <p>Please provide as much detail as possible to help verify the incident</p>
            </div>
            
            {showSubmissionSuccess && (
              <div className="success-message">
                <div className="success-icon">✓</div>
                <div className="success-content">
                  <h3>Report Submitted Successfully!</h3>
                  <p>Your pollution report has been recorded on the blockchain and added to our database.</p>
                  <p>Report ID: <strong>{reports[0].id}</strong></p>
                  <div className="success-actions">
                    <button onClick={() => navigateTo('reports')} className="view-reports-btn">View All Reports</button>
                    <button onClick={() => setShowSubmissionSuccess(false)} className="new-report-btn">Submit Another Report</button>
                  </div>
                </div>
              </div>
            )}
            
            {!showSubmissionSuccess && (
              <div className="form-container">
                <form className="report-form" onSubmit={handleSubmit}>
                  <div className="form-grid">
                    <div className="form-group">
                      <label>Pollution Type</label>
                      <select 
                        className="form-input"
                        name="type"
                        value={formData.type}
                        onChange={handleInputChange}
                      >
                        <option>Oil Spill</option>
                        <option>Plastic Waste</option>
                        <option>Chemical Runoff</option>
                        <option>Sewage</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Date Observed</label>
                      <input 
                        className="form-input"
                        type="date"
                        name="date"
                        value={formData.date}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>Location</label>
                      <input 
                        className="form-input"
                        type="text"
                        placeholder="Coordinates or description"
                        name="location"
                        value={formData.location}
                        onChange={handleInputChange}
                        required
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>Description</label>
                      <textarea 
                        className="form-input"
                        placeholder="Detailed description of the incident"
                        rows="5"
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        required
                      ></textarea>
                    </div>
                    <div className="form-group">
                      <label>Severity (Estimated)</label>
                      <select
                        className="form-input"
                        name="severity"
                        value={formData.severity}
                        onChange={handleInputChange}
                      >
                        <option>Low</option>
                        <option>Medium</option>
                        <option>High</option>
                        <option>Critical</option>
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Area Affected (sq km)</label>
                      <input
                        className="form-input"
                        type="number"
                        step="0.1"
                        name="area"
                        value={formData.area}
                        onChange={handleInputChange}
                      />
                    </div>
                    <div className="form-group full-width">
                      <label>Evidence Images</label>
                      <div className="file-upload">
                        <input 
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleFileSelect}
                          id="file-input"
                        />
                        <label htmlFor="file-input">
                          <div className="upload-icon">📷</div>
                          <p>Drag images here or click to browse</p>
                        </label>
                      </div>
                      
                      {formData.images.length > 0 && (
                        <div className="image-previews">
                          {formData.images.map((image, index) => (
                            <div className="image-preview" key={index}>
                              <img src={image.preview} alt={`Preview ${index}`} />
                              <div className="image-preview-info">
                                <span className="image-name">{image.name}</span>
                                <button 
                                  type="button" 
                                  className="remove-image"
                                  onClick={() => removeImage(index)}
                                >×</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="form-footer">
                    <button type="submit" className="submit-btn">Submit Report</button>
                    <button type="reset" className="reset-btn">Reset Form</button>
                  </div>
                </form>
                <div className="form-sidebar">
                  <div className="info-box">
                    <h4>Why Report Pollution?</h4>
                    <p>Your reports help create a comprehensive database of marine pollution incidents, enabling better response and prevention measures worldwide.</p>
                  </div>
                  <div className="info-box">
                    <h4>What Happens Next?</h4>
                    <p>Once submitted, your report will be:</p>
                    <ol>
                      <li>Stored on IPFS (decentralized storage)</li>
                      <li>Registered on the blockchain for verification</li>
                      <li>Reviewed by our expert panel</li>
                      <li>Made available to authorities and researchers</li>
                    </ol>
                  </div>
                </div>
              </div>
            )}
          </section>
        );
      default: // home
        return (
          <>
            <section className="dashboard-summary content-section">
  <div className="grid-container">
    <div className="stat-card blue">
      <div className="stat-icon total"></div>
      <div className="stat-details">
        <h3>Total Reports</h3>
        <p className="stat-number">{Array.isArray(reports) ? reports.length : 0}</p>
        <p className="stat-trend positive">Active Monitoring</p>
      </div>
    </div>

    <div className="stat-card green">
      <div className="stat-icon verified"></div>
      <div className="stat-details">
        <h3>Verified Incidents</h3>
        <p className="stat-number">
          {Array.isArray(reports) ? reports.filter(r => r.status === 'verified').length : 0}
        </p>
        <p className="stat-trend positive">Confirmed Data</p>
      </div>
    </div>

    <div className="stat-card orange">
      <div className="stat-icon cleanup"></div>
      <div className="stat-details">
        <h3>Pending Review</h3>
        <p className="stat-number">
          {Array.isArray(reports) ? reports.filter(r => r.status === 'pending').length : 0}
        </p>
        <p className="stat-trend positive">Under Investigation</p>
      </div>
    </div>

    <div className="stat-card purple">
      <div className="stat-icon funding"></div>
      <div className="stat-details">
        <h3>Participating Countries</h3>
        <p className="stat-number">24</p>
        <p className="stat-trend positive">Global Initiative</p>
      </div>
    </div>
  </div>

  <div className="chart-container">
    <div className="chart">
      <h3>Pollution by Type</h3>
      <div className="chart-placeholder">
        <div className="bar-chart">
          {pollutionTypeData.map((item, i) => (
            <div className="chart-bar" key={i}>
              <div className="bar-label">{item.type}</div>
              <div className="bar-container">
                <div 
                  className="bar" 
                  style={{ 
                    width: `${(item.count / 112) * 100}%`,
                    backgroundColor: item.color
                  }}
                ></div>
                <span className="bar-value">{item.count}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
</section>

            <section className="recent-reports content-section">
              <div className="section-header">
                <h2>Recent Reports</h2>
                <button className="view-all" onClick={() => navigateTo('reports')}>View All Reports &rarr;</button>
              </div>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Location</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.isArray(reports) && reports.map((report) => (
                      <tr key={report.id}>
                        <td>{report.id}</td>
                        <td>{report.date}</td>
                        <td>{report.type}</td>
                        <td>{report.location}</td>
                        <td>
                        <span className={`status-badge ${report.status || 'unknown'}`}>
  {(report.status && report.status.charAt(0).toUpperCase() + report.status.slice(1)) || 'Unknown'}
</span>
                        </td>
                        <td>
                          <div className="action-buttons">
                            <button className="action-btn view">View</button>
                            <button className="action-btn">Details</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="quick-actions">
                <button className="action-card green" onClick={() => navigateTo('submit')}>
                  <div className="action-icon submit"></div>
                  <div className="action-text">
                    <h4>Submit New Report</h4>
                    <p>Report a pollution incident</p>
                  </div>
                </button>
                <button className="action-card blue" onClick={() => navigateTo('map')}>
                  <div className="action-icon map"></div>
                  <div className="action-text">
                    <h4>View Pollution Map</h4>
                    <p>See global pollution data</p>
                  </div>
                </button>
                <button className="action-card purple">
                  <div className="action-icon download"></div>
                  <div className="action-text">
                    <h4>Download Data</h4>
                    <p>Export reports as CSV</p>
                  </div>
                </button>
              </div>
            </section>
          </>
        );
    }
  };

  return (
    <div className={`dashboard-container mode-${currentMode}`}>
     <header className="dashboard-header">
  <div className="header-main">
    <div className="logo">
      <div className="logo-icon"></div>
      <h1>Marine Pollution Dashboard</h1>
    </div>
    <div className="mode-switcher">
      <button 
        className={`mode-btn ${currentMode === 'public' ? 'active' : ''}`} 
        onClick={() => switchMode('public')}
      >
        Public Mode
      </button>
      <button 
        className={`mode-btn ${currentMode === 'scientific' ? 'active' : ''}`} 
        onClick={() => switchMode('scientific')}
      >
        Scientific Mode
      </button>
      <button 
        className={`mode-btn ${currentMode === 'authority' ? 'active' : ''}`} 
        onClick={() => switchMode('authority')}
      >
        Authority Mode
      </button>
    </div>
    {/* <button 
      className="logout-btn" 
      onClick={() => {
        localStorage.removeItem('authToken'); // Clear the token
        navigate('/login'); // Redirect to login page
      }}
    >
      Logout
    </button> */}
   
  </div>
  <nav className="main-nav">
    <button 
      className={`nav-btn ${currentView === 'home' ? 'active' : ''}`} 
      onClick={() => navigateTo('home')}
    >
      <span className="nav-icon home"></span>
      Home
    </button>
    <button 
      className={`nav-btn ${currentView === 'submit' ? 'active' : ''}`} 
      onClick={() => navigateTo('submit')}
    >
      <span className="nav-icon submit"></span>
      Submit Report
    </button>
    <button 
      className={`nav-btn ${currentView === 'reports' ? 'active' : ''}`} 
      onClick={() => navigateTo('reports')}
    >
      <span className="nav-icon reports"></span>
      View Reports
    </button>
    <button 
      className={`nav-btn ${currentView === 'map' ? 'active' : ''}`} 
      onClick={() => navigateTo('map')}
    >
      <span className="nav-icon map"></span>
      Pollution Map
    </button>
    <button 
    className="logout-btn" 
    onClick={handleLogout}
  >
    Logout
  </button>
    
  </nav>
</header>
  
      <main className="dashboard-main">
        {renderContent()}
      </main>
  
      <footer className="dashboard-footer">
        <div className="footer-content">
          <div className="footer-section">
            <h4>Marine Pollution Tracking Initiative</h4>
            <p>A decentralized platform for transparent reporting and tracking of marine pollution incidents worldwide.</p>
          </div>
          <div className="footer-section">
            <h4>Quick Links</h4>
            <ul>
              <li><a href="#about">About the Initiative</a></li>
              <li><a href="#help">How to Help</a></li>
              <li><a href="#api">API Documentation</a></li>
              <li><a href="#contact">Contact</a></li>
            </ul>
          </div>
          <div className="footer-section">
            <h4>Technology</h4>
            <p>Powered by Blockchain & IPFS</p>
            <div className="tech-logos">
              <span className="tech-logo blockchain"></span>
              <span className="tech-logo ipfs"></span>
            </div>
          </div>
        </div>
        <div className="copyright">
          <p>© 2025 Marine Pollution Tracking Initiative | All Rights Reserved</p>
        </div>
      </footer>
    </div>
  );
}

export default Dashboard;
