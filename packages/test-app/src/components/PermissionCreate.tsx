import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addPermission } from '../utils/storage';
import './PermissionCreate.css';

export function PermissionCreate() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name) {
      setError('Please enter a permission name');
      return;
    }

    addPermission({ name, description });
    navigate('/permissions/list', { state: { successMessage: 'Permission created successfully!' } });
  };

  return (
    <div className="permission-create-container">
      <div className="permission-create-card">
        <div className="permission-create-header">
          <h1>Create New Permission</h1>
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
          <button type="submit" className="create-button">
            Create Permission
          </button>
        </form>
      </div>
    </div>
  );
}

