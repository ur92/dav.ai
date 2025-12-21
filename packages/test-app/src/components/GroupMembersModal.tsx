import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { getUsers, getUsersInGroup, addUserToGroup, removeUserFromGroup } from '../utils/storage';
import './GroupMembersModal.css';

interface GroupMembersModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
}

export function GroupMembersModal({ isOpen, onClose, groupId }: GroupMembersModalProps) {
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      const users = getUsers();
      setAllUsers(users);
      
      const groupUsers = getUsersInGroup(groupId);
      setSelectedUserIds(new Set(groupUsers.map((u) => u.id)));
    }
  }, [isOpen, groupId]);

  const handleToggleUser = (userId: string) => {
    const newSelected = new Set(selectedUserIds);
    if (newSelected.has(userId)) {
      newSelected.delete(userId);
      removeUserFromGroup(userId, groupId);
    } else {
      newSelected.add(userId);
      addUserToGroup(userId, groupId);
    }
    setSelectedUserIds(newSelected);
  };

  const handleSave = () => {
    // Update relationships based on current selection
    const currentUsers = getUsersInGroup(groupId);
    const currentUserIds = new Set(currentUsers.map((u) => u.id));

    // Remove users that are no longer selected
    currentUserIds.forEach((userId) => {
      if (!selectedUserIds.has(userId)) {
        removeUserFromGroup(userId, groupId);
      }
    });

    // Add users that are newly selected
    selectedUserIds.forEach((userId) => {
      if (!currentUserIds.has(userId)) {
        addUserToGroup(userId, groupId);
      }
    });

    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage Group Members">
      <div className="group-members-modal">
        <div className="modal-description">
          Select the users that should belong to this group:
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

