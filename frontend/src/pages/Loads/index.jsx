import { FaTrash, FaWrench, FaEdit, FaExclamationTriangle, FaMapMarkerAlt, FaFlagCheckered, FaBox, FaEye, FaPlus } from 'react-icons/fa';
import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { StatusBadge, Spinner, EmptyState, PageHeader, Modal, formatCurrency, formatDate, ConfirmModal } from '../../components/ui';
import toast from 'react-hot-toast';

const STATUSES = ['', 'booked', 'dispatched', 'in_transit', 'delivered', 'invoiced', 'paid', 'cancelled'];

const defaultForm = {
  load_number: '', customer_id: '', customer_name: '', origin_city: '', origin_state: '', destination_city: '', destination_state: '',
  pickup_date: '', delivery_date: '', rate: '', weight: '', commodity: '', miles: '',
  truck_id: '', trailer_id: '', driver_id: '', po_number: '', bol_number: '', notes: '',
  origin_address: '', destination_address: '', origin_zip: '', destination_zip: '',
  pickup_time: '', delivery_time: '', status: 'booked',
};

export default function Loads() {
  const [loads, setLoads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ status: '', search: '', date_from: '', date_to: '' });
  const [customers, setCustomers] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [trailers, setTrailers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [backfilling, setBackfilling] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [newCustomerMode, setNewCustomerMode] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([,v]) => v));
      const [loadsRes, custRes, truckRes, trailerRes, driverRes] = await Promise.all([
        api.get('/loads', { params }),
        api.get('/customers', { params: { active: true } }),
        api.get('/trucks'),
        api.get('/trailers'),
        api.get('/drivers', { params: { active: true } }),
      ]);
      setLoads(loadsRes.data);
      setCustomers(custRes.data);
      setTrucks(truckRes.data);
      setTrailers(trailerRes.data);
      setDrivers(driverRes.data);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadData(); }, [loadData]);

  const openCreate = () => { setEditing(null); setForm(defaultForm); setNewCustomerMode(false); setShowModal(true); };
  const openEdit = (load) => { setEditing(load); setForm({ ...defaultForm, ...load }); setNewCustomerMode(false); setShowModal(true); };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/loads/${editing.id}`, form);
        toast.success('Load updated');
      } else {
        await api.post('/loads', form);
        toast.success('Load created');
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save load');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (loadId, status) => {
    try {
      const res = await api.patch(`/loads/${loadId}/status`, { status });
      setLoads(loads.map(l => l.id === loadId ? { ...l, status } : l));
      if (status === 'paid') {
        if (res.data.invoiceCreated) toast.success('Marked paid — added to revenue');
        else if (res.data.hasInvoice) toast.success('Marked paid');
        else toast('Marked paid, but no customer/rate set — revenue not recorded', { icon: <FaExclamationTriangle /> });
      } else {
        toast.success(`Status updated to ${status}`);
      }
    } catch (err) {
      toast.error('Failed to update status');
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/loads/${deleteTarget.id}`);
      toast.success('Load deleted');
      setDeleteTarget(null);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete load');
    }
  };

  const f = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleBackfill = async () => {
    setBackfilling(true);
    try {
      const res = await api.post('/loads/backfill-paid-invoices');
      toast.success(`Checked ${res.data.totalPaidLoads} paid loads — ${res.data.created} invoices created, ${res.data.synced} dates fixed`);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Load Management"
        subtitle={`${loads.length} loads`}
        actions={
          <div className="flex gap-8">
            <button className="btn btn-secondary" onClick={handleBackfill} disabled={backfilling}>
              {backfilling ? 'Fixing...' : <><FaWrench /> Fix Historical Revenue</>}
            </button>
            <button className="btn btn-primary" onClick={openCreate}><FaPlus /> New Load</button>
          </div>
        }
      />

      {/* Filters */}
      <div className="filter-bar mb-16">
        <input
          className="search-input"
          placeholder="Search load #, city..."
          value={filters.search}
          onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
        />
        <select className="filter-select" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">All Statuses</option>
          {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
        </select>
        <input type="date" className="filter-select" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
        <input type="date" className="filter-select" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
        <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ status: '', search: '', date_from: '', date_to: '' })}>Clear</button>
      </div>

      {loading ? <Spinner /> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Load #</th>
                  <th>Customer</th>
                  <th>Origin → Dest</th>
                  <th>Pickup</th>
                  <th>Delivery</th>
                  <th>Truck</th>
                  <th>Driver</th>
                  <th>Rate</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loads.length === 0 ? (
                  <tr><td colSpan={10}><EmptyState icon={<FaBox />} title="No loads found" description="Create your first load to get started." /></td></tr>
                ) : loads.map(load => (
                  <tr key={load.id}>
                    <td className="mono">
                      <Link to={`/loads/${load.id}`} style={{ color: 'var(--brand-blue-light)', fontWeight: 600, textDecoration: 'none' }}>
                        {load.load_number}
                      </Link>
                    </td>
                    <td className="truncate">{load.customer_name || '—'}</td>
                    <td style={{ fontSize: '12px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{load.origin_city}, {load.origin_state}</span>
                      <span style={{ margin: '0 4px', color: 'var(--text-muted)' }}>→</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{load.destination_city}, {load.destination_state}</span>
                    </td>
                    <td className="muted">{formatDate(load.pickup_date)}</td>
                    <td className="muted">{formatDate(load.delivery_date)}</td>
                    <td className="muted">{load.truck_unit || '—'}</td>
                    <td className="muted">{load.driver_first ? `${load.driver_first} ${load.driver_last}` : '—'}</td>
                    <td style={{ fontWeight: 600, color: 'var(--success)' }}>{formatCurrency(load.rate)}</td>
                    <td>
                      <select
                        className="filter-select"
                        value={load.status}
                        onChange={e => handleStatusChange(load.id, e.target.value)}
                        style={{ padding: '4px 24px 4px 8px', fontSize: '11px' }}
                      >
                        {STATUSES.filter(Boolean).map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
                      </select>
                    </td>
                    <td>
                      <div className="flex gap-8">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(load)}><FaEdit /></button>
                        <Link to={`/loads/${load.id}`} className="btn btn-ghost btn-sm"><FaEye /></Link>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(load)}><FaTrash /></button>
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
        <Modal
          title={editing ? `Edit Load ${editing.load_number}` : 'New Load'}
          onClose={() => setShowModal(false)}
          size="modal-xl"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update Load' : 'Create Load'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSave}>
            <div className="form-group">
              <label className="form-label">Load Number (optional - auto-generated if left blank)</label>
              <input className="form-control" value={form.load_number} onChange={f('load_number')} placeholder="e.g. BHTL-00001" />
            </div>

            <div className="form-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
              <div className="form-group">
                <div className="flex items-center justify-between" style={{ marginBottom: '6px' }}>
                  <label className="form-label" style={{ margin: 0 }}>Customer *</label>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      setNewCustomerMode(m => !m);
                      setForm(p => ({ ...p, customer_id: '', customer_name: '' }));
                    }}
                  >
                    {newCustomerMode ? '← Pick existing customer' : '+ New customer'}
                  </button>
                </div>
                {newCustomerMode ? (
                  <input
                    className="form-control"
                    value={form.customer_name}
                    onChange={f('customer_name')}
                    placeholder="Type new customer name"
                    required
                  />
                ) : (
                  <select className="form-control" value={form.customer_id} onChange={f('customer_id')} required>
                    <option value="">Select customer...</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Commodity</label>
                <input className="form-control" value={form.commodity} onChange={f('commodity')} placeholder="e.g. General Freight" />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={f('status')}>
                {['booked','dispatched','in_transit','delivered','invoiced','paid'].map(s => (
                  <option key={s} value={s}>{s.replace(/_/g,' ')}</option>
                ))}
              </select>
              <div className="page-subtitle" style={{ marginTop: '4px' }}>
                For backfilling completed loads, set this directly to "paid" — revenue records itself automatically using the delivery date above.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '16px' }}>
              <div>
                <div className="detail-section-title"><FaMapMarkerAlt /> Origin</div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input className="form-control" value={form.origin_address} onChange={f('origin_address')} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px' }}>
                  <div className="form-group">
                    <label className="form-label">City *</label>
                    <input className="form-control" value={form.origin_city} onChange={f('origin_city')} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">State *</label>
                    <input className="form-control" maxLength={2} value={form.origin_state} onChange={f('origin_state')} style={{ textTransform: 'uppercase' }} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">ZIP</label>
                    <input className="form-control" value={form.origin_zip} onChange={f('origin_zip')} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="form-group">
                    <label className="form-label">Pickup Date</label>
                    <input type="date" className="form-control" value={form.pickup_date} onChange={f('pickup_date')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Pickup Time</label>
                    <input className="form-control" placeholder="08:00" value={form.pickup_time} onChange={f('pickup_time')} />
                  </div>
                </div>
              </div>

              <div>
                <div className="detail-section-title"><FaFlagCheckered /> Destination</div>
                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input className="form-control" value={form.destination_address} onChange={f('destination_address')} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px' }}>
                  <div className="form-group">
                    <label className="form-label">City *</label>
                    <input className="form-control" value={form.destination_city} onChange={f('destination_city')} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">State *</label>
                    <input className="form-control" maxLength={2} value={form.destination_state} onChange={f('destination_state')} style={{ textTransform: 'uppercase' }} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">ZIP</label>
                    <input className="form-control" value={form.destination_zip} onChange={f('destination_zip')} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <div className="form-group">
                    <label className="form-label">Delivery Date</label>
                    <input type="date" className="form-control" value={form.delivery_date} onChange={f('delivery_date')} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Delivery Time</label>
                    <input className="form-control" placeholder="17:00" value={form.delivery_time} onChange={f('delivery_time')} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '16px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Rate ($) *</label>
                <input type="number" step="0.01" className="form-control" value={form.rate} onChange={f('rate')} required />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Miles</label>
                <input type="number" step="0.1" className="form-control" value={form.miles} onChange={f('miles')} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Weight (lbs)</label>
                <input type="number" className="form-control" value={form.weight} onChange={f('weight')} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">PO Number</label>
                <input className="form-control" value={form.po_number} onChange={f('po_number')} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Truck</label>
                <select className="form-control" value={form.truck_id} onChange={f('truck_id')}>
                  <option value="">Unassigned</option>
                  {trucks.map(t => <option key={t.id} value={t.id}>#{t.unit_number} {t.make} {t.model}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Trailer</label>
                <select className="form-control" value={form.trailer_id} onChange={f('trailer_id')}>
                  <option value="">Unassigned</option>
                  {trailers.map(t => <option key={t.id} value={t.id}>#{t.unit_number} {t.trailer_type}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Driver</label>
                <select className="form-control" value={form.driver_id} onChange={f('driver_id')}>
                  <option value="">Unassigned</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">BOL Number</label>
              <input className="form-control" value={form.bol_number} onChange={f('bol_number')} />
            </div>

            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-control" value={form.notes} onChange={f('notes')} rows={3} />
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Delete Load"
          message={`Permanently delete load ${deleteTarget.load_number}? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
