import { useNavigate } from 'react-router-dom';
import { getUsers, getGroups, getPermissions } from '../utils/storage';
import './Dashboard.css';

export function Dashboard() {
  const navigate = useNavigate();
  const users = getUsers();
  const groups = getGroups();
  const permissions = getPermissions();

  return (
    <div className="dashboard">
      <h1 className="dashboard-title">Dashboard</h1>
      
      <div className="dashboard-stats">
        <div className="stat-card" onClick={() => navigate('/users/list')}>
          <div className="stat-icon">👥</div>
          <div className="stat-content">
            <div className="stat-value">{users.length}</div>
            <div className="stat-label">Users</div>
          </div>
        </div>
        
        <div className="stat-card" onClick={() => navigate('/groups/list')}>
          <div className="stat-icon">👤</div>
          <div className="stat-content">
            <div className="stat-value">{groups.length}</div>
            <div className="stat-label">Groups</div>
          </div>
        </div>
        
        <div className="stat-card" onClick={() => navigate('/permissions/list')}>
          <div className="stat-icon">🔐</div>
          <div className="stat-content">
            <div className="stat-value">{permissions.length}</div>
            <div className="stat-label">Permissions</div>
          </div>
        </div>
      </div>

      <div className="dashboard-actions">
        <h2 className="dashboard-section-title">Quick Actions</h2>
        <div className="action-buttons">
          <button className="action-button" onClick={() => navigate('/users/create')}>
            Create User
          </button>
          <button className="action-button" onClick={() => navigate('/groups/create')}>
            Create Group
          </button>
          <button className="action-button" onClick={() => navigate('/permissions/create')}>
            Create Permission
          </button>
        </div>
      </div>
    </div>
  );
}

