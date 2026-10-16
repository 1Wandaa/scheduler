import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthUser } from './hooks/useAuthUser';
import Login from './pages/Login/Login';
import Dashboard from './pages/Dashboard/Dashboard';
import ProtectedRoute from './components/ProtectedRoute/ProtectedRoute';
import './styles/App.css';


function App() {
  const { user, loading, isOffline, handleLogin, handleLogout } = useAuthUser();

  // Show a loading spinner while checking auth state
  if (loading) {
    return (
      <div className="app-loading-container">
        <div className="loading-logo-wrapper">
          <img 
            src="/logo.png?v=1" 
            alt="Loading" 
            className="loading-logo-img"
            onError={e => e.currentTarget.src = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png'}
          />
        </div>
        <div className="loading-text">
          Loading SMARTSCHED
          <span className="loading-dots" style={{ marginLeft: '4px' }}>
            <span></span><span></span><span></span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <>
      {isOffline && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0,
          background: 'var(--danger, #ef4444)', color: 'white',
          textAlign: 'center', padding: '6px', fontSize: '0.85rem',
          fontWeight: 600, zIndex: 999999, display: 'flex',
          alignItems: 'center', justifyContent: 'center', gap: '8px'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.71 5.05A16 16 0 0 1 22.58 9M1.42 9a15.91 15.91 0 0 1 4.7-2.88M8.53 16.11a6 6 0 0 1 6.95 0M5 12.55a11.61 11.61 0 0 1 5.08-2.32M1 1l22 22"/></svg>
          You are currently offline. Viewing cached schedule.
        </div>
      )}
      <Routes>
        <Route 
          path="/" 
          element={!user ? <Login onLogin={handleLogin} /> : <Navigate to="/dashboard" replace />} 
        />
        <Route 
          path="/dashboard/*" 
          element={
            <ProtectedRoute user={user}>
              <Dashboard user={user} onLogout={handleLogout} />
            </ProtectedRoute>
          } 
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;