import { NavLink } from 'react-router-dom';
import './Sidebar.css';

export function Sidebar() {
  return (
    <div className="sidebar">
      <nav className="sidebar-nav">
        <NavLink to="/" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
          Dashboard
        </NavLink>
        <div className="sidebar-section">
          <div className="sidebar-section-title">Users</div>
          <NavLink
            to="/users/list"
            className={({ isActive }) => `sidebar-item sidebar-subitem ${isActive ? 'active' : ''}`}
          >
            List Users
          </NavLink>
          <NavLink
            to="/users/create"
            className={({ isActive }) => `sidebar-item sidebar-subitem ${isActive ? 'active' : ''}`}
          >
            Create User
          </NavLink>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-section-title">Groups</div>
          <NavLink
            to="/groups/list"
            className={({ isActive }) => `sidebar-item sidebar-subitem ${isActive ? 'active' : ''}`}
          >
            List Groups
          </NavLink>
          <NavLink
            to="/groups/create"
            className={({ isActive }) => `sidebar-item sidebar-subitem ${isActive ? 'active' : ''}`}
          >
            Create Group
          </NavLink>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-section-title">Permissions</div>
          <NavLink
            to="/permissions/list"
            className={({ isActive }) => `sidebar-item sidebar-subitem ${isActive ? 'active' : ''}`}
          >
            List Permissions
          </NavLink>
          <NavLink
            to="/permissions/create"
            className={({ isActive }) => `sidebar-item sidebar-subitem ${isActive ? 'active' : ''}`}
          >
            Create Permission
          </NavLink>
        </div>
      </nav>
    </div>
  );
}

