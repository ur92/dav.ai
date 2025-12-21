import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  getUsers,
  deleteUser,
  getGroupsForUser,
  getEffectivePermissions,
  type User,
} from '../utils/storage';
import './UsersList.css';

interface UserWithSummary extends User {
  groupsCount: number;
  permissionsCount: number;
  groups: string[];
  permissions: string[];
}

export function UsersList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [users, setUsers] = useState<UserWithSummary[]>([]);
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
    const allUsers = getUsers();
    const usersWithSummary: UserWithSummary[] = allUsers.map((user) => {
      const groups = getGroupsForUser(user.id);
      const permissions = getEffectivePermissions(user.id);
      return {
        ...user,
        groupsCount: groups.length,
        permissionsCount: permissions.length,
        groups: groups.map((g) => g.name),
        permissions: permissions.map((p) => p.name),
      };
    });
    setUsers(usersWithSummary);
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
                <div className="table-cell">Groups</div>
                <div className="table-cell">Permissions</div>
                <div className="table-cell">Actions</div>
              </div>
              {users.map((user) => (
                <div key={user.id} className="table-row">
                  <div className="table-cell">
                    <div className="username-cell">{user.username}</div>
                  </div>
                  <div className="table-cell">
                    <div className="badges-container">
                      {user.groups.slice(0, 2).map((group, idx) => (
                        <span key={idx} className="summary-badge">{group}</span>
                      ))}
                      {user.groups.length > 2 && (
                        <span className="summary-badge more-badge">+{user.groups.length - 2}</span>
                      )}
                      {user.groups.length === 0 && (
                        <span className="empty-badge">-</span>
                      )}
                    </div>
                  </div>
                  <div className="table-cell">
                    <div className="badges-container">
                      {user.permissions.slice(0, 2).map((permission, idx) => (
                        <span key={idx} className="summary-badge">{permission}</span>
                      ))}
                      {user.permissions.length > 2 && (
                        <span className="summary-badge more-badge">+{user.permissions.length - 2}</span>
                      )}
                      {user.permissions.length === 0 && (
                        <span className="empty-badge">-</span>
                      )}
                    </div>
                  </div>
                  <div className="table-cell">
                    <div className="action-buttons">
                      <button
                        onClick={() => navigate(`/users/${user.id}`)}
                        className="view-button"
                      >
                        View
                      </button>
                      <button
                        onClick={() => navigate(`/users/edit/${user.id}`)}
                        className="edit-button"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="delete-button"
                      >
                        Delete
                      </button>
                    </div>
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

