import {
  FaMinusCircle, FaPlus, FaTrash, FaEdit, FaToggleOn, FaToggleOff,
  FaDollarSign, FaPercent
} from 'react-icons/fa';
import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import { Spinner, PageHeader, Modal, formatCurrency, ConfirmModal } from '../../components/ui';
import toast from 'react-hot-toast';

const DEDUCTION_TYPE_LABELS = {
  fixed_weekly: 'Fixed (Weekly)',
  fixed_monthly: 'Fixed (Monthly)',
  percentage_revenue: 'Percentage of Revenue',
  per_load: 'Per Load',
};

const APPLIES_TO_LABELS = {
  truck: 'Per Truck',
  driver: 'Per Driver',
  company: 'Company-wide',
};

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
        <input className="form-input" value={form.description} onChange={f('description')} placeholder="Explain how this is calculated..." />
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
            {Object.entries(APPLIES_TO_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
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
          {saving ? 'Saving...' : editing ? 'Update' : 'Add Deduction'}
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

  return (
    <div>
      <PageHeader
        title="Deduction Templates"
        subtitle="Configure recurring deductions that are automatically applied to weekly reports"
        action={
          <button onClick={() => { setShowForm(true); setEditing(null); }} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FaPlus /> Add Deduction
          </button>
        }
      />

      {/* Info banner */}
      <div style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, padding: 14, marginBottom: 20, fontSize: 13, color: 'var(--text-secondary)' }}>
        💡 <strong>Default deductions</strong> include: ELD ($35/wk), Dispatching (4% of revenue), Insurance ($500/wk), Trailer Payment ($150/wk), and Office Authority (12%). These are auto-applied to every weekly report.
      </div>

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
                  <th>Amount</th>
                  <th>Applies To</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {deductions.map((d, i) => (
                  <tr key={d.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{d.sort_order || i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{d.name}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{d.description || '—'}</td>
                    <td>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(59,130,246,0.12)', color: 'var(--brand-blue-light)', fontWeight: 600 }}>
                        {DEDUCTION_TYPE_LABELS[d.deduction_type]}
                      </span>
                    </td>
                    <td style={{ fontWeight: 700 }}>
                      {d.deduction_type === 'percentage_revenue' ? (
                        <span style={{ color: 'var(--brand-orange)' }}>{d.percentage}%</span>
                      ) : (
                        <span style={{ color: 'var(--success)' }}>${parseFloat(d.amount || 0).toFixed(2)}</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>{APPLIES_TO_LABELS[d.applies_to]}</td>
                    <td>
                      <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, fontWeight: 700, background: d.is_active ? 'rgba(16,185,129,0.12)' : 'rgba(100,116,139,0.12)', color: d.is_active ? 'var(--success)' : 'var(--text-muted)' }}>
                        {d.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => { setEditing(d); setShowForm(true); }} className="btn btn-secondary btn-sm"><FaEdit /></button>
                        <button onClick={() => setDeleteTarget(d.id)} className="btn btn-danger btn-sm"><FaTrash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {deductions.length === 0 && (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No deductions configured</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null); }} title={editing ? 'Edit Deduction' : 'Add Deduction'} size="lg">
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
