import { FaInbox } from 'react-icons/fa';
// Status badge for loads, invoices, trucks, etc.
export function StatusBadge({ status }) {
  if (!status) return null;
  const label = status.replace(/_/g, ' ');
  return <span className={`badge badge-${status.toLowerCase()}`}>{label}</span>;
}

// Expiration date badge with color coding
export function ExpirationBadge({ date, label }) {
  if (!date) return <span className="no-data">—</span>;
  const d = new Date(date);
  const now = new Date();
  const diff = Math.floor((d - now) / (1000 * 60 * 60 * 24));

  let cls = 'exp-ok';
  let prefix = '';
  if (diff < 0) { cls = 'exp-expired'; prefix = 'EXPIRED'; }
  else if (diff <= 30) { cls = 'exp-danger'; prefix = `${diff}d`; }
  else if (diff <= 90) { cls = 'exp-warning'; prefix = `${diff}d`; }

  return (
    <span className={cls} title={label}>
      {prefix ? `${prefix} — ` : ''}{d.toLocaleDateString()}
    </span>
  );
}

// Simple confirmation dialog
export function ConfirmModal({ title, message, onConfirm, onCancel, danger = true }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal modal-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{message}</p>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// Spinner
export function Spinner() {
  return (
    <div className="spinner-wrapper">
      <div className="spinner" />
    </div>
  );
}

// Empty state
export function EmptyState({ icon = <FaInbox />, title = 'No data found', description = '', action }) {
  return (
    <div className="empty-state">
      <div className="empty-state-icon">{icon}</div>
      <div className="empty-state-title">{title}</div>
      {description && <div className="empty-state-desc">{description}</div>}
      {action && <div style={{ marginTop: '20px' }}>{action}</div>}
    </div>
  );
}

// Page header
export function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="flex gap-8 flex-wrap">{actions}</div>}
    </div>
  );
}

// Modal wrapper
export function Modal({ title, onClose, children, footer, size = '' }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className={`modal ${size}`} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

// Format currency
export function formatCurrency(val) {
  if (val == null || val === '') return '—';
  return `$${parseFloat(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Format date
export function formatDate(val) {
  if (!val) return '—';
  return new Date(val).toLocaleDateString('en-US');
}

// Days until expiration
export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = Math.floor((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
  return diff;
}
