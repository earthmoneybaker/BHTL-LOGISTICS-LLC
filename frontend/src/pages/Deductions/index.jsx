import {
  FaMinusCircle, FaPlus, FaTrash, FaEdit, FaExclamationTriangle,
  FaDollarSign, FaPercent, FaBell, FaInfoCircle, FaCalendarWeek
} from 'react-icons/fa';
import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import { Spinner, PageHeader, Modal, formatCurrency, ConfirmModal } from '../../components/ui';
import toast from 'react-hot-toast';

const DEDUCTION_TYPE_LABELS = {
  fixed_weekly: 'Fixed (Weekly)',
  fixed_monthly: 'Fixed (Monthly)',
  percentage_revenue: '% of Revenue',
  per_load: 'Per Load',
};

const FREQUENCY_LABELS = {
  weekly: '📅 Weekly',
  twice_monthly: '⚠️ Twice/Month',
  monthly: '📆 Monthly',
  per_load: '📦 Per Load',
  percentage: '% Revenue',
};

const FREQUENCY_COLORS = {
  weekly: { bg: 'rgba(59,130,246,0.12)', color: '#3B82F6' },
  twice_monthly: { bg: 'rgba(245,158,11,0.15)', color: '#F59E0B' },
  monthly: { bg: 'rgba(16,185,129,0.12)', color: '#10B981' },
  per_load: { bg: 'rgba(139,92,246,0.12)', color: '#8B5CF6' },
  percentage: { bg: 'rgba(249,115,22,0.12)', color: '#F97316' },
};

// Check for duplicate "twice_monthly" that might have already been applied this week
function getDuplicateWarning(deductions) {
  const twiceMonthly = deductions.filter(d => d.frequency === 'twice_monthly' && d.is_active);
  if (twiceMonthly.length === 0) return null;
  return `⚠️ You have ${twiceMonthly.length} twice-monthly deduction${twiceMonthly.length > 1 ? 's' : ''} (${twiceMonthly.map(d => d.name).join(', ')}). These should only be applied twice per month — verify that reports for this period haven't already included them.`;
}

function DeductionForm({ onSaved, onClose, editing }) {
  const [form, setForm] = useState({
    name: editing?.name || '',
    description: editing?.description || '',
    deduction_type: editing?.deduction_type || 'fixed_weekly',
    amount: editing?.amount || '',
    percentage: editing?.percentage || '',
    applies_to: editing?.applies_to || 'truck',
    is_active: editing?.is_active !== false,
    sort_order: editing?.sort_order || 0,
    frequency: editing?.frequency || 'weekly',
  });
  const [saving, setSaving] = useState(false);
  const f = k => e => setForm(p => ({
    ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value
  }));

  const isPercentage = form.deduction_type === 'percentage_revenue';

  const handleSave = async () => {
    if (!form.name) { toast.error('Name required'); return; }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/deductions/${editing.id}`, form);
        toast.success('Deduction updated');
      } else {
        await api.post('/deductions', form);
        toast.success('Deduction added');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="form-group">
        <label className="form-label">Name *</label>
        <input className="form-input" value={form.name} onChange={f('name')} placeholder="e.g. ELD Fee" />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <input className="form-input" value={form.description} onChange={f('description')} placeholder="How is this calculated?" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="form-group">
          <label className="form-label">Deduction Type</label>
          <select className="form-input" value={form.deduction_type} onChange={f('deduction_type')}>
            {Object.entries(DEDUCTION_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Applies To</label>
          <select className="form-input" value={form.applies_to} onChange={f('applies_to')}>
            <option value="truck">Per Truck</option>
            <option value="driver">Per Driver</option>
            <option value="company">Company-wide</option>
          </select>
        </div>
      </div>

      {/* Frequency — critical field */}
      <div className="form-group">
        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FaCalendarWeek style={{ color: 'var(--brand-orange)' }} /> Payment Frequency
        </label>
        <select className="form-input" value={form.frequency} onChange={f('frequency')}>
          <option value="weekly">Weekly — applied every week</option>
          <option value="twice_monthly">Twice Monthly — 2× per month (alert will fire if applied &gt;2×)</option>
          <option value="monthly">Monthly — applied once per month</option>
          <option value="per_load">Per Load — per individual load</option>
          <option value="percentage">Percentage — % of weekly revenue</option>
        </select>
        {form.frequency === 'twice_monthly' && (
          <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8, fontSize: 12, color: 'var(--warning)', display: 'flex', gap: 6 }}>
            <FaExclamationTriangle style={{ marginTop: 2, flexShrink: 0 }} />
            Twice-monthly deductions will show a warning alert if included more than 2× in any calendar month.
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        {!isPercentage ? (
          <div className="form-group">
            <label className="form-label">Amount ($)</label>
            <input type="number" step="0.01" className="form-input" value={form.amount} onChange={f('amount')} placeholder="0.00" />
          </div>
        ) : (
          <div className="form-group">
            <label className="form-label">Percentage (%)</label>
            <input type="number" step="0.01" className="form-input" value={form.percentage} onChange={f('percentage')} placeholder="e.g. 4" />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Sort Order</label>
          <input type="number" className="form-input" value={form.sort_order} onChange={f('sort_order')} />
        </div>
        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 28 }}>
            <input type="checkbox" checked={form.is_active} onChange={f('is_active')} style={{ width: 16, height: 16 }} />
            <span className="form-label" style={{ margin: 0 }}>Active</span>
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          {saving ? 'Saving...' : editing ? 'Update Deduction' : 'Add Deduction'}
        </button>
      </div>
    </div>
  );
}

export default function Deductions() {
  const [deductions, setDeductions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/deductions');
      setDeductions(res.data);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const duplicateWarning = getDuplicateWarning(deductions);

  return (
    <div>
      <PageHeader
        title="Deduction Templates"
        subtitle="Configure recurring deductions applied automatically to weekly reports"
        action={
          <button onClick={() => { setShowForm(true); setEditing(null); }} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FaPlus /> Add Deduction
          </button>
        }
      />

      {/* Default deductions info */}
      <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
        <FaInfoCircle style={{ marginRight: 6, color: 'var(--info)' }} />
        <strong>Built-in defaults:</strong> ELD ($35/wk) · Dispatching (4%) · Insurance ($500/wk) · Trailer ($150/wk) · Authority (12%). Adjust amounts in{' '}
        <a href="/settings" style={{ color: 'var(--brand-orange)', textDecoration: 'none' }}>Company Settings</a>.
        These templates are <strong>additional</strong> deductions on top of the defaults.
      </div>

      {/* Twice-monthly alert */}
      {duplicateWarning && (
        <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: 14, marginBottom: 16, fontSize: 13, color: 'var(--warning)', display: 'flex', gap: 10 }}>
          <FaBell style={{ marginTop: 2, flexShrink: 0 }} />
          <div>{duplicateWarning}</div>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Type</th>
                  <th>Frequency</th>
                  <th>Amount</th>
                  <th>Applies To</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {deductions.map((d, i) => {
                  const freqStyle = FREQUENCY_COLORS[d.frequency] || FREQUENCY_COLORS.weekly;
                  return (
                    <tr key={d.id}>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{d.sort_order || i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{d.name}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.description || '—'}</td>
                      <td>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(59,130,246,0.12)', color: 'var(--brand-blue-light)', fontWeight: 600 }}>
                          {DEDUCTION_TYPE_LABELS[d.deduction_type] || d.deduction_type}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: freqStyle.bg, color: freqStyle.color, fontWeight: 600 }}>
                          {FREQUENCY_LABELS[d.frequency] || d.frequency || 'Weekly'}
                        </span>
                        {d.frequency === 'twice_monthly' && (
                          <FaExclamationTriangle style={{ marginLeft: 6, color: 'var(--warning)', fontSize: 11 }} title="Twice-monthly — verify not over-applied" />
                        )}
                      </td>
                      <td style={{ fontWeight: 700 }}>
                        {d.deduction_type === 'percentage_revenue' ? (
                          <span style={{ color: 'var(--brand-orange)' }}>{d.percentage}%</span>
                        ) : (
                          <span style={{ color: 'var(--success)' }}>${parseFloat(d.amount || 0).toFixed(2)}</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {d.applies_to === 'truck' ? 'Per Truck' : d.applies_to === 'driver' ? 'Per Driver' : 'Company-wide'}
                      </td>
                      <td>
                        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700, background: d.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)', color: d.is_active ? 'var(--success)' : 'var(--text-muted)' }}>
                          {d.is_active ? '● Active' : '○ Inactive'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => { setEditing(d); setShowForm(true); }} className="btn btn-secondary btn-sm" title="Edit"><FaEdit /></button>
                          <button onClick={() => setDeleteTarget(d.id)} className="btn btn-danger btn-sm" title="Delete"><FaTrash /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {deductions.length === 0 && (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No custom deductions configured</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? 'Edit Deduction' : 'Add Deduction Template'} size="lg">
        <DeductionForm
          editing={editing}
          onSaved={() => { setShowForm(false); setEditing(null); load(); }}
          onClose={() => { setShowForm(false); setEditing(null); }}
        />
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Deduction"
        message="Remove this deduction template? It won't affect already-generated reports."
        onConfirm={async () => {
          await api.delete(`/deductions/${deleteTarget}`);
          toast.success('Deleted');
          setDeleteTarget(null);
          load();
        }}
        onCancel={() => setDeleteTarget(null)}
        danger
      />
    </div>
  );
}
