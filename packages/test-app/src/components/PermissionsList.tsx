import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  getPermissions,
  deletePermission,
  getUserPermissions,
  getGroupPermissions,
  type Permission,
} from '../utils/storage';
import './PermissionsList.css';

export function PermissionsList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [permissions, setPermissions] = useState<(Permission & { usageCount: number })[]>([]);
  const [toastMessage, setToastMessage] = useState<string>('');

  useEffect(() => {
    loadPermissions();
    
    if (location.state?.successMessage) {
      setToastMessage(location.state.successMessage);
      window.history.replaceState({}, document.title);
      
      const timer = setTimeout(() => {
        setToastMessage('');
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  const loadPermissions = () => {
    const allPermissions = getPermissions();
    const permissionsWithCounts = allPermissions.map((permission) => {
      // Count usage: users + groups
      const userPerms = getUserPermissions();
      const groupPerms = getGroupPermissions();
      const userCount = userPerms.filter((up) => up.permissionId === permission.id).length;
      const groupCount = groupPerms.filter((gp) => gp.permissionId === permission.id).length;
      return {
        ...permission,
        usageCount: userCount + groupCount,
      };
    });
    setPermissions(permissionsWithCounts);
  };

  const handleDeletePermission = (id: string) => {
    deletePermission(id);
    loadPermissions();
    setToastMessage('Permission deleted successfully');
    
    setTimeout(() => {
      setToastMessage('');
    }, 10000);
  };

  return (
    <div className="permissions-container">
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
      <div className="permissions-header">
        <h1>Permission Management</h1>
        <div className="header-actions">
          <button onClick={() => navigate('/permissions/create')} className="create-button-header">
            Create Permission
          </button>
        </div>
      </div>

      <div className="permissions-list-card">
        <h2>Permissions List</h2>
        {permissions.length === 0 ? (
          <p className="empty-message">No permissions found</p>
        ) : (
          <div className="permissions-table">
            <div className="table-header">
              <div className="table-cell">Name</div>
              <div className="table-cell">Description</div>
              <div className="table-cell">Type</div>
              <div className="table-cell">Usage</div>
              <div className="table-cell">Actions</div>
            </div>
            {permissions.map((permission) => (
              <div key={permission.id} className="table-row">
                <div className="table-cell">{permission.name}</div>
                <div className="table-cell">{permission.description || '-'}</div>
                <div className="table-cell">
                  <span className={`type-badge ${permission.isCustom ? 'custom' : 'built-in'}`}>
                    {permission.isCustom ? 'Custom' : 'Built-in'}
                  </span>
                </div>
                <div className="table-cell">{permission.usageCount}</div>
                <div className="table-cell">
                  <div className="action-buttons">
                    <button
                      onClick={() => navigate(`/permissions/${permission.id}`)}
                      className="view-button"
                    >
                      View
                    </button>
                    {permission.isCustom && (
                      <>
                        <button
                          onClick={() => navigate(`/permissions/edit/${permission.id}`)}
                          className="edit-button"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeletePermission(permission.id)}
                          className="delete-button"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

