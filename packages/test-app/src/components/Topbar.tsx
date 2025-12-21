import { useNavigate } from 'react-router-dom';
import { logout, getUsers, isAuthenticated } from '../utils/storage';
import './Topbar.css';

export function Topbar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const getCurrentUsername = () => {
    // In a real app, we'd store the current user ID
    // For now, we'll just show "Admin" or get from auth state
    if (isAuthenticated()) {
      const users = getUsers();
      // Return first user as current user for demo purposes
      return users.length > 0 ? users[0].username : 'Admin';
    }
    return '';
  };

  return (
    <div className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-title">Admin Panel</h1>
      </div>
      <div className="topbar-right">
        <span className="topbar-username">{getCurrentUsername()}</span>
        <button className="topbar-logout" onClick={handleLogout}>
          Logout
        </button>
      </div>
    </div>
  );
}

