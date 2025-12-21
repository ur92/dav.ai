import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getPermissions, updatePermission, type Permission } from '../utils/storage';
import './PermissionEdit.css';

export function PermissionEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [permission, setPermission] = useState<Permission | null>(null);

  useEffect(() => {
    if (!id) {
      navigate('/permissions/list');
      return;
    }

    const permissions = getPermissions();
    const foundPermission = permissions.find((p) => p.id === id);
    if (!foundPermission || !foundPermission.isCustom) {
      navigate('/permissions/list');
      return;
    }

    setPermission(foundPermission);
    setName(foundPermission.name);
    setDescription(foundPermission.description);
  }, [id, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name) {
      setError('Please enter a permission name');
      return;
    }

    if (!id) return;

    updatePermission(id, { name, description });
    navigate('/permissions/list', { state: { successMessage: 'Permission updated successfully!' } });
  };

  if (!permission) {
    return <div>Loading...</div>;
  }

  return (
    <div className="permission-edit-container">
      <div className="permission-edit-card">
        <div className="permission-edit-header">
          <h1>Edit Permission</h1>
          <button onClick={() => navigate('/permissions/list')} className="back-button">
            ← Back to Permissions
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Permission Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter permission name"
            />
          </div>
          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter permission description (optional)"
              rows={4}
            />
          </div>
          {error && <p className="error-message">{error}</p>}
          <button type="submit" className="save-button">
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );
}

