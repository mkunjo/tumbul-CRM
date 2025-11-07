import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Layout.css';

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/clients', label: 'Clients', icon: '👥' },
    { path: '/projects', label: 'Projects', icon: '📁' },
    { path: '/invoices', label: 'Invoices', icon: '💰' },
    { path: '/expenses', label: 'Expenses', icon: '💳' },
    { path: '/time-entries', label: 'Time Tracking', icon: '⏱️' },
  ];

  const isActive = (path) => location.pathname.startsWith(path);

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="logo">Tumbul CRM</h1>
          <p className="logo-subtitle">Contractor Management</p>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${isActive(item.path) ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className="user-avatar">
              {user?.email?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="user-details">
              <div className="user-name">{user?.email}</div>
              <div className="user-role">{user?.subscription_plan || 'Free'}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="btn btn-outline btn-sm logout-btn">
            Logout
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="content-wrapper">{children}</div>
      </main>
    </div>
  );
};

export default Layout;
