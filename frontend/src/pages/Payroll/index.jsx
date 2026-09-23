import { FaTrash, FaEdit, FaMoneyBillWave, FaCalculator } from 'react-icons/fa';
import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import { Spinner, EmptyState, PageHeader, Modal, formatCurrency, formatDate } from '../../components/ui';
import toast from 'react-hot-toast';

export default function Payroll() {
  const [records, setRecords] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [calcResult, setCalcResult] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [form, setForm] = useState({
    driver_id: '', person_type: 'driver', period_start: '', period_end: '',
    gross_pay: '', deductions: '0', deduction_notes: '', notes: '', status: 'draft',
  });
  const [loadItems, setLoadItems] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [prRes, drRes] = await Promise.all([api.get('/payroll'), api.get('/drivers', { params: { active: true } })]);
      setRecords(prRes.data);
      setDrivers(drRes.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.value }));

  const calculatePay = async () => {
    if (!form.driver_id || !form.period_start || !form.period_end) {
      toast.error('Select driver and period first'); return;
    }
    setCalculating(true);
    try {
      const res = await api.post('/payroll/calculate', { driver_id: form.driver_id, period_start: form.period_start, period_end: form.period_end });
      setCalcResult(res.data);
      setForm(p => ({ ...p, gross_pay: res.data.gross_pay.toFixed(2) }));
      setLoadItems(res.data.loads || []);
    } catch { toast.error('Calculation failed'); }
    finally { setCalculating(false); }
  };

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const net = parseFloat(form.gross_pay) - parseFloat(form.deductions || 0);
      const payload = { ...form, net_pay: net, load_items: loadItems };
      if (editing) { await api.put(`/payroll/${editing.id}`, payload); toast.success('Updated'); }
      else { await api.post('/payroll', payload); toast.success('Payroll record created'); }
      setShowModal(false); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); } finally { setSaving(false); }
  };

  const openCreate = () => {
    setEditing(null);
    setCalcResult(null);
    setLoadItems([]);
    setForm({ driver_id:'', person_type:'driver', period_start:'', period_end:'', gross_pay:'', deductions:'0', deduction_notes:'', notes:'', status:'draft' });
    setShowModal(true);
  };

  const openEdit = (r) => {
    setEditing(r);
    setCalcResult(null);
    setLoadItems([]);
    setForm({ driver_id: r.driver_id||'', person_type: r.person_type, period_start: r.period_start?.split('T')[0]||'', period_end: r.period_end?.split('T')[0]||'', gross_pay: r.gross_pay, deductions: r.deductions||'0', deduction_notes: r.deduction_notes||'', notes: r.notes||'', status: r.status });
    setShowModal(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this payroll record?')) return;
    try { await api.delete(`/payroll/${id}`); toast.success('Deleted'); load(); }
    catch { toast.error('Failed'); }
  };

  const net = (parseFloat(form.gross_pay || 0) - parseFloat(form.deductions || 0));

  return (
    <div>
      <PageHeader title="Internal Payroll"
        subtitle="Calculation & record-keeping only — no bank transfers or tax filing"
        actions={<button className="btn btn-primary" onClick={openCreate}>+ New Payroll Entry</button>}
      />

      <div className="alert alert-info mb-16">
        ℹ️ <strong>Internal use only.</strong> Net pay is calculated and recorded here. Actual payment, direct deposit, and tax e-filing require separate arrangements with a payroll service.
      </div>

      {loading ? <Spinner /> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Person</th><th>Period</th><th>Pay Type</th><th>Gross Pay</th><th>Deductions</th><th>Net Pay</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {records.length === 0 ? <tr><td colSpan={8}><EmptyState icon={<FaMoneyBillWave />} title="No payroll records" /></td></tr>
                  : records.map(r => (
                  <tr key={r.id}>
                    <td style={{ fontWeight:600 }}>{r.first_name ? `${r.first_name} ${r.last_name}` : r.staff_name || '—'}</td>
                    <td className="muted">{formatDate(r.period_start)} – {formatDate(r.period_end)}</td>
                    <td className="muted">{r.pay_type?.replace(/_/g,' ') || '—'}</td>
                    <td style={{ fontWeight:600 }}>{formatCurrency(r.gross_pay)}</td>
                    <td style={{ color:'var(--danger)' }}>({formatCurrency(r.deductions)})</td>
                    <td style={{ fontWeight:800, color:'var(--success)' }}>{formatCurrency(r.net_pay)}</td>
                    <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
                    <td>
                      <div className="flex gap-8">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(r)}><FaEdit /></button>
                        <button className="btn btn-danger btn-sm" onClick={() => handleDelete(r.id)}><FaTrash /></button>
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
        <Modal title={editing ? 'Edit Payroll Record' : 'New Payroll Entry'} onClose={() => setShowModal(false)} size="modal-lg"
          footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Record'}</button></>}
        >
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
            <div className="form-group"><label className="form-label">Person Type</label>
              <select className="form-control" value={form.person_type} onChange={f('person_type')}>
                <option value="driver">Driver</option><option value="staff">Office Staff</option>
              </select>
            </div>
            {form.person_type === 'driver' && (
              <div className="form-group"><label className="form-label">Driver *</label>
                <select className="form-control" value={form.driver_id} onChange={f('driver_id')}>
                  <option value="">Select driver...</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name} ({d.pay_type?.replace(/_/g,' ')})</option>)}
                </select>
              </div>
            )}
            <div className="form-group"><label className="form-label">Period Start *</label><input type="date" className="form-control" value={form.period_start} onChange={f('period_start')} /></div>
            <div className="form-group"><label className="form-label">Period End *</label><input type="date" className="form-control" value={form.period_end} onChange={f('period_end')} /></div>
          </div>

          {form.person_type === 'driver' && form.driver_id && (
            <div style={{ marginBottom:'16px' }}>
              <button type="button" className="btn btn-secondary" onClick={calculatePay} disabled={calculating}>
                {calculating ? 'Calculating...' : <><FaCalculator /> Auto-Calculate from Completed Loads</>}
              </button>
            </div>
          )}

          {calcResult && (
            <div className="alert alert-info mb-16">
              <div>
                <strong>Calculation Result:</strong> {calcResult.pay_type?.replace(/_/g,' ')} @ {calcResult.pay_type === 'percentage' ? `${calcResult.pay_rate}%` : `$${calcResult.pay_rate}`}<br/>
                Loads completed in period: {calcResult.loads?.length || 0} → <strong>Gross: {formatCurrency(calcResult.gross_pay)}</strong>
              </div>
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'14px' }}>
            <div className="form-group"><label className="form-label">Gross Pay ($) *</label><input type="number" step="0.01" className="form-control" value={form.gross_pay} onChange={f('gross_pay')} required /></div>
            <div className="form-group"><label className="form-label">Deductions ($)</label><input type="number" step="0.01" className="form-control" value={form.deductions} onChange={f('deductions')} /></div>
            <div className="form-group"><label className="form-label">Net Pay (Preview)</label>
              <div className="form-control" style={{ background:'var(--bg-secondary)', color:'var(--success)', fontWeight:800, cursor:'default' }}>
                {formatCurrency(net >= 0 ? net : 0)}
              </div>
            </div>
          </div>

          <div className="form-group"><label className="form-label">Deduction Notes</label><input className="form-control" value={form.deduction_notes} onChange={f('deduction_notes')} placeholder="Insurance, advance repayment, etc." /></div>
          <div className="form-group"><label className="form-label">Status</label>
            <select className="form-control" value={form.status} onChange={f('status')}>
              <option value="draft">Draft</option><option value="approved">Approved</option><option value="paid">Paid</option>
            </select>
          </div>
          <div className="form-group"><label className="form-label">Notes</label><textarea className="form-control" value={form.notes} onChange={f('notes')} rows={2} /></div>
        </Modal>
      )}
    </div>
  );
}
