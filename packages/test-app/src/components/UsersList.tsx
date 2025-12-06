import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getUsers, deleteUser, logout, type User } from '../utils/storage';
import './UsersList.css';

export function UsersList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [users, setUsers] = useState<User[]>([]);
  const [toastMessage, setToastMessage] = useState<string>('');

  useEffect(() => {
    loadUsers();
    
    // Check for success message from navigation state
    if (location.state?.successMessage) {
      setToastMessage(location.state.successMessage);
      // Clear the state to prevent showing the message again on refresh
      window.history.replaceState({}, document.title);
      
      // Auto-dismiss toast after 10 seconds
      const timer = setTimeout(() => {
        setToastMessage('');
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  const loadUsers = () => {
    setUsers(getUsers());
  };

  const handleDeleteUser = (id: string) => {
    deleteUser(id);
    loadUsers();
    setToastMessage('User deleted successfully');
    
    // Auto-dismiss toast after 10 seconds
    setTimeout(() => {
      setToastMessage('');
    }, 10000);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="users-container">
      {toastMessage && (
        <div className="toast">
          <div className="toast-content">
            <span className="toast-message">{toastMessage}</span>
            <button 
              className="toast-close" 
              onClick={() => setToastMessage('')}
              aria-label="Close toast"
            >
              ×
            </button>
          </div>
        </div>
      )}
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
    </div>
  );
}

