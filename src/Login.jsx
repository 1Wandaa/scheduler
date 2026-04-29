import React, { useState } from 'react';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Admin'); // Changed default to Admin

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin({ name: username || 'Authorized User', role: role });
  };

  return (
    <div className="login-container">
      <div className="login-box">

        {/* --- OFFICIAL CAPSU LOGO --- */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '15px' }}>
          <img
            src="logo.jpg"
            alt="CAPSU Logo"
            style={{
              width: '90px',
              height: '90px',
              borderRadius: '50%',
              objectFit: 'cover',
              border: '3px solid var(--accent-primary)',
              boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
            }}
            onError={(e) => { e.target.src = "https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Capiz_State_University_logo.png/220px-Capiz_State_University_logo.png"; }}
          />
        </div>

        <h2 style={{ marginTop: '0', color: 'var(--text-main)', letterSpacing: '1px' }}>SMARTSCHED</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '25px', fontSize: '0.9rem' }}>Capiz State University Room Scheduler</p>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Username</label>
            <input
              required
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="Enter your username"
            />
          </div>

          <div className="input-group">
            <label>Password</label>
            <input
              required
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter your password"
            />
          </div>

          <div className="input-group">
            <label>Account Role</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={{ cursor: 'pointer' }}>
              {/* --- RESTRICTED TO TWO CATEGORIES --- */}
              <option value="Admin">Admin</option>
              <option value="User">User</option>
            </select>
          </div>

          <button type="submit" className="btn-login" style={{ marginTop: '20px' }}>Sign In</button>
        </form>
      </div>
    </div>
  );
};

export default Login;