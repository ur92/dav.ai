import { useState, useEffect } from 'react';
import { Modal } from './Modal';
import {
  getPermissions,
  getPermissionsForUser,
  getGroupsForUser,
  getPermissionsForGroup,
  getEffectivePermissions,
  addPermissionToUser,
  removePermissionFromUser,
} from '../utils/storage';
import './UserPermissionsModal.css';

interface UserPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
}

export function UserPermissionsModal({ isOpen, onClose, userId }: UserPermissionsModalProps) {
  const [allPermissions, setAllPermissions] = useState<any[]>([]);
  const [directPermissionIds, setDirectPermissionIds] = useState<Set<string>>(new Set());
  const [effectivePermissionIds, setEffectivePermissionIds] = useState<Set<string>>(new Set());
  const [groupPermissionIds, setGroupPermissionIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isOpen) {
      const permissions = getPermissions();
      setAllPermissions(permissions);

      const directPerms = getPermissionsForUser(userId);
      setDirectPermissionIds(new Set(directPerms.map((p) => p.id)));

      const effectivePerms = getEffectivePermissions(userId);
      setEffectivePermissionIds(new Set(effectivePerms.map((p) => p.id)));

      // Calculate permissions from groups
      const userGroups = getGroupsForUser(userId);
      const groupPermIds = new Set<string>();
      userGroups.forEach((group) => {
        const groupPerms = getPermissionsForGroup(group.id);
        groupPerms.forEach((perm) => groupPermIds.add(perm.id));
      });
      setGroupPermissionIds(groupPermIds);
    }
  }, [isOpen, userId]);

  const handleTogglePermission = (permissionId: string) => {
    const newSelected = new Set(directPermissionIds);
    if (newSelected.has(permissionId)) {
      newSelected.delete(permissionId);
      removePermissionFromUser(userId, permissionId);
    } else {
      newSelected.add(permissionId);
      addPermissionToUser(userId, permissionId);
    }
    setDirectPermissionIds(newSelected);
  };

  const handleSave = () => {
    // Update relationships based on current selection
    const currentPerms = getPermissionsForUser(userId);
    const currentPermIds = new Set(currentPerms.map((p) => p.id));

    // Remove permissions that are no longer selected
    currentPermIds.forEach((permId) => {
      if (!directPermissionIds.has(permId)) {
        removePermissionFromUser(userId, permId);
      }
    });

    // Add permissions that are newly selected
    directPermissionIds.forEach((permId) => {
      if (!currentPermIds.has(permId)) {
        addPermissionToUser(userId, permId);
      }
    });

    onClose();
  };

  const getPermissionSource = (permissionId: string): string => {
    if (directPermissionIds.has(permissionId) && groupPermissionIds.has(permissionId)) {
      return 'Direct + Group';
    } else if (directPermissionIds.has(permissionId)) {
      return 'Direct';
    } else if (groupPermissionIds.has(permissionId)) {
      return 'From Group';
    }
    return '';
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Manage User Permissions">
      <div className="user-permissions-modal">
        <div className="modal-description">
          Manage direct permissions for this user. Permissions inherited from groups are shown but cannot be modified here.
        </div>
        <div className="permissions-list">
          {allPermissions.length === 0 ? (
            <p className="empty-message">No permissions available</p>
          ) : (
            allPermissions.map((permission) => {
              const isEffective = effectivePermissionIds.has(permission.id);
              const isDirect = directPermissionIds.has(permission.id);
              const isFromGroup = groupPermissionIds.has(permission.id);
              const source = getPermissionSource(permission.id);

              return (
                <label
                  key={permission.id}
                  className={`permission-checkbox-item ${isEffective ? 'effective' : ''} ${permission.isCustom ? 'custom' : 'built-in'}`}
                >
                  <input
                    type="checkbox"
                    checked={isDirect}
                    onChange={() => handleTogglePermission(permission.id)}
                    disabled={!isDirect && !isFromGroup && false}
                  />
                  <div className="permission-info">
                    <div className="permission-header">
                      <span className="permission-name">{permission.name}</span>
                      {permission.isCustom && <span className="custom-badge">Custom</span>}
                      {source && <span className="source-badge">{source}</span>}
                    </div>
                    {permission.description && (
                      <span className="permission-description">{permission.description}</span>
                    )}
                    {isFromGroup && !isDirect && (
                      <span className="inherited-note">(Inherited from group)</span>
                    )}
                  </div>
                </label>
              );
            })
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

