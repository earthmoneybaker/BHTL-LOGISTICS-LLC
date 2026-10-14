import { FaTrash, FaEdit, FaCreditCard, FaCheckSquare } from 'react-icons/fa';
import { EXPENSE_CATEGORIES, categoryLabel } from '../../utils/expenseCategories';
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { Spinner, EmptyState, PageHeader, Modal, formatCurrency, formatDate, ConfirmModal } from '../../components/ui';
import toast from 'react-hot-toast';

const defaultForm = {
  category: 'fuel', amount: '', expense_date: new Date().toISOString().split('T')[0],
  description: '', truck_id: '', driver_id: '', load_id: '', vendor: '', receipt_ref: '',
};

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [trucks, setTrucks] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [filters, setFilters] = useState({ category: '', truck_id: '', date_from: '', date_to: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  // Multi-select state
  const [selected, setSelected] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([,v]) => v));
      const [expRes, sumRes, truckRes, driverRes] = await Promise.all([
        api.get('/expenses', { params }),
        api.get('/expenses/summary', { params }),
        api.get('/trucks'),
        api.get('/drivers', { params: { active: true } }),
      ]);
      setExpenses(expRes.data.expenses);
      setSummary(sumRes.data);
      setTrucks(truckRes.data);
      setDrivers(driverRes.data);
      setSelected(new Set()); // clear selection on refresh
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(defaultForm); setShowModal(true); };
  const openEdit = (e) => { setEditing(e); setForm({ ...defaultForm, ...e, expense_date: e.expense_date?.split('T')[0] || '' }); setShowModal(true); };

  const handleSave = async (ev) => {
    ev.preventDefault(); setSaving(true);
    try {
      if (editing) { await api.put(`/expenses/${editing.id}`, form); toast.success('Updated'); }
      else { await api.post('/expenses', form); toast.success('Expense recorded'); }
      setShowModal(false); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try { await api.delete(`/expenses/${deleteTarget.id}`); toast.success('Deleted'); setDeleteTarget(null); load(); }
    catch { toast.error('Failed'); }
  };

  // Multi-select helpers
  const toggleSelect = (id) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const toggleSelectAll = () => {
    if (selected.size === expenses.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(expenses.map(e => e.id)));
    }
  };

  const handleBulkDelete = async () => {
    setBulkDeleting(true);
    try {
      const res = await api.post('/expenses/bulk-delete', { ids: [...selected] });
      toast.success(`${res.data.deleted} expense${res.data.deleted !== 1 ? 's' : ''} deleted`);
      setShowBulkConfirm(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Bulk delete failed');
    } finally {
      setBulkDeleting(false);
    }
  };

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));
  const totalExpenses = expenses.reduce((a, e) => a + parseFloat(e.amount), 0);
  const allSelected = expenses.length > 0 && selected.size === expenses.length;
  const someSelected = selected.size > 0;

  return (
    <div>
      <PageHeader title="Expenses"
        subtitle={`${expenses.length} records — Total: ${formatCurrency(totalExpenses)}`}
        actions={<button className="btn btn-primary" onClick={openCreate}>+ Add Expense</button>}
      />

      {/* Category Summary */}
      {summary.length > 0 && (
        <div className="card mb-16">
          <div className="card-title mb-12">By Category</div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {summary.map(s => (
              <div key={s.category} style={{ textAlign:'center', minWidth:'90px' }}>
                <div style={{ fontSize:'18px', fontWeight:800, color:'var(--danger)' }}>{formatCurrency(s.total)}</div>
                <div style={{ fontSize:'11px', color:'var(--text-muted)', textTransform:'uppercase', marginTop:'2px' }}>{s.category}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="filter-bar mb-16">
        <select className="filter-select" value={filters.category} onChange={e => setFilters(f => ({ ...f, category: e.target.value }))}>
          <option value="">All Categories</option>
          {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select className="filter-select" value={filters.truck_id} onChange={e => setFilters(f => ({ ...f, truck_id: e.target.value }))}>
          <option value="">All Trucks</option>
          {trucks.map(t => <option key={t.id} value={t.id}>#{t.unit_number}</option>)}
        </select>
        <input type="date" className="filter-select" value={filters.date_from} onChange={e => setFilters(f => ({ ...f, date_from: e.target.value }))} />
        <input type="date" className="filter-select" value={filters.date_to} onChange={e => setFilters(f => ({ ...f, date_to: e.target.value }))} />
        <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ category:'', truck_id:'', date_from:'', date_to:'' })}>Clear</button>
      </div>

      {/* Bulk action bar */}
      {someSelected && (
        <div className="bulk-action-bar">
          <span className="bulk-action-count">
            <FaCheckSquare style={{ color: 'var(--brand-blue-light)' }} />
            {selected.size} expense{selected.size !== 1 ? 's' : ''} selected
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
                  <th>Date</th><th>Category</th><th>Description</th><th>Vendor</th><th>Truck</th><th>Driver</th><th>Amount</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? <tr><td colSpan={9}><EmptyState icon={<FaCreditCard />} title="No expenses" /></td></tr>
                  : expenses.map(exp => (
                  <tr key={exp.id} className={selected.has(exp.id) ? 'row-selected' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        className="row-checkbox"
                        checked={selected.has(exp.id)}
                        onChange={() => toggleSelect(exp.id)}
                      />
                    </td>
                    <td className="muted">{formatDate(exp.expense_date)}</td>
                    <td><span className="badge badge-invoiced">{categoryLabel(exp.category)}</span></td>
                    <td className="truncate">{exp.description || '—'}</td>
                    <td className="muted">{exp.vendor || '—'}</td>
                    <td className="muted">{exp.truck_unit ? `#${exp.truck_unit}` : '—'}</td>
                    <td className="muted">{exp.driver_first ? `${exp.driver_first} ${exp.driver_last}` : '—'}</td>
                    <td style={{ fontWeight:700, color:'var(--danger)' }}>{formatCurrency(exp.amount)}</td>
                    <td>
                      <div className="flex gap-8">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(exp)}><FaEdit /></button>
                        <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(exp)}><FaTrash /></button>
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
        <Modal title={editing ? 'Edit Expense' : 'Record Expense'} onClose={() => setShowModal(false)}
          footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Save'}</button></>}
        >
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
            <div className="form-group"><label className="form-label">Category *</label>
              <select className="form-control" value={form.category} onChange={f('category')}>
                {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Amount ($) *</label><input type="number" step="0.01" className="form-control" value={form.amount} onChange={f('amount')} required /></div>
            <div className="form-group"><label className="form-label">Date *</label><input type="date" className="form-control" value={form.expense_date} onChange={f('expense_date')} required /></div>
            <div className="form-group"><label className="form-label">Vendor</label><input className="form-control" value={form.vendor} onChange={f('vendor')} /></div>
            <div className="form-group"><label className="form-label">Truck</label>
              <select className="form-control" value={form.truck_id} onChange={f('truck_id')}>
                <option value="">N/A</option>
                {trucks.map(t => <option key={t.id} value={t.id}>#{t.unit_number}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Driver</label>
              <select className="form-control" value={form.driver_id} onChange={f('driver_id')}>
                <option value="">N/A</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Receipt Ref</label><input className="form-control" value={form.receipt_ref} onChange={f('receipt_ref')} /></div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}><label className="form-label">Description</label><textarea className="form-control" value={form.description} onChange={f('description')} rows={2} /></div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal title="Delete Expense" message="Delete this expense record?" onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}

      {showBulkConfirm && (
        <ConfirmModal
          title="Delete Selected Expenses"
          message={`Permanently delete ${selected.size} expense${selected.size !== 1 ? 's' : ''}? This cannot be undone.`}
          onConfirm={handleBulkDelete}
          onCancel={() => setShowBulkConfirm(false)}
          confirmLabel={bulkDeleting ? 'Deleting...' : `Delete ${selected.size} Expenses`}
        />
      )}
    </div>
  );
}
