import { FaTrash, FaEdit, FaCar } from 'react-icons/fa';
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { ExpirationBadge, Spinner, EmptyState, PageHeader, Modal, formatDate, ConfirmModal } from '../../components/ui';
import toast from 'react-hot-toast';

const PAY_TYPES = ['per_mile', 'percentage', 'hourly', 'salary'];
const defaultForm = {
  first_name: '', last_name: '', email: '', phone: '', address_line1: '', city: '', state: '', zip: '',
  cdl_number: '', cdl_class: 'A', cdl_endorsements: '', cdl_expiration: '',
  medical_card_expiration: '', hire_date: '', pay_type: 'per_mile', pay_rate: '',
  clearinghouse_status: '', notes: '',
};

export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/drivers', { params: { search: search || undefined, active: true } });
      setDrivers(res.data);
    } finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(defaultForm); setShowModal(true); };
  const openEdit = (d) => { setEditing(d); setForm({ ...defaultForm, ...d, cdl_expiration: d.cdl_expiration?.split('T')[0] || '', medical_card_expiration: d.medical_card_expiration?.split('T')[0] || '', hire_date: d.hire_date?.split('T')[0] || '' }); setShowModal(true); };

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) { await api.put(`/drivers/${editing.id}`, form); toast.success('Driver updated'); }
      else { await api.post('/drivers', form); toast.success('Driver added — DQ file checklist created'); }
      setShowModal(false); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try { await api.delete(`/drivers/${deleteTarget.id}`); toast.success('Driver deactivated'); setDeleteTarget(null); load(); }
    catch { toast.error('Failed'); }
  };

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const getExpirationClass = (dateStr) => {
    if (!dateStr) return '';
    const d = Math.floor((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
    return d < 0 ? 'exp-expired' : d <= 30 ? 'exp-danger' : d <= 90 ? 'exp-warning' : 'exp-ok';
  };

  return (
    <div>
      <PageHeader title="Drivers" subtitle={`${drivers.length} active drivers`}
        actions={<button className="btn btn-primary" onClick={openCreate}>+ Add Driver</button>} />

      <div className="filter-bar mb-16">
        <input className="search-input" placeholder="Search name, CDL #..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {loading ? <Spinner /> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr><th>Driver</th><th>CDL # / Class</th><th>CDL Expiration</th><th>Med Card Exp.</th><th>Truck</th><th>Pay Type</th><th>Clearinghouse</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {drivers.length === 0 ? (
                  <tr><td colSpan={8}><EmptyState icon={<FaCar />} title="No drivers" description="Add your first driver." /></td></tr>
                ) : drivers.map(d => (
                  <tr key={d.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{d.first_name} {d.last_name}</div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{d.phone}</div>
                    </td>
                    <td className="mono">{d.cdl_number || '—'} <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>Class {d.cdl_class}</span></td>
                    <td><span className={getExpirationClass(d.cdl_expiration)}>{formatDate(d.cdl_expiration)}</span></td>
                    <td><span className={getExpirationClass(d.medical_card_expiration)}>{formatDate(d.medical_card_expiration)}</span></td>
                    <td className="muted">{d.assigned_truck_unit ? `#${d.assigned_truck_unit}` : '—'}</td>
                    <td className="muted">{d.pay_type?.replace(/_/g,' ')} {d.pay_rate ? `@ ${d.pay_type === 'percentage' ? `${d.pay_rate}%` : `$${d.pay_rate}`}` : ''}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{d.clearinghouse_status || '—'}</td>
                    <td>
                      <div className="flex gap-8">
                        <Link to={`/drivers/${d.id}`} className="btn btn-ghost btn-sm">👁</Link>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(d)}><FaEdit /></button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(d)}><FaTrash /></button>
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
        <Modal title={editing ? `Edit — ${editing.first_name} ${editing.last_name}` : 'Add Driver'} onClose={() => setShowModal(false)} size="modal-xl"
          footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Add Driver'}</button></>}
        >
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="form-group"><label className="form-label">First Name *</label><input className="form-control" value={form.first_name} onChange={f('first_name')} required /></div>
              <div className="form-group"><label className="form-label">Last Name *</label><input className="form-control" value={form.last_name} onChange={f('last_name')} required /></div>
              <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" value={form.email} onChange={f('email')} /></div>
              <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.phone} onChange={f('phone')} /></div>
              <div className="form-group" style={{ gridColumn: '1/-1' }}><label className="form-label">Address</label><input className="form-control" value={form.address_line1} onChange={f('address_line1')} /></div>
              <div className="form-group"><label className="form-label">City</label><input className="form-control" value={form.city} onChange={f('city')} /></div>
              <div className="form-group"><label className="form-label">State</label><input className="form-control" maxLength={2} value={form.state} onChange={f('state')} style={{ textTransform:'uppercase' }} /></div>
            </div>
            <div className="divider" />
            <div className="detail-section-title">CDL & Compliance</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px' }}>
              <div className="form-group"><label className="form-label">CDL Number</label><input className="form-control" value={form.cdl_number} onChange={f('cdl_number')} /></div>
              <div className="form-group"><label className="form-label">CDL Class</label>
                <select className="form-control" value={form.cdl_class} onChange={f('cdl_class')}>
                  {['A','B','C'].map(c => <option key={c}>Class {c}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Endorsements</label><input className="form-control" value={form.cdl_endorsements} onChange={f('cdl_endorsements')} placeholder="H, N, T, X..." /></div>
              <div className="form-group"><label className="form-label">CDL Expiration</label><input type="date" className="form-control" value={form.cdl_expiration} onChange={f('cdl_expiration')} /></div>
              <div className="form-group"><label className="form-label">Medical Card Expiration</label><input type="date" className="form-control" value={form.medical_card_expiration} onChange={f('medical_card_expiration')} /></div>
              <div className="form-group"><label className="form-label">Hire Date</label><input type="date" className="form-control" value={form.hire_date} onChange={f('hire_date')} /></div>
              <div className="form-group"><label className="form-label">Clearinghouse Status</label><input className="form-control" value={form.clearinghouse_status} onChange={f('clearinghouse_status')} placeholder="e.g. Registered, Queried" /></div>
            </div>
            <div className="divider" />
            <div className="detail-section-title">Pay</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div className="form-group"><label className="form-label">Pay Type</label>
                <select className="form-control" value={form.pay_type} onChange={f('pay_type')}>
                  {PAY_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">
                  {form.pay_type === 'per_mile' ? 'Rate per Mile ($)' : form.pay_type === 'percentage' ? 'Percentage (%)' : form.pay_type === 'hourly' ? 'Hourly Rate ($)' : 'Salary per Period ($)'}
                </label>
                <input type="number" step="0.0001" className="form-control" value={form.pay_rate} onChange={f('pay_rate')} />
              </div>
            </div>
            <div className="form-group"><label className="form-label">Notes</label><textarea className="form-control" value={form.notes} onChange={f('notes')} rows={3} /></div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal title="Deactivate Driver" message={`Deactivate ${deleteTarget.first_name} ${deleteTarget.last_name}?`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
