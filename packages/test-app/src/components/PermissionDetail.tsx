import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  getPermissions,
  getUserPermissions,
  getGroupPermissions,
  getUsers,
  getGroups,
  type Permission,
} from '../utils/storage';
import { PermissionUsersModal } from './PermissionUsersModal';
import { PermissionGroupsModal } from './PermissionGroupsModal';
import './PermissionDetail.css';

export function PermissionDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [permission, setPermission] = useState<Permission | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showGroupsModal, setShowGroupsModal] = useState(false);

  useEffect(() => {
    if (!id) {
      navigate('/permissions/list');
      return;
    }

    loadPermissionData();
  }, [id, navigate]);

  const loadPermissionData = () => {
    if (!id) return;

    const permissions = getPermissions();
    const foundPermission = permissions.find((p) => p.id === id);
    if (!foundPermission) {
      navigate('/permissions/list');
      return;
    }

    setPermission(foundPermission);

    // Get users with this permission
    const userPerms = getUserPermissions();
    const userIds = userPerms
      .filter((up) => up.permissionId === id)
      .map((up) => up.userId);
    const allUsers = getUsers();
    setUsers(allUsers.filter((u) => userIds.includes(u.id)));

    // Get groups with this permission
    const groupPerms = getGroupPermissions();
    const groupIds = groupPerms
      .filter((gp) => gp.permissionId === id)
      .map((gp) => gp.groupId);
    const allGroups = getGroups();
    setGroups(allGroups.filter((g) => groupIds.includes(g.id)));
  };

  if (!permission) {
    return <div>Loading...</div>;
  }

  return (
    <div className="permission-detail-container">
      <div className="permission-detail-header">
        <h1>Permission Details</h1>
        <button onClick={() => navigate('/permissions/list')} className="back-button">
          ← Back to Permissions
        </button>
      </div>

      <div className="permission-detail-content">
        <div className="detail-card">
          <h2>Permission Information</h2>
          <div className="detail-field">
            <label>Name:</label>
            <span>{permission.name}</span>
          </div>
          <div className="detail-field">
            <label>Description:</label>
            <span>{permission.description || '-'}</span>
          </div>
          <div className="detail-field">
            <label>Type:</label>
            <span>
              <span className={`type-badge ${permission.isCustom ? 'custom' : 'built-in'}`}>
                {permission.isCustom ? 'Custom' : 'Built-in'}
              </span>
            </span>
          </div>
          {permission.isCustom && (
            <div className="detail-actions">
              <button
                onClick={() => navigate(`/permissions/edit/${permission.id}`)}
                className="edit-button"
              >
                Edit Permission
              </button>
            </div>
          )}
        </div>

        <div className="detail-card">
          <div className="detail-card-header">
            <h2>Assigned Users ({users.length})</h2>
            <button
              onClick={() => setShowUsersModal(true)}
              className="manage-button"
            >
              Manage Users
            </button>
          </div>
          {users.length === 0 ? (
            <p className="empty-message">No users assigned</p>
          ) : (
            <div className="items-list">
              {users.map((user) => (
                <div key={user.id} className="item-badge">
                  {user.username}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="detail-card">
          <div className="detail-card-header">
            <h2>Assigned Groups ({groups.length})</h2>
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
      </div>

      {showUsersModal && (
        <PermissionUsersModal
          isOpen={showUsersModal}
          onClose={() => {
            setShowUsersModal(false);
            loadPermissionData();
          }}
          permissionId={id!}
        />
      )}

      {showGroupsModal && (
        <PermissionGroupsModal
          isOpen={showGroupsModal}
          onClose={() => {
            setShowGroupsModal(false);
            loadPermissionData();
          }}
          permissionId={id!}
        />
      )}
    </div>
  );
}

