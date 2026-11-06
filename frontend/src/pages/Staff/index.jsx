import { FaUserTie, FaPlus, FaEdit, FaTrash, FaMoneyBillWave, FaCheck, FaTimes, FaChartLine } from 'react-icons/fa';
import { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';
import { Spinner, EmptyState, PageHeader, Modal, formatCurrency, formatDate, ConfirmModal } from '../../components/ui';
import toast from 'react-hot-toast';

const PAY_TYPES  = ['salary', 'hourly', 'per_load', 'contract'];
const PAY_PERIODS = ['weekly', 'bi_weekly', 'monthly', 'per_load'];
const ROLES = ['Manager', 'Dispatcher', 'Office Admin', 'Accountant', 'Safety Officer', 'Mechanic', 'Other'];

const defaultForm = {
  first_name: '', last_name: '', role: 'Dispatcher', email: '', phone: '',
  hire_date: '', pay_type: 'salary', pay_rate: '', pay_period: 'monthly', is_active: true, notes: '',
};

const defaultPayForm = {
  period_start: '', period_end: '', amount: '', payment_date: new Date().toISOString().split('T')[0],
  payment_method: 'Bank Transfer', notes: '', status: 'paid',
};

export default function Staff() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  // Payment panel
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [payments, setPayments] = useState([]);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payForm, setPayForm] = useState(defaultPayForm);
  const [payLoading, setPayLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/staff');
      setStaff(res.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openPayments = async (member) => {
    setSelectedStaff(member);
    setPayLoading(true);
    try {
      const res = await api.get(`/staff/${member.id}/payments`);
      setPayments(res.data);
    } finally { setPayLoading(false); }
  };

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const pf = (k) => (e) => setPayForm(p => ({ ...p, [k]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editing) {
        await api.put(`/staff/${editing.id}`, form);
        toast.success('Staff member updated');
      } else {
        await api.post('/staff', form);
        toast.success('Staff member added');
      }
      setShowForm(false); setEditing(null); setForm(defaultForm);
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/staff/${deleteTarget.id}`);
      toast.success('Staff member removed');
      setDeleteTarget(null); load();
      if (selectedStaff?.id === deleteTarget.id) setSelectedStaff(null);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const handleLogPayment = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post(`/staff/${selectedStaff.id}/payments`, payForm);
      toast.success('Payment logged');
      setShowPayForm(false); setPayForm(defaultPayForm);
      openPayments(selectedStaff);
      load(); // Refresh totals
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
    finally { setSaving(false); }
  };

  const markPaid = async (payId) => {
    try {
      await api.patch(`/staff/payments/${payId}/status`, { status: 'paid', payment_date: new Date().toISOString().split('T')[0] });
      toast.success('Marked as paid');
      openPayments(selectedStaff);
      load();
    } catch { toast.error('Failed'); }
  };

  const totalMonthlyPayroll = staff.filter(s => s.is_active).reduce((sum, s) => {
    const rate = parseFloat(s.pay_rate) || 0;
    if (s.pay_period === 'monthly') return sum + rate;
    if (s.pay_period === 'weekly') return sum + rate * 4.33;
    if (s.pay_period === 'bi_weekly') return sum + rate * 2.17;
    return sum + rate;
  }, 0);

  return (
    <div>
      <PageHeader
        title="Staff Management"
        subtitle="Track non-driver staff, payment methods, and payroll records for P&L"
        action={
          <button className="btn btn-primary" onClick={() => { setEditing(null); setForm(defaultForm); setShowForm(true); }}>
            <FaPlus style={{ marginRight: 6 }} /> Add Staff Member
          </button>
        }
      />

      {/* Summary stats */}
      <div className="stat-grid mb-20">
        <div className="stat-card" style={{ '--accent': 'var(--brand-blue-light)' }}>
          <div className="stat-label">Active Staff</div>
          <div className="stat-value">{staff.filter(s => s.is_active).length}</div>
          <div className="stat-sub">{staff.filter(s => !s.is_active).length} inactive</div>
        </div>
        <div className="stat-card" style={{ '--accent': 'var(--danger)' }}>
          <div className="stat-label">Est. Monthly Payroll</div>
          <div className="stat-value" style={{ fontSize: 20 }}>{formatCurrency(totalMonthlyPayroll)}</div>
          <div className="stat-sub">Active staff only</div>
        </div>
        <div className="stat-card" style={{ '--accent': 'var(--brand-orange)' }}>
          <div className="stat-label">Total Paid (All Time)</div>
          <div className="stat-value" style={{ fontSize: 20 }}>
            {formatCurrency(staff.reduce((s, m) => s + parseFloat(m.total_paid || 0), 0))}
          </div>
        </div>
        <div className="stat-card" style={{ '--accent': '#F59E0B' }}>
          <div className="stat-label">Pending Payments</div>
          <div className="stat-value" style={{ fontSize: 20, color: 'var(--brand-orange)' }}>
            {formatCurrency(staff.reduce((s, m) => s + parseFloat(m.total_pending || 0), 0))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedStaff ? '1fr 1.4fr' : '1fr', gap: 20 }}>
        {/* Staff List */}
        <div>
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', fontWeight: 700, fontSize: 14 }}>
              Staff Members
            </div>
            {loading ? <Spinner /> : staff.length === 0 ? (
              <EmptyState icon={<FaUserTie />} title="No staff members yet"
                description="Add office staff, dispatchers, or other non-driver employees" />
            ) : (
              <div>
                {staff.map(member => (
                  <div key={member.id}
                    onClick={() => openPayments(member)}
                    style={{
                      padding: '14px 20px',
                      borderBottom: '1px solid var(--border-color)',
                      cursor: 'pointer',
                      background: selectedStaff?.id === member.id ? 'rgba(59,130,246,0.08)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (selectedStaff?.id !== member.id) e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
                    onMouseLeave={e => { if (selectedStaff?.id !== member.id) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 42, height: 42, borderRadius: 10,
                          background: member.is_active ? 'rgba(59,130,246,0.15)' : 'rgba(100,116,139,0.1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <FaUserTie style={{ color: member.is_active ? 'var(--brand-blue-light)' : 'var(--text-muted)', fontSize: 18 }} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>
                            {member.first_name} {member.last_name}
                            {!member.is_active && <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text-muted)', background: 'var(--bg-primary)', padding: '1px 6px', borderRadius: 10 }}>Inactive</span>}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--brand-orange)', fontWeight: 600 }}>{member.role}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                            {member.pay_type === 'salary' ? 'Salary' : member.pay_type}: {member.pay_rate ? formatCurrency(member.pay_rate) : '—'} / {member.pay_period}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        <div style={{ textAlign: 'right', marginRight: 8 }}>
                          {parseFloat(member.total_pending) > 0 && (
                            <div style={{ fontSize: 11, color: 'var(--brand-orange)', fontWeight: 600 }}>
                              {formatCurrency(member.total_pending)} pending
                            </div>
                          )}
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            Paid: {formatCurrency(member.total_paid)}
                          </div>
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); setEditing(member); setForm({ ...defaultForm, ...member, hire_date: member.hire_date?.split('T')[0] || '', pay_rate: member.pay_rate || '' }); setShowForm(true); }}>
                          <FaEdit />
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={e => { e.stopPropagation(); setDeleteTarget(member); }}>
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Payment Panel */}
        {selectedStaff && (
          <div>
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{selectedStaff.first_name} {selectedStaff.last_name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedStaff.role} • Payment Records</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-primary btn-sm" onClick={() => setShowPayForm(true)}>
                    <FaMoneyBillWave style={{ marginRight: 5 }} /> Log Payment
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setSelectedStaff(null)}>
                    <FaTimes />
                  </button>
                </div>
              </div>

              {/* Quick stats for selected member */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 1, borderBottom: '1px solid var(--border-color)' }}>
                {[
                  { label: 'Total Paid', value: formatCurrency(selectedStaff.total_paid), color: 'var(--success)' },
                  { label: 'Pending', value: formatCurrency(selectedStaff.total_pending), color: 'var(--brand-orange)' },
                  { label: 'Pay Rate', value: selectedStaff.pay_rate ? `${formatCurrency(selectedStaff.pay_rate)}/${selectedStaff.pay_period}` : '—', color: 'var(--text-primary)' },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ padding: '12px 16px', background: 'var(--bg-primary)' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
                    <div style={{ fontWeight: 800, fontSize: 15, color, marginTop: 2 }}>{value}</div>
                  </div>
                ))}
              </div>

              {payLoading ? <Spinner /> : (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr><th>Period</th><th>Amount</th><th>Method</th><th>Date</th><th>Status</th><th></th></tr>
                    </thead>
                    <tbody>
                      {payments.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No payments logged yet</td></tr>
                      ) : payments.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontSize: 12 }}>
                            {formatDate(p.period_start)} – {formatDate(p.period_end)}
                          </td>
                          <td style={{ fontWeight: 700, color: 'var(--danger)' }}>{formatCurrency(p.amount)}</td>
                          <td className="muted">{p.payment_method || '—'}</td>
                          <td className="muted">{formatDate(p.payment_date)}</td>
                          <td>
                            <span style={{
                              fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                              background: p.status === 'paid' ? 'rgba(5,122,85,0.15)' : 'rgba(245,158,11,0.15)',
                              color: p.status === 'paid' ? 'var(--success)' : 'var(--brand-orange)',
                            }}>
                              {p.status === 'paid' ? '✓ Paid' : '⏳ Pending'}
                            </span>
                          </td>
                          <td>
                            {p.status === 'pending' && (
                              <button className="btn btn-ghost btn-sm" onClick={() => markPaid(p.id)} title="Mark as paid">
                                <FaCheck />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Staff Modal */}
      {showForm && (
        <Modal
          title={editing ? `Edit — ${editing.first_name} ${editing.last_name}` : 'Add Staff Member'}
          onClose={() => { setShowForm(false); setEditing(null); setForm(defaultForm); }}
          size="modal-lg"
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => { setShowForm(false); setEditing(null); }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group"><label className="form-label">First Name *</label><input className="form-control" value={form.first_name} onChange={f('first_name')} required /></div>
            <div className="form-group"><label className="form-label">Last Name *</label><input className="form-control" value={form.last_name} onChange={f('last_name')} required /></div>
            <div className="form-group">
              <label className="form-label">Role</label>
              <select className="form-control" value={form.role} onChange={f('role')}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" value={form.email} onChange={f('email')} /></div>
            <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={form.phone} onChange={f('phone')} /></div>
            <div className="form-group"><label className="form-label">Hire Date</label><input type="date" className="form-control" value={form.hire_date} onChange={f('hire_date')} /></div>
            <div className="form-group">
              <label className="form-label">Pay Type</label>
              <select className="form-control" value={form.pay_type} onChange={f('pay_type')}>
                {PAY_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Pay Rate ($)</label><input type="number" step="0.01" className="form-control" value={form.pay_rate} onChange={f('pay_rate')} /></div>
            <div className="form-group">
              <label className="form-label">Pay Period</label>
              <select className="form-control" value={form.pay_period} onChange={f('pay_period')}>
                {PAY_PERIODS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label className="form-label" style={{ margin: 0 }}>Active</label>
              <input type="checkbox" checked={form.is_active} onChange={f('is_active')} style={{ width: 18, height: 18 }} />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label className="form-label">Notes</label>
              <textarea className="form-control" value={form.notes} onChange={f('notes')} rows={2} />
            </div>
          </div>
        </Modal>
      )}

      {/* Log Payment Modal */}
      {showPayForm && (
        <Modal
          title={`Log Payment — ${selectedStaff?.first_name} ${selectedStaff?.last_name}`}
          onClose={() => { setShowPayForm(false); setPayForm(defaultPayForm); }}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setShowPayForm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleLogPayment} disabled={saving}>{saving ? 'Saving...' : 'Log Payment'}</button>
            </>
          }
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div className="form-group"><label className="form-label">Period Start *</label><input type="date" className="form-control" value={payForm.period_start} onChange={pf('period_start')} /></div>
            <div className="form-group"><label className="form-label">Period End *</label><input type="date" className="form-control" value={payForm.period_end} onChange={pf('period_end')} /></div>
            <div className="form-group"><label className="form-label">Amount ($) *</label><input type="number" step="0.01" className="form-control" value={payForm.amount} onChange={pf('amount')} /></div>
            <div className="form-group"><label className="form-label">Payment Date</label><input type="date" className="form-control" value={payForm.payment_date} onChange={pf('payment_date')} /></div>
            <div className="form-group"><label className="form-label">Payment Method</label>
              <select className="form-control" value={payForm.payment_method} onChange={pf('payment_method')}>
                {['Bank Transfer', 'Check', 'Cash', 'Zelle', 'PayPal', 'Other'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Status</label>
              <select className="form-control" value={payForm.status} onChange={pf('status')}>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}><label className="form-label">Notes</label><input className="form-control" value={payForm.notes} onChange={pf('notes')} /></div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Remove Staff Member"
          message={`Remove ${deleteTarget.first_name} ${deleteTarget.last_name}? All their payment records will also be deleted.`}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
