import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUsers, deleteUser, logout, type User } from '../utils/storage';
import './UsersList.css';

export function UsersList() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [successMessage, setSuccessMessage] = useState<string>('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = () => {
    setUsers(getUsers());
  };

  const handleDeleteUser = (id: string) => {
    deleteUser(id);
    loadUsers();
    setSuccessMessage('User deleted successfully');
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="users-container">
      <div className="users-header">
        <h1>User Management</h1>
        <div className="header-actions">
          <button onClick={() => navigate('/users/create')} className="create-button-header">
            Create User
          </button>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </div>

      <div className="users-content">
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
      {successMessage && <p className="success-message">{successMessage}</p>}
    </div>
  );
}

