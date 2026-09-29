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
      <div className="app-loading-container" style={{ height: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: '16px', background: 'var(--bg-main, #0f111a)' }}>
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <img 
            src="/logo.png?v=1" 
            alt="Loading" 
            style={{ 
              width: '86px', height: '86px', 
              borderRadius: '50%', 
              objectFit: 'cover',
              backgroundColor: 'white',
              border: '3px solid white',
              boxShadow: '0 0 0 8px rgba(99, 102, 241, 0.15), 0 0 30px rgba(99, 102, 241, 0.4)',
              animation: 'pulse-glow 2s ease-in-out infinite'
            }} 
            onError={e => e.currentTarget.src = 'https://upload.wikimedia.org/wikipedia/en/8/8e/Capiz_State_University_logo.png'}
          />
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '12px' }}>Loading SMARTSCHED...</div>
        <style>{`
          @keyframes pulse-glow {
            0% { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0.15), 0 0 20px rgba(99, 102, 241, 0.3); }
            50% { box-shadow: 0 0 0 12px rgba(99, 102, 241, 0.1), 0 0 40px rgba(99, 102, 241, 0.6); }
            100% { box-shadow: 0 0 0 8px rgba(99, 102, 241, 0.15), 0 0 20px rgba(99, 102, 241, 0.3); }
          }
        `}</style>
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