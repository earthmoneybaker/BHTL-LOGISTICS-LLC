import { FaTruck, FaGasPump, FaChartBar, FaClipboardList, FaFileAlt, FaCreditCard, FaBox, FaMoneyBillWave, FaChartLine, FaDollarSign, FaUsers, FaCar, FaHandshake, FaCog } from 'react-icons/fa';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { section: 'OVERVIEW', items: [
    { to: '/', label: 'Dashboard', icon: <FaChartBar /> },
  ]},
  { section: 'OPERATIONS', items: [
    { to: '/loads', label: 'Load Management', icon: <FaBox /> },
    { to: '/extract-load', label: 'Extract from Document', icon: <FaFileAlt /> },
    { to: '/customers', label: 'Customers', icon: <FaHandshake /> },
    { to: '/drivers', label: 'Drivers', icon: <FaCar /> },
    { to: '/fleet', label: 'Fleet', icon: <FaTruck /> },
  ]},
  { section: 'COMPLIANCE', items: [
    { to: '/compliance', label: 'Documents & Compliance', icon: <FaClipboardList /> },
  ]},
  { section: 'FINANCE', items: [
    { to: '/billing', label: 'Billing & Invoices', icon: <FaDollarSign /> },
    { to: '/other-revenue', label: 'Other Revenue', icon: <FaMoneyBillWave /> },
    { to: '/expenses', label: 'Expenses', icon: <FaCreditCard /> },
    { to: '/payroll', label: 'Payroll', icon: <FaMoneyBillWave /> },
    { to: '/pnl', label: 'Profit & Loss', icon: <FaChartLine />, adminOnly: true },
    { to: '/fuel', label: 'Fuel & IFTA', icon: <FaGasPump /> },
  ]},
  { section: 'ADMIN', items: [
    { to: '/users', label: 'User Management', icon: <FaUsers />, adminOnly: true },
    { to: '/settings', label: 'Settings', icon: <FaCog />, adminOnly: true },
    { to: '/import', label: 'Bulk Import', icon: '📥', adminOnly: true },
  ]},
];

export default function Sidebar({ open, onClose }) {
  const { user, logout, isAdmin } = useAuth();

  return (
    <>
      {open && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 99 }}
          onClick={onClose}
        />
      )}
      <nav className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-logo">
          <div className="company-name">BHTL Logistics LLC</div>
          <div className="company-tagline">Safety • Reliability • On Time</div>
          <div className="dot-mc">Dayton, Ohio</div>
        </div>

        <div className="sidebar-nav">
          {NAV_ITEMS.map(section => {
            const visibleItems = section.items.filter(i => !i.adminOnly || isAdmin);
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.section}>
                <div className="nav-section-label">{section.section}</div>
                {visibleItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    onClick={onClose}
                  >
                    <span className="nav-icon">{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </div>

        <div style={{ borderTop: '1px solid var(--border-color)', padding: '16px 20px' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            Signed in as
          </div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            {user?.name || user?.full_name}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--brand-orange)', textTransform: 'uppercase', fontWeight: 600 }}>
            {user?.role}
          </div>
          <button
            onClick={logout}
            className="btn btn-secondary btn-sm"
            style={{ marginTop: '10px', width: '100%' }}
          >
            Sign Out
          </button>
        </div>
      </nav>
    </>
  );
}
