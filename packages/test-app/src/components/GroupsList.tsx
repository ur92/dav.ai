import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { getGroups, deleteGroup, getUsersInGroup, type Group } from '../utils/storage';
import './GroupsList.css';

export function GroupsList() {
  const navigate = useNavigate();
  const location = useLocation();
  const [groups, setGroups] = useState<(Group & { memberCount: number })[]>([]);
  const [toastMessage, setToastMessage] = useState<string>('');

  useEffect(() => {
    loadGroups();
    
    if (location.state?.successMessage) {
      setToastMessage(location.state.successMessage);
      window.history.replaceState({}, document.title);
      
      const timer = setTimeout(() => {
        setToastMessage('');
      }, 10000);
      
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  const loadGroups = () => {
    const allGroups = getGroups();
    const groupsWithCounts = allGroups.map((group) => ({
      ...group,
      memberCount: getUsersInGroup(group.id).length,
    }));
    setGroups(groupsWithCounts);
  };

  const handleDeleteGroup = (id: string) => {
    deleteGroup(id);
    loadGroups();
    setToastMessage('Group deleted successfully');
    
    setTimeout(() => {
      setToastMessage('');
    }, 10000);
  };

  return (
    <div className="groups-container">
      {toastMessage && (
        <div className="toast">
          <div className="toast-content">
            <span className="toast-message">{toastMessage}</span>
            <button 
              className="toast-close" 
              onClick={() => setToastMessage('')}
              aria-label="Close toast"
            >
              ×
            </button>
          </div>
        </div>
      )}
      <div className="groups-header">
        <h1>Group Management</h1>
        <div className="header-actions">
          <button onClick={() => navigate('/groups/create')} className="create-button-header">
            Create Group
          </button>
        </div>
      </div>

      <div className="groups-list-card">
        <h2>Groups List</h2>
        {groups.length === 0 ? (
          <p className="empty-message">No groups found</p>
        ) : (
          <div className="groups-table">
            <div className="table-header">
              <div className="table-cell">Name</div>
              <div className="table-cell">Description</div>
              <div className="table-cell">Members</div>
              <div className="table-cell">Actions</div>
            </div>
            {groups.map((group) => (
              <div key={group.id} className="table-row">
                <div className="table-cell">{group.name}</div>
                <div className="table-cell">{group.description || '-'}</div>
                <div className="table-cell">{group.memberCount}</div>
                <div className="table-cell">
                  <div className="action-buttons">
                    <button
                      onClick={() => navigate(`/groups/${group.id}`)}
                      className="view-button"
                    >
                      View
                    </button>
                    <button
                      onClick={() => navigate(`/groups/edit/${group.id}`)}
                      className="edit-button"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteGroup(group.id)}
                      className="delete-button"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

