import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import {
  getPermissions,
  getPermissionsForGroup,
  addPermissionToGroup,
  removePermissionFromGroup,
} from '../utils/storage';
import './GroupPermissionsModal.css';

interface GroupPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
}

export function GroupPermissionsModal({ isOpen, onClose, groupId }: GroupPermissionsModalProps) {
  const [allPermissions, setAllPermissions] = useState<any[]>([]);
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      const permissions = getPermissions();
      setAllPermissions(permissions);
      
      const groupPerms = getPermissionsForGroup(groupId);
      setSelectedPermissionIds(new Set(groupPerms.map((p) => p.id)));
    }
  }, [isOpen, groupId]);

  const handleTogglePermission = (permissionId: string) => {
    const newSelected = new Set(selectedPermissionIds);
    if (newSelected.has(permissionId)) {
      newSelected.delete(permissionId);
      removePermissionFromGroup(groupId, permissionId);
    } else {
      newSelected.add(permissionId);
      addPermissionToGroup(groupId, permissionId);
    }
    setSelectedPermissionIds(newSelected);
  };

  const handleSave = () => {
    // Update relationships based on current selection
    const currentPerms = getPermissionsForGroup(groupId);
    const currentPermIds = new Set(currentPerms.map((p) => p.id));

    // Remove permissions that are no longer selected
    currentPermIds.forEach((permId) => {
      if (!selectedPermissionIds.has(permId)) {
        removePermissionFromGroup(groupId, permId);
      }
    });

    // Add permissions that are newly selected
    selectedPermissionIds.forEach((permId) => {
      if (!currentPermIds.has(permId)) {
        addPermissionToGroup(groupId, permId);
      }
    });

    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage Group Permissions">
      <div className="group-permissions-modal">
        <div className="modal-description">
          Select the permissions this group should have:
        </div>
        <div className="permissions-list">
          {allPermissions.length === 0 ? (
            <p className="empty-message">No permissions available</p>
          ) : (
            allPermissions.map((permission) => (
              <label
                key={permission.id}
                className={`permission-checkbox-item ${permission.isCustom ? 'custom' : 'built-in'}`}
              >
                <input
                  type="checkbox"
                  checked={selectedPermissionIds.has(permission.id)}
                  onChange={() => handleTogglePermission(permission.id)}
                />
                <div className="permission-info">
                  <div className="permission-header">
                    <span className="permission-name">{permission.name}</span>
                    {permission.isCustom && <span className="custom-badge">Custom</span>}
                  </div>
                  {permission.description && (
                    <span className="permission-description">{permission.description}</span>
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

