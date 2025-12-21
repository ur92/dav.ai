import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getUsers, getGroupsForUser, getEffectivePermissions, type User } from '../utils/storage';
import { UserGroupsModal } from './UserGroupsModal';
import { UserPermissionsModal } from './UserPermissionsModal';
import './UserDetail.css';

export function UserDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [showGroupsModal, setShowGroupsModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);

  useEffect(() => {
    if (!id) {
      navigate('/users/list');
      return;
    }

    loadUserData();
  }, [id, navigate]);

  const loadUserData = () => {
    if (!id) return;

    const users = getUsers();
    const foundUser = users.find((u) => u.id === id);
    if (!foundUser) {
      navigate('/users/list');
      return;
    }

    setUser(foundUser);
    setGroups(getGroupsForUser(id));
    setPermissions(getEffectivePermissions(id));
  };

  if (!user) {
    return <div>Loading...</div>;
  }

  return (
    <div className="user-detail-container">
      <div className="user-detail-header">
        <h1>User Details</h1>
        <button onClick={() => navigate('/users/list')} className="back-button">
          ← Back to Users
        </button>
      </div>

      <div className="user-detail-content">
        <div className="detail-card">
          <h2>User Information</h2>
          <div className="detail-field">
            <label>Username:</label>
            <span>{user.username}</span>
          </div>
          <div className="detail-actions">
            <button
              onClick={() => navigate(`/users/edit/${user.id}`)}
              className="edit-button"
            >
              Edit User
            </button>
          </div>
        </div>

        <div className="detail-card">
          <div className="detail-card-header">
            <h2>Groups ({groups.length})</h2>
            <button
              onClick={() => setShowGroupsModal(true)}
              className="manage-button"
            >
              Manage Groups
            </button>
          </div>
          {groups.length === 0 ? (
            <p className="empty-message">No groups assigned</p>
          ) : (
            <div className="items-list">
              {groups.map((group) => (
                <div key={group.id} className="item-badge">
                  {group.name}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="detail-card">
          <div className="detail-card-header">
            <h2>Effective Permissions ({permissions.length})</h2>
            <button
              onClick={() => setShowPermissionsModal(true)}
              className="manage-button"
            >
              Manage Permissions
            </button>
          </div>
          {permissions.length === 0 ? (
            <p className="empty-message">No permissions assigned</p>
          ) : (
            <div className="items-list">
              {permissions.map((permission) => (
                <div
                  key={permission.id}
                  className={`item-badge ${permission.isCustom ? 'custom' : 'built-in'}`}
                >
                  {permission.name}
                  {permission.isCustom && <span className="badge-label">Custom</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showGroupsModal && (
        <UserGroupsModal
          isOpen={showGroupsModal}
          onClose={() => {
            setShowGroupsModal(false);
            loadUserData();
          }}
          userId={id!}
        />
      )}

      {showPermissionsModal && (
        <UserPermissionsModal
          isOpen={showPermissionsModal}
          onClose={() => {
            setShowPermissionsModal(false);
            loadUserData();
          }}
          userId={id!}
        />
      )}
    </div>
  );
}

