import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import { Spinner, EmptyState, PageHeader, Modal, formatCurrency, formatDate, ConfirmModal } from '../../components/ui';
import toast from 'react-hot-toast';

const defaultForm = {
  description: '', amount: '', revenue_date: new Date().toISOString().split('T')[0], notes: '',
};

export default function OtherRevenue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/other-revenue');
      setItems(res.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(defaultForm); setShowModal(true); };
  const openEdit = (item) => {
    setEditing(item);
    setForm({ ...defaultForm, ...item, revenue_date: item.revenue_date?.split('T')[0] || '' });
    setShowModal(true);
  };

  const handleSave = async (ev) => {
    ev.preventDefault(); setSaving(true);
    try {
      if (editing) { await api.put(`/other-revenue/${editing.id}`, form); toast.success('Updated'); }
      else { await api.post('/other-revenue', form); toast.success('Revenue recorded'); }
      setShowModal(false); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try { await api.delete(`/other-revenue/${deleteTarget.id}`); toast.success('Deleted'); setDeleteTarget(null); load(); }
    catch { toast.error('Failed'); }
  };

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const total = items.reduce((a, i) => a + parseFloat(i.amount), 0);

  return (
    <div>
      <PageHeader title="Other Revenue"
        subtitle={`${items.length} records — Total: ${formatCurrency(total)} — non-freight income (equipment sale, referral bonus, etc.)`}
        actions={<button className="btn btn-primary" onClick={openCreate}>+ Add Revenue</button>}
      />

      {loading ? <Spinner /> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Date</th><th>Description</th><th>Notes</th><th>Amount</th><th>Actions</th></tr></thead>
              <tbody>
                {items.length === 0 ? <tr><td colSpan={5}><EmptyState icon="💵" title="No other revenue recorded" /></td></tr>
                  : items.map(item => (
                  <tr key={item.id}>
                    <td className="muted">{formatDate(item.revenue_date)}</td>
                    <td>{item.description}</td>
                    <td className="muted truncate">{item.notes || '—'}</td>
                    <td style={{ fontWeight:700, color:'var(--success)' }}>{formatCurrency(item.amount)}</td>
                    <td>
                      <div className="flex gap-8">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(item)}>✏️</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(item)}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <Modal title={editing ? 'Edit Revenue' : 'Record Other Revenue'} onClose={() => setShowModal(false)}
          footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Save'}</button></>}
        >
          <div className="form-group"><label className="form-label">Description *</label>
            <input className="form-control" value={form.description} onChange={f('description')} placeholder="e.g. Sold old trailer, referral bonus" required />
          </div>
          <div className="form-group"><label className="form-label">Amount ($) *</label>
            <input type="number" step="0.01" className="form-control" value={form.amount} onChange={f('amount')} required />
          </div>
          <div className="form-group"><label className="form-label">Date *</label>
            <input type="date" className="form-control" value={form.revenue_date} onChange={f('revenue_date')} required />
          </div>
          <div className="form-group"><label className="form-label">Notes</label>
            <textarea className="form-control" value={form.notes} onChange={f('notes')} rows={2} />
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal title="Delete Revenue" message="Delete this revenue record?" onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
