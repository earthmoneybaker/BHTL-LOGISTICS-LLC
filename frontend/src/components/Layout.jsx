import { FaCrown, FaBars, FaSun, FaMoon } from 'react-icons/fa';
import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';

const PAGE_TITLES = {
  '/': 'Dashboard',
  '/loads': 'Load Management',
  '/customers': 'Customers',
  '/drivers': 'Drivers',
  '/fleet': 'Fleet Management',
  '/compliance': 'Documents & Compliance',
  '/billing': 'Billing & Invoices',
  '/expenses': 'Expenses',
  '/payroll': 'Payroll',
  '/pnl': 'Profit & Loss',
  '/fuel': 'Fuel & IFTA',
  '/users': 'User Management',
  '/settings': 'Company Settings',
};

export default function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [theme, setTheme] = useState(() => localStorage.getItem('bhtl_theme') || 'dark');
  const { user } = useAuth();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bhtl_theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  const location = useLocation();

  const title = Object.entries(PAGE_TITLES).find(([path]) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)
  )?.[1] || 'BHTL Logistics';

  const initials = user?.name
    ? user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0,2)
    : 'AU';

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

          <button
            className="btn btn-ghost btn-icon"
            onClick={toggleTheme}
            aria-label="Toggle light/dark mode"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
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
