import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getGroups, getUsersInGroup, getPermissionsForGroup, type Group } from '../utils/storage';
import { GroupMembersModal } from './GroupMembersModal';
import { GroupPermissionsModal } from './GroupPermissionsModal';
import './GroupDetail.css';

export function GroupDetail() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [group, setGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);

  useEffect(() => {
    if (!id) {
      navigate('/groups/list');
      return;
    }

    loadGroupData();
  }, [id, navigate]);

  const loadGroupData = () => {
    if (!id) return;

    const groups = getGroups();
    const foundGroup = groups.find((g) => g.id === id);
    if (!foundGroup) {
      navigate('/groups/list');
      return;
    }

    setGroup(foundGroup);
    setMembers(getUsersInGroup(id));
    setPermissions(getPermissionsForGroup(id));
  };

  if (!group) {
    return <div>Loading...</div>;
  }

  return (
    <div className="group-detail-container">
      <div className="group-detail-header">
        <h1>Group Details</h1>
        <button onClick={() => navigate('/groups/list')} className="back-button">
          ← Back to Groups
        </button>
      </div>

      <div className="group-detail-content">
        <div className="detail-card">
          <h2>Group Information</h2>
          <div className="detail-field">
            <label>Name:</label>
            <span>{group.name}</span>
          </div>
          <div className="detail-field">
            <label>Description:</label>
            <span>{group.description || '-'}</span>
          </div>
          <div className="detail-actions">
            <button
              onClick={() => navigate(`/groups/edit/${group.id}`)}
              className="edit-button"
            >
              Edit Group
            </button>
          </div>
        </div>

        <div className="detail-card">
          <div className="detail-card-header">
            <h2>Members ({members.length})</h2>
            <button
              onClick={() => setShowMembersModal(true)}
              className="manage-button"
            >
              Manage Members
            </button>
          </div>
          {members.length === 0 ? (
            <p className="empty-message">No members assigned</p>
          ) : (
            <div className="items-list">
              {members.map((member) => (
                <div key={member.id} className="item-badge">
                  {member.username}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="detail-card">
          <div className="detail-card-header">
            <h2>Permissions ({permissions.length})</h2>
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

      {showMembersModal && (
        <GroupMembersModal
          isOpen={showMembersModal}
          onClose={() => {
            setShowMembersModal(false);
            loadGroupData();
          }}
          groupId={id!}
        />
      )}

      {showPermissionsModal && (
        <GroupPermissionsModal
          isOpen={showPermissionsModal}
          onClose={() => {
            setShowPermissionsModal(false);
            loadGroupData();
          }}
          groupId={id!}
        />
      )}
    </div>
  );
}

