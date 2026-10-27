import { FaTrash, FaWrench, FaEdit, FaExclamationTriangle, FaMapMarkerAlt, FaFlagCheckered, FaBox, FaEye, FaPlus, FaCheckSquare, FaClipboardList, FaKeyboard } from 'react-icons/fa';
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
  // Multi-select state
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  // Paste Rate Con state
  const [inputTab, setInputTab] = useState('manual'); // 'manual' | 'paste'
  const [pasteText, setPasteText] = useState('');
  const [extracting, setExtracting] = useState(false);
  const [extractFlags, setExtractFlags] = useState([]);
  const [duplicateWarning, setDuplicateWarning] = useState(null);
  const [extractedOnce, setExtractedOnce] = useState(false);

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
      setSelected(new Set()); // clear selection on refresh
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadData(); }, [loadData]);

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    setNewCustomerMode(false);
    setInputTab('manual');
    setPasteText('');
    setExtractFlags([]);
    setDuplicateWarning(null);
    setExtractedOnce(false);
    setShowModal(true);
  };
  const openEdit = (load) => { setEditing(load); setForm({ ...defaultForm, ...load }); setNewCustomerMode(false); setInputTab('manual'); setExtractFlags([]); setDuplicateWarning(null); setExtractedOnce(false); setShowModal(true); };

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

  // Multi-select helpers
  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSelectAll = () => {
    if (selected.size === loads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(loads.map(l => l.id)));
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const res = await api.post('/loads/bulk-delete', { ids: [...selected] });
      toast.success(`${res.data.deleted} load${res.data.deleted !== 1 ? 's' : ''} deleted`);
      setShowBulkConfirm(false);
      loadData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Bulk delete failed');
    } finally {
      setBulkDeleting(false);
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

  // ---- Paste Rate Con ----
  const handleExtractPaste = async () => {
    if (!pasteText.trim()) {
      toast.error('Paste the Rate Confirmation text first.');
      return;
    }
    setExtracting(true);
    setExtractFlags([]);
    setDuplicateWarning(null);
    try {
      const res = await api.post('/extract/paste-rate-con', { text: pasteText });
      const { extracted, flags, duplicate } = res.data;
      // Merge extracted into form (preserve existing manual overrides if already typed)
      setForm(prev => ({
        ...defaultForm,
        ...Object.fromEntries(
          Object.entries(extracted).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
        ),
        // map pickup_facility → notes supplement if not already in form
        notes: extracted.notes || (extracted.pickup_facility ? `Pickup: ${extracted.pickup_facility}` : '') +
               (extracted.delivery_facility ? `\nDelivery: ${extracted.delivery_facility}` : '') || '',
        status: 'booked',
      }));
      // Also try to match customer from loaded customers list
      if (extracted.customer_name) {
        const match = customers.find(c => c.name.toLowerCase().includes(extracted.customer_name.toLowerCase().slice(0,8)));
        if (match) setForm(prev => ({ ...prev, customer_id: match.id, customer_name: match.name }));
        else setNewCustomerMode(true);
      }
      setExtractFlags(flags || []);
      if (duplicate) setDuplicateWarning(duplicate);
      setExtractedOnce(true);
      toast.success('Details extracted — review and correct before saving.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Extraction failed. Please try again.');
    } finally {
      setExtracting(false);
    }
  };

  const isFlagged = (fieldKey) => extractFlags.some(f => f.field === fieldKey);
  const getFlagMsg = (fieldKey) => extractFlags.find(f => f.field === fieldKey)?.message;

  const allSelected = loads.length > 0 && selected.size === loads.length;
  const someSelected = selected.size > 0;

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

      {/* Bulk action bar */}
      {someSelected && (
        <div className="bulk-action-bar">
          <span className="bulk-action-count">
            <FaCheckSquare style={{ color: 'var(--brand-blue-light)' }} />
            {selected.size} load{selected.size !== 1 ? 's' : ''} selected
          </span>
          <button className="btn btn-danger btn-sm" onClick={() => setShowBulkConfirm(true)}>
            <FaTrash /> Delete Selected
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => setSelected(new Set())}>
            Deselect All
          </button>
        </div>
      )}

      {loading ? <Spinner /> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      className="row-checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      title="Select all"
                    />
                  </th>
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
                  <tr><td colSpan={11}><EmptyState icon={<FaBox />} title="No loads found" description="Create your first load to get started." /></td></tr>
                ) : loads.map(load => (
                  <tr key={load.id} className={selected.has(load.id) ? 'row-selected' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        className="row-checkbox"
                        checked={selected.has(load.id)}
                        onChange={() => toggleSelect(load.id)}
                      />
                    </td>
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
          {/* Input method tabs — only shown when creating a new load */}
          {!editing && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '12px' }}>
              <button
                type="button"
                onClick={() => { setInputTab('manual'); setExtractFlags([]); setDuplicateWarning(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all .15s',
                  background: inputTab === 'manual' ? 'var(--brand-blue)' : 'var(--surface-2)',
                  color: inputTab === 'manual' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                <FaKeyboard /> Manual Entry
              </button>
              <button
                type="button"
                onClick={() => setInputTab('paste')}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '7px 16px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, transition: 'all .15s',
                  background: inputTab === 'paste' ? 'var(--brand-blue)' : 'var(--surface-2)',
                  color: inputTab === 'paste' ? '#fff' : 'var(--text-secondary)',
                }}
              >
                <FaClipboardList /> Paste Rate Confirmation
              </button>
            </div>
          )}

          {/* Paste Rate Con Panel */}
          {inputTab === 'paste' && !editing && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '10px', lineHeight: 1.5 }}>
                Copy all text from your broker's Rate Confirmation (PDF, email, or document) and paste it below. The system will extract load details automatically — no OCR usage consumed.
              </div>
              <textarea
                style={{ width: '100%', minHeight: '180px', resize: 'vertical', fontFamily: 'monospace', fontSize: '12px', background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px', lineHeight: 1.5, boxSizing: 'border-box' }}
                placeholder="Paste the full Rate Confirmation text here..."
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
              />
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleExtractPaste}
                  disabled={extracting || !pasteText.trim()}
                >
                  {extracting ? 'Extracting...' : 'Extract Load Details'}
                </button>
                {pasteText && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => { setPasteText(''); setExtractFlags([]); setDuplicateWarning(null); setExtractedOnce(false); setForm(defaultForm); }}
                  >
                    Clear Text
                  </button>
                )}
                {extractedOnce && (
                  <span style={{ fontSize: '12px', color: 'var(--success)', marginLeft: '8px' }}>
                    ✓ Details extracted below — review before saving
                  </span>
                )}
              </div>

              {/* Duplicate warning */}
              {duplicateWarning && (
                <div style={{ marginTop: '12px', padding: '12px 16px', borderRadius: '8px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.4)', color: 'var(--danger)', fontSize: '13px' }}>
                  <FaExclamationTriangle style={{ marginRight: '8px' }} />
                  <strong>Possible duplicate detected:</strong> Load <strong>{duplicateWarning.load_number}</strong> already exists in BHTL ({duplicateWarning.status}, {duplicateWarning.customer_name || 'no customer'}).{' '}
                  <Link to={`/loads/${duplicateWarning.id}`} style={{ color: 'var(--danger)', textDecoration: 'underline' }} target="_blank">View existing load →</Link>
                  {' '}Do not save unless this is a new load with the same reference.
                </div>
              )}

              {/* Extraction flags */}
              {extractFlags.length > 0 && (
                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {extractFlags.map((fl, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '8px 12px', borderRadius: '6px', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', fontSize: '12px', color: '#F59E0B' }}>
                      <FaExclamationTriangle style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span><strong style={{ textTransform: 'capitalize' }}>{fl.field.replace(/_/g,' ')}:</strong> {fl.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {extractedOnce && (
                <div style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
                  <strong>Review extracted fields below.</strong> Edit anything before clicking "Create Load".
                </div>
              )}
            </div>
          )}

          {/* The form — shown in manual mode always, in paste mode only after extraction */}
          {(inputTab === 'manual' || editing || extractedOnce) && (
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">Load Number (optional - auto-generated if left blank)</label>
                <input
                  className={`form-control${isFlagged('load_number') ? ' flagged-field' : ''}`}
                  value={form.load_number}
                  onChange={f('load_number')}
                  placeholder="e.g. BHTL-00001"
                />
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
                      <label className="form-label" style={isFlagged('pickup_date') ? { color: '#F59E0B' } : {}}>
                        Pickup Date {isFlagged('pickup_date') && <FaExclamationTriangle style={{ marginLeft: 4 }} title={getFlagMsg('pickup_date')} />}
                      </label>
                      <input type="date" className={`form-control${isFlagged('pickup_date') ? ' flagged-field' : ''}`} value={form.pickup_date} onChange={f('pickup_date')} />
                      {isFlagged('pickup_date') && <div style={{ fontSize: '11px', color: '#F59E0B', marginTop: '3px' }}>{getFlagMsg('pickup_date')}</div>}
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
                      <label className="form-label" style={isFlagged('delivery_date') ? { color: '#F59E0B' } : {}}>
                        Delivery Date {isFlagged('delivery_date') && <FaExclamationTriangle style={{ marginLeft: 4 }} title={getFlagMsg('delivery_date')} />}
                      </label>
                      <input type="date" className={`form-control${isFlagged('delivery_date') ? ' flagged-field' : ''}`} value={form.delivery_date} onChange={f('delivery_date')} />
                      {isFlagged('delivery_date') && <div style={{ fontSize: '11px', color: '#F59E0B', marginTop: '3px' }}>{getFlagMsg('delivery_date')}</div>}
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
                  <label className="form-label" style={isFlagged('rate') ? { color: '#F59E0B' } : {}}>
                    Rate ($) * {isFlagged('rate') && <FaExclamationTriangle style={{ marginLeft: 4 }} title={getFlagMsg('rate')} />}
                  </label>
                  <input type="number" step="0.01" className={`form-control${isFlagged('rate') ? ' flagged-field' : ''}`} value={form.rate} onChange={f('rate')} required />
                  {isFlagged('rate') && <div style={{ fontSize: '11px', color: '#F59E0B', marginTop: '3px' }}>{getFlagMsg('rate')}</div>}
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
          )}
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

      {showBulkConfirm && (
        <ConfirmModal
          title="Delete Selected Loads"
          message={`Permanently delete ${selected.size} load${selected.size !== 1 ? 's' : ''}? This cannot be undone.`}
          onConfirm={handleBulkDelete}
          onCancel={() => setShowBulkConfirm(false)}
          confirmLabel={bulkDeleting ? 'Deleting...' : `Delete ${selected.size} Loads`}
        />
      )}
    </div>
  );
}
