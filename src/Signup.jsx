import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './Signup.css';

function Signup() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    role: 'public',
  });
  const [error, setError] = useState('');

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      
      if (!res.ok) {
        setError(data.message || 'Signup failed');
        return;
      }

      alert('✅ Signup successful! Please log in.');
      navigate('/login');
    } catch (err) {
      console.error('Signup error:', err);
      setError('Server error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="main-container">
      {/* Left side - Beach background */}
      <div className="bg-container"></div>
      
      {/* Right side - Form */}
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h2>Create Your Account</h2>
            <p>Join our community today</p>
          </div>
          
          {error && <div className="auth-error">{error}</div>}
          
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="form-group">
              <label htmlFor="name">Full Name</label>
              <div className="input-with-icon">
                <i className="user-icon">👤</i>
                <input
                  id="name"
                  name="name"
                  placeholder="John Doe"
                  value={form.name}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="email">Email Address</label>
              <div className="input-with-icon">
                <i className="email-icon">📧</i>
                <input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="your@email.com"
                  value={form.email}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="phone">Phone Number</label>
              <div className="input-with-icon">
                <i className="phone-icon">📱</i>
                <input
                  id="phone"
                  name="phone"
                  placeholder="+1 (123) 456-7890"
                  value={form.phone}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
            
            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="input-with-icon">
                <i className="password-icon">🔒</i>
                <input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  value={form.password}
                  onChange={handleChange}
                  required
                />
              </div>
              <p className="password-hint">Must be at least 8 characters</p>
            </div>
            
            <div className="form-group">
              <label htmlFor="role">Account Type</label>
              <div className="role-selector">
                <div className={`role-option ${form.role === 'public' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    id="public"
                    name="role"
                    value="public"
                    checked={form.role === 'public'}
                    onChange={handleChange}
                  />
                  <label htmlFor="public">
                    <i className="role-icon">👥</i>
                    <span className="role-name">Public</span>
                  </label>
                </div>
                
                <div className={`role-option ${form.role === 'authority' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    id="authority"
                    name="role"
                    value="authority"
                    checked={form.role === 'authority'}
                    onChange={handleChange}
                  />
                  <label htmlFor="authority">
                    <i className="role-icon">👮</i>
                    <span className="role-name">Authority</span>
                  </label>
                </div>
              </div>
            </div>
            
            <button 
              type="submit" 
              className="auth-button primary-button"
              disabled={isLoading}
            >
              {isLoading ? 'Creating Account...' : 'Sign Up'}
            </button>
          </form>
          
          <div className="auth-footer">
            <p>Already have an account? <Link to="/login" className="auth-link">Sign in</Link></p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Signup;