import { useState } from 'react';
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
  const { user } = useAuth();
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
            ☰
          </button>

          <div className="topbar-title">{title}</div>

          <div className="topbar-spacer" />

          <div className="topbar-user">
            <div>
              <div className="topbar-user-name">{user?.name || user?.full_name}</div>
              <div className="topbar-user-role">{user?.role === 'admin' ? '👑 Admin' : 'Office Staff'}</div>
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
