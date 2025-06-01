// import React, { useState, useEffect } from 'react';
// import { useNavigate, Link } from 'react-router-dom';
// import axios from 'axios';
// import './Login.css'; 

// const Login = () => {
//   const [email, setEmail] = useState('');
//   const [password, setPassword] = useState('');
//   const [error, setError] = useState('');
//   const [loading, setLoading] = useState(false);
//   const [checking, setChecking] = useState(true); // For initial token check
//   const navigate = useNavigate();

//   // Check for existing token on component mount
//   useEffect(() => {
//     const checkExistingToken = async () => {
//       // Use the same token key as in App.js
//       const token = localStorage.getItem('token');
      
//       if (token) {
//         try {
//           console.log('Verifying existing token...');
//           // Use the protected route to verify token
//           const response = await axios.get('http://localhost:5000/api/protected', {
//             headers: {
//               Authorization: `Bearer ${token}`
//             }
//           });
          
//           // If we get a successful response, the token is valid
//           if (response.data && response.status === 200) {
//             console.log('Token is valid');
            
//             // Let App.js handle the redirection based on role
//             // Don't navigate here to prevent redirection loops
//           } else {
//             console.log('Token verification returned unexpected response');
//             // Clear all auth data
//             localStorage.removeItem('token');
//             localStorage.removeItem('role');
//             localStorage.removeItem('userData');
//           }
//         } catch (error) {
//           console.error('Token validation failed:', error.response?.status || error.message);
//           // Clear invalid token and related data
//           localStorage.removeItem('token');
//           localStorage.removeItem('role');
//           localStorage.removeItem('userData');
//         } finally {
//           setChecking(false); // Done checking token
//         }
//       } else {
//         console.log('No token found in localStorage');
//         setChecking(false); // Done checking token
//       }
//     };

//     // Call the function directly
//     checkExistingToken();
//   }, []);

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     setError('');
//     setLoading(true);
    
//     try {
//       console.log('Attempting login with:', { email });
//       const response = await axios.post('http://localhost:5000/api/auth/login', {
//         email,
//         password
//       });
      
//       if (response.data && response.data.token) {
//         console.log('Login successful, token received');
        
//         // Use consistent key names matching App.js
//         localStorage.setItem('token', response.data.token);
        
//         // Store user info if available
//         if (response.data.user) {
//           localStorage.setItem('userData', JSON.stringify(response.data.user));
//         }
        
//         // Store role with the same key name used in App.js
//         if (response.data.role) {
//           localStorage.setItem('role', response.data.role);
//           console.log(`User role set: ${response.data.role}`);
          
//           // Let the redirects in App.js handle navigation based on role
//           // Force a page reload to trigger App.js routing logic
//           window.location.href = '/';
//         } else {
//           // Default to public role if none provided
//           localStorage.setItem('role', 'public');
//           console.log('Default role set: public');
//           window.location.href = '/';
//         }
//       } else {
//         console.error('Login response missing token:', response.data);
//         setError('Login failed. Please check your credentials.');
//       }
//     } catch (error) {
//       console.error('Login error:', error.response?.data || error.message);
//       const errorMessage = error.response?.data?.message || 'Login failed. Please try again.';
//       setError(errorMessage);
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleGoogleLogin = async () => {
//     setLoading(true);
//     try {
//       // Redirect to Google OAuth endpoint or trigger Google OAuth flow
//       // This is a placeholder - you'll need to implement the actual Google OAuth flow
//       window.location.href = 'http://localhost:5000/api/auth/google';
//     } catch (error) {
//       console.error('Google login error:', error);
//       setError('Failed to connect to Google. Please try again.');
//       setLoading(false);
//     }
//   };

//   if (checking) {
//     return (
//       <div className="login-container loading">
//         <div className="loading-spinner">
//           <p>Checking authentication...</p>
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div className="login-container">
//       <div className="login-form-wrapper">
//         <h2>Login to Your Account</h2>
        
//         {error && <div className="error-message">{error}</div>}
        
//         <form onSubmit={handleSubmit}>
//           <div className="form-group">
//             <label htmlFor="email">Email Address</label>
//             <div className="input-with-icon">
//               <span className="icon">
//                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
//                   <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
//                   <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
//                 </svg>
//               </span>
//               <input
//                 type="email"
//                 id="email"
//                 value={email}
//                 onChange={(e) => setEmail(e.target.value)}
//                 required
//                 placeholder="Enter your email"
//                 autoComplete="email"
//               />
//             </div>
//           </div>
          
//           <div className="form-group">
//             <label htmlFor="password">Password</label>
//             <div className="input-with-icon">
//               <span className="icon">
//                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
//                   <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
//                 </svg>
//               </span>
//               <input
//                 type="password"
//                 id="password"
//                 value={password}
//                 onChange={(e) => setPassword(e.target.value)}
//                 required
//                 placeholder="Enter your password"
//                 autoComplete="current-password"
//               />
//             </div>
//           </div>
          
//           <button 
//             type="submit" 
//             className="btn-primary"
//             disabled={loading}
//           >
//             {loading ? 'Logging in...' : 'Login'}
//           </button>
//         </form>
        
//         <div className="social-login-separator">
//           <span>OR</span>
//         </div>
        
//         <button 
//           type="button" 
//           className="btn-google" 
//           onClick={handleGoogleLogin}
//           disabled={loading}
//         >
//           <img 
//             src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" 
//             alt="Google" 
//           />
//           Sign in with Google
//         </button>
        
//         <div className="form-footer">
//           <p>Don't have an account? <Link to="/signup">Sign up</Link></p>
//           <Link to="/forgot-password" className="forgot-password">Forgot password?</Link>
//         </div>
//       </div>
//     </div>
//   );
// };

// export default Login;
import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import './Login.css'; 

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true); // For initial token check
  const navigate = useNavigate();

  // Check for existing token on component mount
  useEffect(() => {
    const checkExistingToken = async () => {
      // Use the same token key as in App.js
      const token = localStorage.getItem('token');
      
      if (token) {
        try {
          console.log('Verifying existing token...');
          // Use the protected route to verify token
          const response = await axios.get('http://localhost:5000/api/protected', {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          
          // If we get a successful response, the token is valid
          if (response.data && response.status === 200) {
            console.log('Token is valid');
            // Navigate to home page if token is valid
            navigate('/');
          } else {
            console.log('Token verification returned unexpected response');
            // Clear all auth data
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            localStorage.removeItem('userData');
          }
        } catch (error) {
          console.error('Token validation failed:', error.response?.status || error.message);
          // Clear invalid token and related data
          localStorage.removeItem('token');
          localStorage.removeItem('role');
          localStorage.removeItem('userData');
        } finally {
          setChecking(false); // Done checking token
        }
      } else {
        console.log('No token found in localStorage');
        setChecking(false); // Done checking token
      }
    };

    // Call the function directly
    checkExistingToken();
  }, [navigate]); // Add navigate to dependency array

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      console.log('Attempting login with:', { email });
      const response = await axios.post('http://localhost:5000/api/auth/login', {
        email,
        password
      });
      
      if (response.data && response.data.token) {
        console.log('Login successful, token received');
        
        // Store token and user data
        localStorage.setItem('token', response.data.token);
        
        // Store user info if available
        if (response.data.user) {
          localStorage.setItem('userData', JSON.stringify(response.data.user));
        }
        
        // Store role
        if (response.data.role) {
          localStorage.setItem('role', response.data.role);
          console.log(`User role set: ${response.data.role}`);
        } else {
          // Default to public role if none provided
          localStorage.setItem('role', 'public');
          console.log('Default role set: public');
        }
        
        // Use navigate instead of window.location for better SPA behavior
        navigate('/');
      } else {
        console.error('Login response missing token:', response.data);
        setError('Login failed. Please check your credentials.');
      }
    } catch (error) {
      console.error('Login error:', error.response?.data || error.message);
      const errorMessage = error.response?.data?.message || 'Login failed. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    setLoading(true);
    try {
      // Use window.location for OAuth redirect since this takes us outside the SPA
      window.location.href = 'http://localhost:5000/api/auth/google';
    } catch (error) {
      console.error('Google login error:', error);
      setError('Failed to connect to Google. Please try again.');
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="login-container loading">
        <div className="loading-spinner">
          <p>Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-form-wrapper">
        <h2>Login to Your Account</h2>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email Address</label>
            <div className="input-with-icon">
              <span className="icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
              </span>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="Enter your email"
                autoComplete="email"
              />
            </div>
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <div className="input-with-icon">
              <span className="icon">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
              </span>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>
          </div>
          
          <button 
            type="submit" 
            className="btn-primary"
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
        
        <div className="social-login-separator">
          <span>OR</span>
        </div>
        
        <button 
          type="button" 
          className="btn-google" 
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <img 
            src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" 
            alt="Google" 
          />
          Sign in with Google
        </button>
        
        <div className="form-footer">
          <p>Don't have an account? <Link to="/signup">Sign up</Link></p>
          <Link to="/forgot-password" className="forgot-password">Forgot password?</Link>
        </div>
      </div>
    </div>
  );
};

export default Login;