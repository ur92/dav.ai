import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { addGroup } from '../utils/storage';
import './GroupCreate.css';

export function GroupCreate() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name) {
      setError('Please enter a group name');
      return;
    }

    addGroup({ name, description });
    navigate('/groups/list', { state: { successMessage: 'Group created successfully!' } });
  };

  return (
    <div className="group-create-container">
      <div className="group-create-card">
        <div className="group-create-header">
          <h1>Create New Group</h1>
          <button onClick={() => navigate('/groups/list')} className="back-button">
            ← Back to Groups
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Group Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter group name"
            />
          </div>
          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter group description (optional)"
              rows={4}
            />
          </div>
          {error && <p className="error-message">{error}</p>}
          <button type="submit" className="create-button">
            Create Group
          </button>
        </form>
      </div>
    </div>
  );
}

