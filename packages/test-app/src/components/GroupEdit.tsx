import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getGroups, updateGroup, type Group } from '../utils/storage';
import './GroupEdit.css';

export function GroupEdit() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [group, setGroup] = useState<Group | null>(null);

  useEffect(() => {
    if (!id) {
      navigate('/groups/list');
      return;
    }

    const groups = getGroups();
    const foundGroup = groups.find((g) => g.id === id);
    if (!foundGroup) {
      navigate('/groups/list');
      return;
    }

    setGroup(foundGroup);
    setName(foundGroup.name);
    setDescription(foundGroup.description);
  }, [id, navigate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name) {
      setError('Please enter a group name');
      return;
    }

    if (!id) return;

    updateGroup(id, { name, description });
    navigate('/groups/list', { state: { successMessage: 'Group updated successfully!' } });
  };

  if (!group) {
    return <div>Loading...</div>;
  }

  return (
    <div className="group-edit-container">
      <div className="group-edit-card">
        <div className="group-edit-header">
          <h1>Edit Group</h1>
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
          <button type="submit" className="save-button">
            Save Changes
          </button>
        </form>
      </div>
    </div>
  );
}

