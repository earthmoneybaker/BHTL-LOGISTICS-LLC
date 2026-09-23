import { FaTrash, FaEdit, FaHandshake } from 'react-icons/fa';
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { Spinner, EmptyState, PageHeader, Modal, formatCurrency, ConfirmModal } from '../../components/ui';
import toast from 'react-hot-toast';

const defaultForm = {
  name: '', contact_name: '', contact_email: '', contact_phone: '',
  address_line1: '', address_line2: '', city: '', state: '', zip: '',
  payment_terms: 'Net 30', credit_limit: '', credit_notes: '',
};

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/customers', { params: { search: search || undefined } });
      setCustomers(res.data);
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(defaultForm); setShowModal(true); };
  const openEdit = (c) => { setEditing(c); setForm({ ...defaultForm, ...c }); setShowModal(true); };
  const openDetail = async (id) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/customers/${id}`);
      setDetail(res.data);
    } finally { setDetailLoading(false); }
  };

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) { await api.put(`/customers/${editing.id}`, form); toast.success('Customer updated'); }
      else { await api.post('/customers', form); toast.success('Customer created'); }
      setShowModal(false); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/customers/${deleteTarget.id}`);
      toast.success('Customer deactivated');
      setDeleteTarget(null); load();
    } catch { toast.error('Failed to deactivate'); }
  };

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div>
      <PageHeader title="Customers" subtitle={`${customers.length} customers`}
        actions={<button className="btn btn-primary" onClick={openCreate}>+ New Customer</button>} />

      <div className="filter-bar mb-16">
        <input className="search-input" placeholder="Search name, email..." value={search}
          onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <Spinner /> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr><th>Company</th><th>Contact</th><th>Phone / Email</th><th>Payment Terms</th><th>Total Loads</th><th>Outstanding</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {customers.length === 0 ? (
                  <tr><td colSpan={7}><EmptyState icon={<FaHandshake />} title="No customers" description="Add your first customer or broker." /></td></tr>
                ) : customers.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{c.name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{[c.city, c.state].filter(Boolean).join(', ')}</div>
                    </td>
                    <td className="muted">{c.contact_name || '—'}</td>
                    <td style={{ fontSize: '12px' }}>
                      <div>{c.contact_phone || '—'}</div>
                      <div style={{ color: 'var(--text-muted)' }}>{c.contact_email || ''}</div>
                    </td>
                    <td className="muted">{c.payment_terms}</td>
                    <td style={{ textAlign: 'center' }}>{c.total_loads || 0}</td>
                    <td style={{ fontWeight: 600, color: parseFloat(c.outstanding_balance) > 0 ? 'var(--danger)' : 'var(--text-muted)' }}>
                      {formatCurrency(c.outstanding_balance)}
                    </td>
                    <td>
                      <div className="flex gap-8">
                        <button className="btn btn-ghost btn-sm" onClick={() => openDetail(c.id)}><FaEye /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}><FaEdit /></button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(c)}><FaTrash /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <Modal title={editing ? `Edit — ${editing.name}` : 'New Customer'} onClose={() => setShowModal(false)} size="modal-lg"
          footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create'}</button></>}
        >
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Company / Broker Name *</label>
                <input className="form-control" value={form.name} onChange={f('name')} required />
              </div>
              <div className="form-group"><label className="form-label">Contact Name</label><input className="form-control" value={form.contact_name} onChange={f('contact_name')} /></div>
              <div className="form-group"><label className="form-label">Contact Email</label><input type="email" className="form-control" value={form.contact_email} onChange={f('contact_email')} /></div>
              <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.contact_phone} onChange={f('contact_phone')} /></div>
              <div className="form-group"><label className="form-label">Payment Terms</label>
                <select className="form-control" value={form.payment_terms} onChange={f('payment_terms')}>
                  {['Net 15','Net 30','Net 45','Net 60','Due on Receipt','QuickPay'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Address</label>
                <input className="form-control" value={form.address_line1} onChange={f('address_line1')} placeholder="Street address" />
              </div>
              <div className="form-group"><label className="form-label">City</label><input className="form-control" value={form.city} onChange={f('city')} /></div>
              <div className="form-group"><label className="form-label">State</label><input className="form-control" maxLength={2} value={form.state} onChange={f('state')} style={{ textTransform: 'uppercase' }} /></div>
              <div className="form-group"><label className="form-label">ZIP</label><input className="form-control" value={form.zip} onChange={f('zip')} /></div>
              <div className="form-group"><label className="form-label">Credit Limit ($)</label><input type="number" step="0.01" className="form-control" value={form.credit_limit} onChange={f('credit_limit')} /></div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}>
                <label className="form-label">Credit Notes</label>
                <textarea className="form-control" value={form.credit_notes} onChange={f('credit_notes')} rows={3} />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Detail Modal */}
      {detail && (
        <Modal title={detail.customer.name} onClose={() => setDetail(null)} size="modal-xl">
          {detailLoading ? <Spinner /> : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                {[['Contact', detail.customer.contact_name || '—'],['Email', detail.customer.contact_email || '—'],['Phone', detail.customer.contact_phone || '—'],
                  ['Payment Terms', detail.customer.payment_terms],['Address', [detail.customer.city, detail.customer.state].filter(Boolean).join(', ') || '—'],
                  ['Outstanding', formatCurrency(detail.invoices.filter(i => i.status !== 'paid').reduce((a,i) => a + parseFloat(i.amount),0))]
                ].map(([l,v]) => (
                  <div key={l}>
                    <div className="detail-field-label">{l}</div>
                    <div className="detail-field-value">{v}</div>
                  </div>
                ))}
              </div>
              <div className="detail-section-title">Recent Loads ({detail.loads.length})</div>
              <div className="table-wrapper mb-16">
                <table className="data-table">
                  <thead><tr><th>Load #</th><th>Origin → Dest</th><th>Pickup</th><th>Status</th><th>Rate</th></tr></thead>
                  <tbody>
                    {detail.loads.slice(0,10).map(l => (
                      <tr key={l.id}>
                        <td className="mono"><Link to={`/loads/${l.id}`} style={{ color: 'var(--brand-blue-light)', textDecoration: 'none' }}>{l.load_number}</Link></td>
                        <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{l.origin_city}, {l.origin_state} → {l.destination_city}, {l.destination_state}</td>
                        <td className="muted">{l.pickup_date ? new Date(l.pickup_date).toLocaleDateString() : '—'}</td>
                        <td><span className={`badge badge-${l.status}`}>{l.status.replace(/_/g,' ')}</span></td>
                        <td style={{ fontWeight: 600 }}>{formatCurrency(l.rate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal title="Deactivate Customer" message={`Deactivate ${deleteTarget.name}? They will no longer appear in active lists.`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
