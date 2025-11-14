import { useState, useEffect } from 'react';
import { getUsers, addUser, deleteUser, logout, type User } from '../utils/storage';
import './UsersList.css';

interface UsersListProps {
  onLogout: () => void;
}

export function UsersList({ onLogout }: UsersListProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = () => {
    setUsers(getUsers());
  };

  const handleAddUser = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newUsername || !newPassword) {
      setError('Please enter both username and password');
      return;
    }

    if (users.some((u) => u.username === newUsername)) {
      setError('Username already exists');
      return;
    }

    addUser({ username: newUsername, password: newPassword });
    setNewUsername('');
    setNewPassword('');
    loadUsers();
  };

  const handleDeleteUser = (id: string) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      deleteUser(id);
      loadUsers();
    }
  };

  const handleLogout = () => {
    logout();
    onLogout();
  };

  return (
    <div className="users-container">
      <div className="users-header">
        <h1>User Management</h1>
        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </div>

      <div className="users-content">
        <div className="users-form-card">
          <h2>Create New User</h2>
          <form onSubmit={handleAddUser}>
            <div className="form-group">
              <label htmlFor="new-username">Username</label>
              <input
                id="new-username"
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="Enter username"
              />
            </div>
            <div className="form-group">
              <label htmlFor="new-password">Password</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter password"
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="add-button">
              Add User
            </button>
          </form>
        </div>

        <div className="users-list-card">
          <h2>Users List</h2>
          {users.length === 0 ? (
            <p className="empty-message">No users found</p>
          ) : (
            <div className="users-table">
              <div className="table-header">
                <div className="table-cell">Username</div>
                <div className="table-cell">Actions</div>
              </div>
              {users.map((user) => (
                <div key={user.id} className="table-row">
                  <div className="table-cell">{user.username}</div>
                  <div className="table-cell">
                    <button
                      onClick={() => handleDeleteUser(user.id)}
                      className="delete-button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

