// import React, { useEffect, useState } from 'react';
// import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
// import Dashboard from './Dashboard';
// import AuthorityDashboard from './AuthorityDashboard';
// import Login from './Login';
// import Signup from './Signup';
// import ReportForm from './ReportForm';
// import ViewReport from './ViewReport';
// import './App.css';

// // Protected Route Component
// const ProtectedRoute = ({ children, allowedRole }) => {
//   const token = localStorage.getItem('token');
//   const role = localStorage.getItem('role');

//   if (!token) return <Navigate to="/login" replace />;

//   if (allowedRole && role !== allowedRole) {
//     if (role === 'authority') return <Navigate to="/authority-dashboard" replace />;
//     if (role === 'public') return <Navigate to="/dashboard" replace />;

//     localStorage.clear();
//     return <Navigate to="/login" replace />;
//   }

//   return children;
// };

// function App() {
//   const [isAuthenticated, setIsAuthenticated] = useState(false);
//   const [userRole, setUserRole] = useState(null);
//   const navigate = useNavigate();
//   const location = useLocation();

//   // Reactively check authentication on route change
//   useEffect(() => {
//     const token = localStorage.getItem('token');
//     const role = localStorage.getItem('role');

//     if (token && role) {
//       setIsAuthenticated(true);
//       setUserRole(role);
//     } else {
//       setIsAuthenticated(false);
//       setUserRole(null);
//       navigate('/login');
//     }

//     // Handle browser back button after logout
//     window.onpopstate = () => {
//       const tokenCheck = localStorage.getItem('token');
//       if (!tokenCheck) {
//         navigate('/login');
//       }
//     };
//   }, [location.pathname, navigate]);

//   return (
//     <div className="App">
//       <Routes>
//         {/* Public Routes */}
//         <Route path="/" element={isAuthenticated ? (
//           userRole === 'authority' ? <Navigate to="/authority-dashboard" /> : <Navigate to="/dashboard" />
//         ) : (
//           <Login />
//         )} />
//         <Route path="/login" element={isAuthenticated ? (
//           userRole === 'authority' ? <Navigate to="/authority-dashboard" /> : <Navigate to="/dashboard" />
//         ) : (
//           <Login />
//         )} />
//         <Route path="/signup" element={<Signup />} />

//         {/* Protected Routes */}
//         <Route path="/dashboard" element={
//           <ProtectedRoute allowedRole="public">
//             <Dashboard />
//           </ProtectedRoute>
//         } />
//         <Route path="/authority-dashboard" element={
//           <ProtectedRoute allowedRole="authority">
//             <AuthorityDashboard />
//           </ProtectedRoute>
//         } />

//         {/* Other Routes */}
//         <Route path="/reports/new" element={
//           <ProtectedRoute>
//             <ReportForm />
//           </ProtectedRoute>
//         } />
//         <Route path="/reports/view/:id" element={
//           <ProtectedRoute>
//             <ViewReport />
//           </ProtectedRoute>
//         } />

//         {/* Catch-all redirect */}
//         <Route path="*" element={<Navigate to="/" />} />
//       </Routes>
//     </div>
//   );
// }

// export default App;
import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import Dashboard from './Dashboard';
import AuthorityDashboard from './AuthorityDashboard';
import Login from './Login';
import Signup from './Signup';
import ReportForm from './ReportForm';
import ViewReport from './ViewReport';
import './App.css';

// Protected Route Component
const ProtectedRoute = ({ children, allowedRole }) => {
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRole && role !== allowedRole) {
    // Redirect to role-appropriate dashboard
    if (role === 'authority') return <Navigate to="/authority-dashboard" replace />;
    if (role === 'public') return <Navigate to="/dashboard" replace />;
    
    // Clear invalid role
    localStorage.clear();
    return <Navigate to="/login" replace />;
  }

  return children;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');

    if (token && role) {
      setIsAuthenticated(true);
      setUserRole(role);
    } else {
      setIsAuthenticated(false);
      setUserRole(null);
    }

    // On back navigation, redirect to login if not authenticated
    window.onpopstate = () => {
      if (!localStorage.getItem('token')) {
        navigate('/login');
      }
    };
  }, [location.pathname, navigate]);

  return (
    <div className="App">
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={
          isAuthenticated
            ? (userRole === 'authority' ? <Navigate to="/authority-dashboard" /> : <Navigate to="/dashboard" />)
            : <Login />
        } />
        <Route path="/login" element={
          isAuthenticated
            ? (userRole === 'authority' ? <Navigate to="/authority-dashboard" /> : <Navigate to="/dashboard" />)
            : <Login />
        } />
        <Route path="/signup" element={<Signup />} />

        {/* Protected Routes */}
        <Route path="/dashboard" element={
          <ProtectedRoute allowedRole="public">
            <Dashboard />
          </ProtectedRoute>
        } />
        <Route path="/authority-dashboard" element={
          <ProtectedRoute allowedRole="authority">
            <AuthorityDashboard />
          </ProtectedRoute>
        } />
        <Route path="/reports/new" element={
          <ProtectedRoute>
            <ReportForm />
          </ProtectedRoute>
        } />
        <Route path="/reports/view/:id" element={
          <ProtectedRoute>
            <ViewReport />
          </ProtectedRoute>
        } />

        {/* Fallback Route */}
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}

export default App;
