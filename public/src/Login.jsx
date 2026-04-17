import React, { useState } from 'react';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('Department Head');

  const handleSubmit = (e) => {
    e.preventDefault();
    onLogin({ name: username || 'Admin User', role: role });
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
              border: '3px solid #0288d1', 
              boxShadow: '0 4px 10px rgba(0,0,0,0.15)' 
            }}
          />
        </div>

        <h2 style={{ marginTop: '0' }}>SMARTSCHED</h2>
        <p style={{color: '#666', marginBottom: '25px', fontSize: '0.9rem'}}>Capiz State University Room Scheduler</p>
        
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
            <label>Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}>
              <option>Department Head</option>
              <option>Faculty</option>
              <option>Student</option>
            </select>
          </div>
          <button type="submit" className="btn-login">Sign In</button>
        </form>
      </div>
    </div>
  );
};

export default Login;