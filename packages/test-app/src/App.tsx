import { useState, useEffect } from 'react';
import { isAuthenticated, initializeStorage } from './utils/storage';
import { Login } from './components/Login';
import { UsersList } from './components/UsersList';
import './App.css';

function App() {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    initializeStorage();
    setAuthenticated(isAuthenticated());
  }, []);

  const handleLogin = () => {
    setAuthenticated(true);
  };

  const handleLogout = () => {
    setAuthenticated(false);
  };

  return (
    <div className="app">
      {authenticated ? (
        <UsersList onLogout={handleLogout} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App;

