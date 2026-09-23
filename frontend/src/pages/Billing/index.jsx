import { FaEdit, FaChartBar, FaFileAlt, FaDownload, FaPlus } from 'react-icons/fa';
import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import { downloadFile } from '../../api/client';
import { Spinner, EmptyState, PageHeader, Modal, formatCurrency, formatDate, ConfirmModal } from '../../components/ui';
import toast from 'react-hot-toast';

export default function Billing() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('invoices');
  const [filters, setFilters] = useState({ status: '', customer_id: '' });
  const [customers, setCustomers] = useState([]);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([,v]) => v));
      const [invRes, custRes] = await Promise.all([
        api.get('/invoices', { params }),
        api.get('/customers'),
      ]);
      setInvoices(invRes.data);
      setCustomers(custRes.data);
    } finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const openEdit = (inv) => {
    setEditingInvoice(inv);
    setEditForm({ status: inv.status, paid_date: inv.paid_date?.split('T')[0] || '', paid_amount: inv.amount, factoring_company: inv.factoring_company || '', factoring_notes: inv.factoring_notes || '', notes: inv.notes || '', due_date: inv.due_date?.split('T')[0] || '' });
    setShowEditModal(true);
  };

  const handleUpdate = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.put(`/invoices/${editingInvoice.id}`, editForm);
      toast.success('Invoice updated');
      setShowEditModal(false); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); } finally { setSaving(false); }
  };

  const handleVoid = async (inv) => {
    if (!confirm(`Void invoice ${inv.invoice_number}?`)) return;
    try { await api.delete(`/invoices/${inv.id}`); toast.success('Voided'); load(); }
    catch { toast.error('Failed'); }
  };

  const downloadPdf = (id) => {
    downloadFile(`/invoices/${id}/pdf`, `invoice-${id}.pdf`);  };

  const ef = (k) => (e) => setEditForm(p => ({ ...p, [k]: e.target.value }));

  // Aging buckets
  const aging = {
    current: invoices.filter(i => i.status !== 'paid' && i.status !== 'voided' && (i.days_overdue || 0) <= 0),
    '1_30': invoices.filter(i => i.status === 'overdue' && i.days_overdue > 0 && i.days_overdue <= 30),
    '31_60': invoices.filter(i => i.status === 'overdue' && i.days_overdue > 30 && i.days_overdue <= 60),
    '61_90': invoices.filter(i => i.status === 'overdue' && i.days_overdue > 60 && i.days_overdue <= 90),
    '90plus': invoices.filter(i => i.status === 'overdue' && i.days_overdue > 90),
  };

  const totalUnpaid = invoices.filter(i => i.status !== 'paid' && i.status !== 'voided').reduce((a,i) => a + parseFloat(i.amount), 0);

  return (
    <div>
      <PageHeader title="Billing & Invoices" subtitle={`${invoices.length} invoices — ${formatCurrency(totalUnpaid)} outstanding`} />

      <div className="tabs">
        {[['invoices', <><FaFileAlt /> All Invoices</>], ['aging', <><FaChartBar /> Aging Report</>]].map(([t,l]) => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {tab === 'invoices' && (
        <>
          <div className="filter-bar mb-16">
            <select className="filter-select" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
              <option value="">All Statuses</option>
              {['unpaid','paid','overdue','voided'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="filter-select" value={filters.customer_id} onChange={e => setFilters(f => ({ ...f, customer_id: e.target.value }))}>
              <option value="">All Customers</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ status:'', customer_id:'' })}>Clear</button>
          </div>

          {loading ? <Spinner /> : (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead><tr><th>Invoice #</th><th>Customer</th><th>Load #</th><th>Amount</th><th>Issued</th><th>Due</th><th>Days Overdue</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {invoices.length === 0 ? <tr><td colSpan={9}><EmptyState icon={<FaFileAlt />} title="No invoices" description="Generate invoices from delivered loads." /></td></tr>
                      : invoices.map(inv => (
                      <tr key={inv.id}>
                        <td className="mono" style={{ fontWeight:700 }}>{inv.invoice_number}</td>
                        <td className="truncate">{inv.customer_name}</td>
                        <td className="mono" style={{ fontSize:'12px' }}>{inv.load_number || '—'}</td>
                        <td style={{ fontWeight:700, color:'var(--success)' }}>{formatCurrency(inv.amount)}</td>
                        <td className="muted">{formatDate(inv.date_issued)}</td>
                        <td className="muted">{formatDate(inv.due_date)}</td>
                        <td style={{ color: inv.days_overdue > 0 ? 'var(--danger)' : 'var(--text-muted)', fontWeight: inv.days_overdue > 0 ? 700 : 400 }}>
                          {inv.days_overdue > 0 ? `${inv.days_overdue}d` : '—'}
                        </td>
                        <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
                        <td>
                          <div className="flex gap-8">
                            <button className="btn btn-secondary btn-sm" onClick={() => openEdit(inv)}><FaEdit /></button>
                            <button className="btn btn-secondary btn-sm" onClick={() => downloadPdf(inv.id)}><FaDownload /> PDF</button>
                            {inv.status !== 'voided' && (
                              <button className="btn btn-danger btn-sm" onClick={() => handleVoid(inv)}>Void</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'aging' && (
        <div>
          <div className="stat-grid mb-16">
            {[
              { label: 'Current', data: aging.current, color: 'var(--success)' },
              { label: '1–30 Days', data: aging['1_30'], color: 'var(--warning)' },
              { label: '31–60 Days', data: aging['31_60'], color: 'var(--brand-orange)' },
              { label: '61–90 Days', data: aging['61_90'], color: 'var(--danger)' },
              { label: '90+ Days', data: aging['90plus'], color: '#7F1D1D' },
            ].map(bucket => (
              <div key={bucket.label} className="stat-card" style={{ '--accent': bucket.color }}>
                <div className="stat-label">{bucket.label}</div>
                <div className="stat-value" style={{ fontSize:'20px', color: bucket.color }}>
                  {formatCurrency(bucket.data.reduce((a,i) => a + parseFloat(i.amount), 0))}
                </div>
                <div className="stat-sub">{bucket.data.length} invoices</div>
              </div>
            ))}
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Invoice #</th><th>Customer</th><th>Amount</th><th>Due Date</th><th>Days Overdue</th><th>Status</th><th>Actions</th></tr></thead>
                <tbody>
                  {invoices.filter(i => i.status !== 'voided' && i.status !== 'paid').map(inv => (
                    <tr key={inv.id}>
                      <td className="mono">{inv.invoice_number}</td>
                      <td>{inv.customer_name}</td>
                      <td style={{ fontWeight:700 }}>{formatCurrency(inv.amount)}</td>
                      <td className="muted">{formatDate(inv.due_date)}</td>
                      <td style={{ color: inv.days_overdue > 90 ? '#7F1D1D' : inv.days_overdue > 60 ? 'var(--danger)' : inv.days_overdue > 30 ? 'var(--brand-orange)' : inv.days_overdue > 0 ? 'var(--warning)' : 'var(--success)', fontWeight: 700 }}>
                        {inv.days_overdue > 0 ? `${inv.days_overdue}d` : 'Current'}
                      </td>
                      <td><span className={`badge badge-${inv.status}`}>{inv.status}</span></td>
                      <td>
                        <div className="flex gap-8">
                          <button className="btn btn-secondary btn-sm" onClick={() => openEdit(inv)}>Mark Paid</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => downloadPdf(inv.id)}><FaDownload /> PDF</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {showEditModal && editingInvoice && (
        <Modal title={`Edit Invoice ${editingInvoice.invoice_number}`} onClose={() => setShowEditModal(false)}
          footer={<><button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleUpdate} disabled={saving}>{saving ? 'Saving...' : 'Update'}</button></>}
        >
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
            <div className="form-group"><label className="form-label">Status</label>
              <select className="form-control" value={editForm.status} onChange={ef('status')}>
                {['unpaid','paid','overdue','voided'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Due Date</label><input type="date" className="form-control" value={editForm.due_date} onChange={ef('due_date')} /></div>
            {editForm.status === 'paid' && (
              <>
                <div className="form-group"><label className="form-label">Paid Date</label><input type="date" className="form-control" value={editForm.paid_date} onChange={ef('paid_date')} /></div>
                <div className="form-group"><label className="form-label">Amount Paid</label><input type="number" step="0.01" className="form-control" value={editForm.paid_amount} onChange={ef('paid_amount')} /></div>
              </>
            )}
            <div className="form-group"><label className="form-label">Factoring Company</label><input className="form-control" value={editForm.factoring_company} onChange={ef('factoring_company')} placeholder="Manual entry only" /></div>
            <div className="form-group"><label className="form-label">Factoring Notes</label><input className="form-control" value={editForm.factoring_notes} onChange={ef('factoring_notes')} /></div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}><label className="form-label">Notes</label><textarea className="form-control" value={editForm.notes} onChange={ef('notes')} rows={3} /></div>
          </div>
        </Modal>
      )}
    </div>
  );
}
