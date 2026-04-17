import React, { useState } from 'react';
import Login from './Login';
import Dashboard from './Dashboard';
import './App.css';

function App() {
  const [user, setUser] = useState(null);

  // If there is no user logged in, show the Login screen
  if (!user) {
    return <Login onLogin={setUser} />;
  }

  // If logged in, show the SMARTSCHED Dashboard directly (no extra wrappers!)
  return (
    <Dashboard user={user} onLogout={() => setUser(null)} />
  );
}

export default App;