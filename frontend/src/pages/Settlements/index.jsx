import {
  FaFileInvoiceDollar, FaPlus, FaCalculator, FaTrash, FaEdit, FaEye,
  FaCheckSquare, FaCheck, FaChevronLeft, FaPrint, FaTimes,
  FaGasPump, FaShieldAlt, FaMinusCircle
} from 'react-icons/fa';
import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import {
  Spinner, EmptyState, PageHeader, Modal, formatCurrency, formatDate, ConfirmModal
} from '../../components/ui';
import toast from 'react-hot-toast';

export default function Settlements() {
  const [settlements, setSettlements] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ driver_id: '', status: '' });

  // Detail view state
  const [detailId, setDetailId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Calculation preview
  const [calcResult, setCalcResult] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [loadItems, setLoadItems] = useState([]);

  // Multi-select
  const [selected, setSelected] = useState(new Set());
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [form, setForm] = useState({
    driver_id: '', period_start: '', period_end: '',
    gross_pay: '', fuel_advance: '0', insurance_deduction: '0',
    other_deduction: '0', other_deduction_note: '',
    notes: '', status: 'draft',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const [settRes, drRes] = await Promise.all([
        api.get('/settlements', { params }),
        api.get('/drivers', { params: { active: true } }),
      ]);
      setSettlements(settRes.data);
      setDrivers(drRes.data);
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  // ── Calculate pay ──────────────────────────────────────────────
  const calculatePay = async () => {
    if (!form.driver_id || !form.period_start || !form.period_end) {
      toast.error('Select driver and date range first');
      return;
    }
    setCalculating(true);
    try {
      const res = await api.post('/settlements/calculate', {
        driver_id: form.driver_id,
        period_start: form.period_start,
        period_end: form.period_end,
      });
      setCalcResult(res.data);
      setForm(p => ({ ...p, gross_pay: res.data.gross_pay.toFixed(2) }));
      setLoadItems(res.data.loads || []);
      toast.success(`Found ${res.data.loads?.length || 0} loads — gross: ${formatCurrency(res.data.gross_pay)}`);
    } catch {
      toast.error('Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  // ── Open create / edit ─────────────────────────────────────────
  const openCreate = () => {
    setEditing(null);
    setCalcResult(null);
    setLoadItems([]);
    setForm({
      driver_id: '', period_start: '', period_end: '',
      gross_pay: '', fuel_advance: '0', insurance_deduction: '0',
      other_deduction: '0', other_deduction_note: '',
      notes: '', status: 'draft',
    });
    setShowModal(true);
  };

  const openEdit = (s) => {
    setEditing(s);
    setCalcResult(null);
    setLoadItems([]);
    setForm({
      driver_id: s.driver_id || '',
      period_start: s.period_start?.split('T')[0] || '',
      period_end: s.period_end?.split('T')[0] || '',
      gross_pay: s.gross_pay || '',
      fuel_advance: s.fuel_advance || '0',
      insurance_deduction: s.insurance_deduction || '0',
      other_deduction: s.other_deduction || '0',
      other_deduction_note: s.other_deduction_note || '',
      notes: s.notes || '',
      status: s.status || 'draft',
    });
    setShowModal(true);
  };

  // ── Save ───────────────────────────────────────────────────────
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, load_items: loadItems };
      if (editing) {
        await api.put(`/settlements/${editing.id}`, payload);
        toast.success('Settlement updated');
      } else {
        await api.post('/settlements', payload);
        toast.success('Settlement created');
      }
      setShowModal(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ─────────────────────────────────────────────────────
  const handleDelete = async () => {
    try {
      await api.delete(`/settlements/${deleteTarget.id}`);
      toast.success('Deleted');
      setDeleteTarget(null);
      load();
    } catch {
      toast.error('Failed');
    }
  };

  // ── Status change ──────────────────────────────────────────────
  const handleStatusChange = async (id, status) => {
    try {
      await api.patch(`/settlements/${id}/status`, { status });
      setSettlements(prev => prev.map(s => s.id === id ? { ...s, status } : s));
      toast.success(`Status → ${status}`);
    } catch {
      toast.error('Failed to update status');
    }
  };

  // ── Detail view ────────────────────────────────────────────────
  const openDetail = async (id) => {
    setDetailId(id);
    setDetailLoading(true);
    try {
      const res = await api.get(`/settlements/${id}`);
      setDetail(res.data);
    } catch {
      toast.error('Failed to load settlement');
      setDetailId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  // ── Multi-select ───────────────────────────────────────────────
  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleSelectAll = () => {
    selected.size === settlements.length
      ? setSelected(new Set())
      : setSelected(new Set(settlements.map(s => s.id)));
  };
  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const res = await api.post('/settlements/bulk-delete', { ids: [...selected] });
      toast.success(`${res.data.deleted} settlement${res.data.deleted !== 1 ? 's' : ''} deleted`);
      setShowBulkConfirm(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  const allSelected = settlements.length > 0 && selected.size === settlements.length;
  const someSelected = selected.size > 0;

  const deductions = parseFloat(form.fuel_advance || 0) + parseFloat(form.insurance_deduction || 0) + parseFloat(form.other_deduction || 0);
  const netPreview = parseFloat(form.gross_pay || 0) - deductions;

  // ── Detail View ────────────────────────────────────────────────
  if (detailId) {
    if (detailLoading) return <Spinner />;
    if (!detail) return null;
    const s = detail.settlement;
    const items = detail.load_items;

    return (
      <div>
        <div className="page-header">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setDetailId(null); setDetail(null); }}>
                <FaChevronLeft /> Back to Settlements
              </button>
            </div>
            <h1 className="page-title">Settlement {s.settlement_number}</h1>
            <div className="page-subtitle">{s.first_name} {s.last_name} — {formatDate(s.period_start)} to {formatDate(s.period_end)}</div>
          </div>
          <div className="flex gap-8">
            <span className={`badge badge-${s.status}`}>{s.status}</span>
            <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>
              <FaPrint /> Print
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="stat-grid mb-20">
          <div className="stat-card" style={{ '--accent': 'var(--success)' }}>
            <div className="stat-label">Gross Pay</div>
            <div className="stat-value" style={{ fontSize: '22px' }}>{formatCurrency(s.gross_pay)}</div>
            <div className="stat-sub">{s.pay_type?.replace(/_/g, ' ')} @ {s.pay_type === 'percentage' ? `${s.pay_rate}%` : `$${s.pay_rate}`}</div>
          </div>
          <div className="stat-card" style={{ '--accent': 'var(--danger)' }}>
            <div className="stat-icon"><FaGasPump /></div>
            <div className="stat-label">Fuel Advance</div>
            <div className="stat-value" style={{ fontSize: '20px', color: 'var(--danger)' }}>-{formatCurrency(s.fuel_advance)}</div>
          </div>
          <div className="stat-card" style={{ '--accent': 'var(--warning)' }}>
            <div className="stat-icon"><FaShieldAlt /></div>
            <div className="stat-label">Insurance</div>
            <div className="stat-value" style={{ fontSize: '20px', color: 'var(--warning)' }}>-{formatCurrency(s.insurance_deduction)}</div>
          </div>
          <div className="stat-card" style={{ '--accent': parseFloat(s.net_pay) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            <div className="stat-label">Net Pay</div>
            <div className="stat-value" style={{ fontSize: '24px', color: parseFloat(s.net_pay) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {formatCurrency(s.net_pay)}
            </div>
          </div>
        </div>

        {/* Other deduction */}
        {parseFloat(s.other_deduction) > 0 && (
          <div className="alert alert-warning mb-16">
            <FaMinusCircle /> <strong>Other deduction:</strong> {formatCurrency(s.other_deduction)} — {s.other_deduction_note || 'No note'}
          </div>
        )}

        {/* Load items table */}
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
            <div className="card-title">Loads Included ({items.length})</div>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Load #</th>
                  <th>Pickup</th>
                  <th>Delivery</th>
                  <th>Origin</th>
                  <th>Destination</th>
                  <th>Miles</th>
                  <th>Load Rate</th>
                  <th>Driver Pay</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No loads attached</td></tr>
                ) : items.map((item, i) => (
                  <tr key={item.id || i}>
                    <td className="mono" style={{ fontWeight: 600 }}>{item.load_number}</td>
                    <td className="muted">{formatDate(item.pickup_date)}</td>
                    <td className="muted">{formatDate(item.delivery_date)}</td>
                    <td className="muted">{item.origin}</td>
                    <td className="muted">{item.destination}</td>
                    <td className="muted">{item.miles || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatCurrency(item.load_rate)}</td>
                    <td style={{ fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(item.driver_pay)}</td>
                  </tr>
                ))}
                {items.length > 0 && (
                  <tr style={{ borderTop: '2px solid var(--border-color)' }}>
                    <td colSpan={5}></td>
                    <td style={{ fontWeight: 700 }}>{items.reduce((a, i) => a + parseFloat(i.miles || 0), 0).toFixed(1)}</td>
                    <td style={{ fontWeight: 700 }}>{formatCurrency(items.reduce((a, i) => a + parseFloat(i.load_rate || 0), 0))}</td>
                    <td style={{ fontWeight: 800, color: 'var(--success)' }}>{formatCurrency(items.reduce((a, i) => a + parseFloat(i.driver_pay || 0), 0))}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {s.notes && (
          <div className="card mt-16">
            <div className="card-title mb-8">Notes</div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{s.notes}</p>
          </div>
        )}
      </div>
    );
  }

  // ── List View ──────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Driver Settlements"
        subtitle={`${settlements.length} settlements`}
        actions={
          <button className="btn btn-primary" onClick={openCreate}>
            <FaPlus /> New Settlement
          </button>
        }
      />

      <div className="alert alert-info mb-16">
        ℹ️ <strong>Settlements</strong> pull loads automatically from each driver's completed loads within a period. Review, add deductions (fuel advances, insurance), then approve and mark paid.
      </div>

      {/* Filters */}
      <div className="filter-bar mb-16">
        <select className="filter-select" value={filters.driver_id} onChange={e => setFilters(f => ({ ...f, driver_id: e.target.value }))}>
          <option value="">All Drivers</option>
          {drivers.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>)}
        </select>
        <select className="filter-select" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
          <option value="">All Statuses</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="paid">Paid</option>
        </select>
        <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ driver_id: '', status: '' })}>Clear</button>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="bulk-action-bar">
          <span className="bulk-action-count">
            <FaCheckSquare style={{ color: 'var(--brand-blue-light)' }} />
            {selected.size} settlement{selected.size !== 1 ? 's' : ''} selected
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
                    <input type="checkbox" className="row-checkbox" checked={allSelected} onChange={toggleSelectAll} title="Select all" />
                  </th>
                  <th>Settlement #</th>
                  <th>Driver</th>
                  <th>Period</th>
                  <th>Pay Type</th>
                  <th>Gross</th>
                  <th>Deductions</th>
                  <th>Net Pay</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {settlements.length === 0 ? (
                  <tr><td colSpan={10}><EmptyState icon={<FaFileInvoiceDollar />} title="No settlements yet" description="Create a settlement to pay your drivers." /></td></tr>
                ) : settlements.map(s => (
                  <tr key={s.id} className={selected.has(s.id) ? 'row-selected' : ''}>
                    <td>
                      <input type="checkbox" className="row-checkbox" checked={selected.has(s.id)} onChange={() => toggleSelect(s.id)} />
                    </td>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => openDetail(s.id)} style={{ color: 'var(--brand-blue-light)', fontWeight: 600 }}>
                        {s.settlement_number}
                      </button>
                    </td>
                    <td style={{ fontWeight: 600 }}>{s.first_name} {s.last_name}</td>
                    <td className="muted">{formatDate(s.period_start)} – {formatDate(s.period_end)}</td>
                    <td className="muted">{s.pay_type?.replace(/_/g, ' ') || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(s.gross_pay)}</td>
                    <td style={{ color: 'var(--danger)' }}>({formatCurrency(s.total_deductions)})</td>
                    <td style={{ fontWeight: 800, color: 'var(--success)' }}>{formatCurrency(s.net_pay)}</td>
                    <td>
                      <select
                        className="filter-select"
                        value={s.status}
                        onChange={e => handleStatusChange(s.id, e.target.value)}
                        style={{ padding: '4px 24px 4px 8px', fontSize: '11px' }}
                      >
                        <option value="draft">Draft</option>
                        <option value="approved">Approved</option>
                        <option value="paid">Paid</option>
                      </select>
                    </td>
                    <td>
                      <div className="flex gap-8">
                        <button className="btn btn-ghost btn-sm" onClick={() => openDetail(s.id)}><FaEye /></button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}><FaEdit /></button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(s)}><FaTrash /></button>
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
          title={editing ? `Edit Settlement ${editing.settlement_number}` : 'Create Settlement'}
          onClose={() => setShowModal(false)}
          size="modal-lg"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving...' : editing ? 'Update' : 'Create Settlement'}
              </button>
            </>
          }
        >
          {/* Step 1: Select driver & period */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Driver *</label>
              <select className="form-control" value={form.driver_id} onChange={f('driver_id')} disabled={!!editing}>
                <option value="">Select driver...</option>
                {drivers.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.first_name} {d.last_name} ({d.pay_type?.replace(/_/g, ' ') || 'no pay type'})
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Period Start *</label>
              <input type="date" className="form-control" value={form.period_start} onChange={f('period_start')} disabled={!!editing} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Period End *</label>
              <input type="date" className="form-control" value={form.period_end} onChange={f('period_end')} disabled={!!editing} />
            </div>
          </div>

          {/* Calculate button */}
          {!editing && form.driver_id && form.period_start && form.period_end && (
            <div style={{ marginBottom: '16px' }}>
              <button type="button" className="btn btn-secondary" onClick={calculatePay} disabled={calculating}>
                {calculating ? 'Calculating...' : <><FaCalculator /> Auto-Calculate from Loads</>}
              </button>
            </div>
          )}

          {/* Calculation result preview */}
          {calcResult && (
            <div className="alert alert-info mb-16">
              <strong>Found {calcResult.loads?.length || 0} loads</strong> for {calcResult.driver_name} — 
              <strong> {calcResult.pay_type?.replace(/_/g, ' ')}</strong> @ {calcResult.pay_type === 'percentage' ? `${calcResult.pay_rate}%` : `$${calcResult.pay_rate}`}
              → Gross: <strong>{formatCurrency(calcResult.gross_pay)}</strong>
            </div>
          )}

          {/* Loads preview */}
          {loadItems.length > 0 && (
            <div className="card mb-16" style={{ padding: 0, maxHeight: '200px', overflow: 'auto' }}>
              <table className="data-table" style={{ fontSize: '12px' }}>
                <thead><tr><th>Load #</th><th>Delivery</th><th>Route</th><th>Miles</th><th>Rate</th><th>Pay</th></tr></thead>
                <tbody>
                  {loadItems.map((item, i) => (
                    <tr key={i}>
                      <td className="mono">{item.load_number}</td>
                      <td className="muted">{formatDate(item.delivery_date)}</td>
                      <td className="muted" style={{ fontSize: '11px' }}>{item.origin} → {item.destination}</td>
                      <td className="muted">{item.miles || '—'}</td>
                      <td>{formatCurrency(item.load_rate)}</td>
                      <td style={{ fontWeight: 700, color: 'var(--success)' }}>{formatCurrency(item.driver_pay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Gross pay */}
          <div className="form-group">
            <label className="form-label">Gross Pay ($) *</label>
            <input type="number" step="0.01" className="form-control" value={form.gross_pay} onChange={f('gross_pay')} required />
          </div>

          {/* Deductions grid */}
          <div className="detail-section-title" style={{ marginTop: '8px' }}>
            <FaMinusCircle style={{ color: 'var(--danger)' }} /> Deductions
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label"><FaGasPump /> Fuel Advance ($)</label>
              <input type="number" step="0.01" className="form-control" value={form.fuel_advance} onChange={f('fuel_advance')} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label"><FaShieldAlt /> Insurance ($)</label>
              <input type="number" step="0.01" className="form-control" value={form.insurance_deduction} onChange={f('insurance_deduction')} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Other ($)</label>
              <input type="number" step="0.01" className="form-control" value={form.other_deduction} onChange={f('other_deduction')} />
            </div>
          </div>

          {parseFloat(form.other_deduction) > 0 && (
            <div className="form-group">
              <label className="form-label">Other Deduction Note</label>
              <input className="form-control" value={form.other_deduction_note} onChange={f('other_deduction_note')} placeholder="e.g. Toll reimbursement" />
            </div>
          )}

          {/* Net pay preview */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '14px', marginBottom: '16px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Total Deductions</label>
              <div className="form-control" style={{ background: 'var(--bg-secondary)', color: 'var(--danger)', fontWeight: 800, cursor: 'default' }}>
                -{formatCurrency(deductions)}
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Net Pay</label>
              <div className="form-control" style={{ background: 'var(--bg-secondary)', color: netPreview >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 800, cursor: 'default', fontSize: '18px' }}>
                {formatCurrency(netPreview >= 0 ? netPreview : 0)}
              </div>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Status</label>
              <select className="form-control" value={form.status} onChange={f('status')}>
                <option value="draft">Draft</option>
                <option value="approved">Approved</option>
                <option value="paid">Paid</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-control" value={form.notes} onChange={f('notes')} rows={2} />
          </div>
        </Modal>
      )}

      {/* Confirm modals */}
      {deleteTarget && (
        <ConfirmModal
          title="Delete Settlement"
          message={`Delete settlement ${deleteTarget.settlement_number}? This cannot be undone.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {showBulkConfirm && (
        <ConfirmModal
          title="Delete Selected Settlements"
          message={`Permanently delete ${selected.size} settlement${selected.size !== 1 ? 's' : ''}?`}
          onConfirm={handleBulkDelete}
          onCancel={() => setShowBulkConfirm(false)}
          confirmLabel={bulkDeleting ? 'Deleting...' : `Delete ${selected.size}`}
        />
      )}
    </div>
  );
}
