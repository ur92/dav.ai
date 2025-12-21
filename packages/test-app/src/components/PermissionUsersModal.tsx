import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import {
  getUsers,
  getUserPermissions,
  addPermissionToUser,
  removePermissionFromUser,
} from '../utils/storage';
import './PermissionUsersModal.css';

interface PermissionUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  permissionId: string;
}

export function PermissionUsersModal({ isOpen, onClose, permissionId }: PermissionUsersModalProps) {
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      const users = getUsers();
      setAllUsers(users);
      
      const userPerms = getUserPermissions();
      const userIds = userPerms
        .filter((up) => up.permissionId === permissionId)
        .map((up) => up.userId);
      setSelectedUserIds(new Set(userIds));
    }
  }, [isOpen, permissionId]);

  const handleToggleUser = (userId: string) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
      removePermissionFromUser(userId, permissionId);
    } else {
      newSelected.add(userId);
      addPermissionToUser(userId, permissionId);
    }
    setSelectedUserIds(newSelected);
  };

  const handleSave = () => {
    // Update relationships based on current selection
    const userPerms = getUserPermissions();
    const currentUserIds = new Set(
      userPerms
        .filter((up) => up.permissionId === permissionId)
        .map((up) => up.userId)
    );

    // Remove users that are no longer selected
    currentUserIds.forEach((userId) => {
      if (!selectedUserIds.has(userId)) {
        removePermissionFromUser(userId, permissionId);
      }
    });

    // Add users that are newly selected
    selectedUserIds.forEach((userId) => {
      if (!currentUserIds.has(userId)) {
        addPermissionToUser(userId, permissionId);
      }
    });

    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage Permission Users">
      <div className="permission-users-modal">
        <div className="modal-description">
          Select the users that should have this permission:
        </div>
        <div className="users-list">
          {allUsers.length === 0 ? (
            <p className="empty-message">No users available</p>
          ) : (
            allUsers.map((user) => (
              <label key={user.id} className="user-checkbox-item">
                <input
                  type="checkbox"
                  checked={selectedUserIds.has(user.id)}
                  onChange={() => handleToggleUser(user.id)}
                />
                <div className="user-info">
                  <span className="user-name">{user.username}</span>
                </div>
              </label>
            ))
          )}
        </div>
        <div className="modal-actions">
          <button onClick={onClose} className="cancel-button">
            Cancel
          </button>
          <button onClick={handleSave} className="save-button">
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

