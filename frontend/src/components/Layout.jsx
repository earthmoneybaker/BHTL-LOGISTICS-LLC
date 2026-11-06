import { FaCrown, FaBars, FaSun, FaMoon, FaBell, FaTasks } from 'react-icons/fa';
import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import api from '../api/client';

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/live-stats': '⚡ Live Command Center',
  '/todos': 'To-Do & Reminders',
  '/reports': 'Weekly Reports',
  '/deductions': 'Deduction Settings',
  '/loads': 'Load Management',
  '/customers': 'Customers',
  '/drivers': 'Drivers',
  '/fleet': 'Fleet Management',
  '/compliance': 'Documents & Compliance',
  '/billing': 'Billing & Invoices',
  '/expenses': 'Expenses',
  '/payroll': 'Payroll',
  '/pnl': 'Profit & Loss',
  '/settlements': 'Driver Settlements',
  '/fuel': 'Fuel & IFTA',
  '/users': 'User Management',
  '/settings': 'Company Settings',
  '/staff': 'Staff Management',
};

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('bhtl_theme') || 'dark');
  const [upcomingTodos, setUpcomingTodos] = useState([]);
  const [showBell, setShowBell] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bhtl_theme', theme);
  }, [theme]);

  // Load upcoming todos for bell notification
  useEffect(() => {
    api.get('/todos/upcoming').then(r => {
      setUpcomingTodos(r.data || []);
    }).catch(() => {});
  }, []);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  const location = useLocation();

  const title = Object.entries(PAGE_TITLES).find(([path]) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  )?.[1] || 'BHTL Logistics';

  const initials = user?.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.name ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'AU';

  return (
    <div className="app-layout">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="main-content">
        <header className="topbar">
          <button
            className="mobile-menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <FaBars />
          </button>

          <div className="topbar-title">{title}</div>

          <div className="topbar-spacer" />

          {/* Upcoming Todos Bell */}
          <div style={{ position: 'relative' }}>
            <Link
              to="/todos"
              title={upcomingTodos.length > 0 ? `${upcomingTodos.length} tasks due soon` : 'To-Do List'}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 36, height: 36, borderRadius: 8, background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border-color)', cursor: 'pointer', color: 'var(--text-primary)',
                textDecoration: 'none', position: 'relative', transition: 'all 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.06)'}
            >
              <FaBell style={{ fontSize: 15, color: upcomingTodos.length > 0 ? 'var(--brand-orange)' : 'var(--text-muted)' }} />
              {upcomingTodos.length > 0 && (
                <span style={{
                  position: 'absolute', top: -4, right: -4,
                  background: 'var(--danger)', color: '#fff', fontSize: 9,
                  fontWeight: 800, borderRadius: 10, padding: '1px 5px', minWidth: 14, textAlign: 'center',
                  lineHeight: '14px',
                }}>
                  {upcomingTodos.length}
                </span>
              )}
            </Link>
          </div>

          <button
            className="btn btn-ghost btn-icon"
            onClick={toggleTheme}
            aria-label="Toggle light/dark mode"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            style={{ marginLeft: 8 }}
          >
            {theme === 'dark' ? <FaSun /> : <FaMoon />}
          </button>

          <div className="topbar-user">
            <div>
              <div className="topbar-user-name">{user?.name || user?.full_name}</div>
              <div className="topbar-user-role">{user?.role === 'admin' ? <><FaCrown /> Admin</> : 'Office Staff'}</div>
            </div>
            <div className="topbar-avatar">{initials}</div>
          </div>
        </header>

        <main className="page-content">
          {children}
        </main>
      </div>
    </div>
  );
}
