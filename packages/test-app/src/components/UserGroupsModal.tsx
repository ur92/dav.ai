import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { getGroups, getGroupsForUser, addUserToGroup, removeUserFromGroup } from '../utils/storage';
import './UserGroupsModal.css';

interface UserGroupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export function UserGroupsModal({ isOpen, onClose, userId }: UserGroupsModalProps) {
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      const groups = getGroups();
      setAllGroups(groups);
      
      const userGroups = getGroupsForUser(userId);
      setSelectedGroupIds(new Set(userGroups.map((g) => g.id)));
    }
  }, [isOpen, userId]);

  const handleToggleGroup = (groupId: string) => {
    const newSelected = new Set(selectedGroupIds);
    if (newSelected.has(groupId)) {
      newSelected.delete(groupId);
      removeUserFromGroup(userId, groupId);
    } else {
      newSelected.add(groupId);
      addUserToGroup(userId, groupId);
    }
    setSelectedGroupIds(newSelected);
  };

  const handleSave = () => {
    // Update relationships based on current selection
    const currentGroups = getGroupsForUser(userId);
    const currentGroupIds = new Set(currentGroups.map((g) => g.id));

    // Remove groups that are no longer selected
    currentGroupIds.forEach((groupId) => {
      if (!selectedGroupIds.has(groupId)) {
        removeUserFromGroup(userId, groupId);
      }
    });

    // Add groups that are newly selected
    selectedGroupIds.forEach((groupId) => {
      if (!currentGroupIds.has(groupId)) {
        addUserToGroup(userId, groupId);
      }
    });

    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage User Groups">
      <div className="user-groups-modal">
        <div className="modal-description">
          Select the groups this user should belong to:
        </div>
        <div className="groups-list">
          {allGroups.length === 0 ? (
            <p className="empty-message">No groups available</p>
          ) : (
            allGroups.map((group) => (
              <label key={group.id} className="group-checkbox-item">
                <input
                  type="checkbox"
                  checked={selectedGroupIds.has(group.id)}
                  onChange={() => handleToggleGroup(group.id)}
                />
                <div className="group-info">
                  <span className="group-name">{group.name}</span>
                  {group.description && (
                    <span className="group-description">{group.description}</span>
                  )}
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

