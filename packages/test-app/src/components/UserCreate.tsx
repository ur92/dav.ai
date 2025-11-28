import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addUser, getUsers, type User } from '../utils/storage';
import './UserCreate.css';

export function UserCreate() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }

    const users = getUsers();
    if (users.some((u: User) => u.username === username)) {
      setError('Username already exists');
      return;
    }

    addUser({ username, password });
    setSuccess(true);
    setUsername('');
    setPassword('');
  };

  return (
    <div className="user-create-container">
      <div className="user-create-card">
        <div className="user-create-header">
          <h1>Create New User</h1>
          <button onClick={() => navigate('/users/list')} className="back-button">
            ← Back to Users
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
              autoComplete="username"
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoComplete="new-password"
            />
          </div>
          {error && <p className="error-message">{error}</p>}
          {success && <p className="success-message">User created successfully!</p>}
          <button type="submit" className="create-button">
            Create User
          </button>
        </form>
      </div>
    </div>
  );
}

