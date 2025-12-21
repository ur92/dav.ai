import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getUsers, updateUser as updateUserStorage, type User } from '../utils/storage';
import './UserEdit.css';

export function UserEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!id) {
      navigate('/users/list');
      return;
    }

    const users = getUsers();
    const foundUser = users.find((u) => u.id === id);
    if (!foundUser) {
      navigate('/users/list');
      return;
    }

    setUser(foundUser);
    setUsername(foundUser.username);
  }, [id, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Please enter both username and password');
      return;
    }

    if (!id) return;

    const users = getUsers();
    const existingUser = users.find((u) => u.username === username && u.id !== id);
    if (existingUser) {
      setError('Username already exists');
      return;
    }

    updateUserStorage(id, { username, password });
    navigate('/users/list', { state: { successMessage: 'User updated successfully!' } });
  };

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="user-edit-container">
      <div className="user-edit-card">
        <div className="user-edit-header">
          <h1>Edit User</h1>
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
              placeholder="Enter new password"
              autoComplete="new-password"
            />
          </div>
          {error && <p className="error-message">{error}</p>}
          <button type="submit" className="save-button">
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );
}

