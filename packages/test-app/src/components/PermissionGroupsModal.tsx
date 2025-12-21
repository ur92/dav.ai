import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import {
  getGroups,
  getGroupPermissions,
  addPermissionToGroup,
  removePermissionFromGroup,
} from '../utils/storage';
import './PermissionGroupsModal.css';

interface PermissionGroupsModalProps {
  isOpen: boolean;
  onClose: () => void;
  permissionId: string;
}

export function PermissionGroupsModal({ isOpen, onClose, permissionId }: PermissionGroupsModalProps) {
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      const groups = getGroups();
      setAllGroups(groups);
      
      const groupPerms = getGroupPermissions();
      const groupIds = groupPerms
        .filter((gp) => gp.permissionId === permissionId)
        .map((gp) => gp.groupId);
      setSelectedGroupIds(new Set(groupIds));
    }
  }, [isOpen, permissionId]);

  const handleToggleGroup = (groupId: string) => {
    const newSelected = new Set(selectedGroupIds);
    if (newSelected.has(groupId)) {
      newSelected.delete(groupId);
      removePermissionFromGroup(groupId, permissionId);
    } else {
      newSelected.add(groupId);
      addPermissionToGroup(groupId, permissionId);
    }
    setSelectedGroupIds(newSelected);
  };

  const handleSave = () => {
    // Update relationships based on current selection
    const groupPerms = getGroupPermissions();
    const currentGroupIds = new Set(
      groupPerms
        .filter((gp) => gp.permissionId === permissionId)
        .map((gp) => gp.groupId)
    );

    // Remove groups that are no longer selected
    currentGroupIds.forEach((groupId) => {
      if (!selectedGroupIds.has(groupId)) {
        removePermissionFromGroup(groupId, permissionId);
      }
    });

    // Add groups that are newly selected
    selectedGroupIds.forEach((groupId) => {
      if (!currentGroupIds.has(groupId)) {
        addPermissionToGroup(groupId, permissionId);
      }
    });

    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage Permission Groups">
      <div className="permission-groups-modal">
        <div className="modal-description">
          Select the groups that should have this permission:
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

