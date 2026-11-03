import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Spinner, PageHeader } from '../../components/ui';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import {
  FaCog, FaDollarSign, FaTruck, FaShieldAlt, FaPercent, FaUser, FaSave,
  FaBuilding, FaKey, FaInfoCircle, FaBell, FaExclamationTriangle
} from 'react-icons/fa';

const Section = ({ icon, title, children }) => (
  <div className="card" style={{ marginBottom: 24 }}>
    <div className="card-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: 12, marginBottom: 20 }}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'var(--brand-orange)' }}>{icon}</span> {title}
      </div>
    </div>
    {children}
  </div>
);

const FieldRow = ({ label, hint, children }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
    <div>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{label}</div>
      {hint && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
    </div>
    <div style={{ minWidth: 160 }}>{children}</div>
  </div>
);

const AmountInput = ({ value, onChange, prefix = '$', suffix = '' }) => (
  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
    {prefix && <span style={{ position: 'absolute', left: 10, color: 'var(--text-muted)', fontSize: 13 }}>{prefix}</span>}
    <input
      type="number"
      step="0.01"
      min="0"
      value={value}
      onChange={onChange}
      className="form-input"
      style={{ paddingLeft: prefix ? 24 : 10, paddingRight: suffix ? 28 : 10, textAlign: 'right', width: 160 }}
    />
    {suffix && <span style={{ position: 'absolute', right: 10, color: 'var(--text-muted)', fontSize: 13 }}>{suffix}</span>}
  </div>
);

export default function Settings() {
  const { user, isAdmin } = useAuth();
  const [settings, setSettings] = useState({
    company_name: 'BHTL Logistics LLC',
    mc_number: '', dot_number: '', address_line1: '', address_line2: '',
    city: 'Dayton', state: 'OH', zip: '', phone: '', email: '',
    ifta_license: '', base_state: 'OH',
    // Deduction defaults
    eld_fee_weekly: 35,
    insurance_monthly: 2000,
    trailer_payment_monthly: 600,
    dispatch_fee_pct: 4,
    office_authority_pct: 12,
    driver_pay_default_pct: 30,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    api.get('/settings').then(res => {
      if (res.data) setSettings(s => ({ ...s, ...res.data }));
    }).finally(() => setLoading(false));
  }, []);

  const sf = (k) => (e) => setSettings(p => ({ ...p, [k]: e.target.value }));
  const sfNum = (k) => (e) => setSettings(p => ({ ...p, [k]: parseFloat(e.target.value) || 0 }));
  const pf = (k) => (e) => setPwForm(p => ({ ...p, [k]: e.target.value }));

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await api.put('/settings', settings); toast.success('Settings saved successfully'); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed to save'); } finally { setSaving(false); }
  };

  const handlePwChange = async (e) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm_password) { toast.error('Passwords do not match'); return; }
    if (pwForm.new_password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setSavingPw(true);
    try {
      await api.put('/users/me/password', { current_password: pwForm.current_password, new_password: pwForm.new_password });
      toast.success('Password changed successfully');
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); } finally { setSavingPw(false); }
  };

  // Computed weekly values for display
  const insuranceWeekly = (parseFloat(settings.insurance_monthly) || 0) / 4;
  const trailerWeekly = (parseFloat(settings.trailer_payment_monthly) || 0) / 4;
  const eldYearly = (parseFloat(settings.eld_fee_weekly) || 0) * 52;

  if (loading) return <Spinner />;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <PageHeader
        title="Company Settings"
        subtitle="BHTL Logistics LLC — Configure deductions, company info, and account settings"
      />

      <form onSubmit={handleSave}>
        {/* ── DEDUCTION DEFAULTS ── */}
        {isAdmin && (
          <Section icon={<FaDollarSign />} title="Default Deduction Configuration">
            <div style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 10, padding: '10px 14px', marginBottom: 20, fontSize: 13 }}>
              <FaInfoCircle style={{ marginRight: 6, color: 'var(--brand-orange)' }} />
              These defaults are automatically applied when generating weekly reports.
              Monthly amounts are divided by 4 to get the weekly rate.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
              {/* Left Column — Fixed Deductions */}
              <div style={{ paddingRight: 24, borderRight: '1px solid var(--border-color)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 12 }}>FIXED DEDUCTIONS</div>

                <FieldRow
                  label="🛰 ELD Fee (Rock ELD)"
                  hint={`Weekly: $${(parseFloat(settings.eld_fee_weekly) || 0).toFixed(2)} | Yearly: $${eldYearly.toFixed(0)}`}
                >
                  <AmountInput value={settings.eld_fee_weekly} onChange={sfNum('eld_fee_weekly')} suffix="/wk" />
                </FieldRow>

                <FieldRow
                  label="🛡️ Insurance"
                  hint={`Weekly equivalent: $${insuranceWeekly.toFixed(2)}/wk (÷4)`}
                >
                  <AmountInput value={settings.insurance_monthly} onChange={sfNum('insurance_monthly')} suffix="/mo" />
                </FieldRow>

                <FieldRow
                  label="🚛 Trailer Payment"
                  hint={`Weekly equivalent: $${trailerWeekly.toFixed(2)}/wk (÷4)`}
                >
                  <AmountInput value={settings.trailer_payment_monthly} onChange={sfNum('trailer_payment_monthly')} suffix="/mo" />
                </FieldRow>
              </div>

              {/* Right Column — Percentage Deductions */}
              <div style={{ paddingLeft: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 12 }}>PERCENTAGE DEDUCTIONS</div>

                <FieldRow
                  label="📞 Dispatching Fee"
                  hint="Applied to gross revenue weekly"
                >
                  <AmountInput value={settings.dispatch_fee_pct} onChange={sfNum('dispatch_fee_pct')} prefix="" suffix="%" />
                </FieldRow>

                <FieldRow
                  label="🏢 Office / Authority Fee"
                  hint="Applied to gross revenue weekly"
                >
                  <AmountInput value={settings.office_authority_pct} onChange={sfNum('office_authority_pct')} prefix="" suffix="%" />
                </FieldRow>

                <FieldRow
                  label="👤 Default Driver Pay %"
                  hint="Used if driver has no specific pay % set"
                >
                  <AmountInput value={settings.driver_pay_default_pct} onChange={sfNum('driver_pay_default_pct')} prefix="" suffix="%" />
                </FieldRow>
              </div>
            </div>

            {/* Deduction Frequency Alert Info */}
            <div style={{ marginTop: 20, padding: '12px 16px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13, color: 'var(--warning)', marginBottom: 8 }}>
                <FaBell /> Deduction Frequency Rules
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                • <strong>ELD Fee ($35/wk)</strong>: Charged weekly — $140/month total<br />
                • <strong>Insurance ($2,000/mo)</strong>: Paid monthly; split as $500/week in reports<br />
                • <strong>Trailer Payment ($600/mo)</strong>: Monthly; split as $150/week in reports<br />
                • <strong>Dispatching (4%)</strong> &amp; <strong>Authority (12%)</strong>: Applied weekly to that week's revenue<br />
                • For <strong>twice-monthly</strong> deductions, go to <em>Deduction Templates</em> and set frequency to "Twice Monthly". An alert will warn you if the same deduction is applied twice in one week.
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
              <button type="submit" disabled={saving} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FaSave /> {saving ? 'Saving...' : 'Save Deduction Defaults'}
              </button>
            </div>
          </Section>
        )}

        {/* ── COMPANY INFORMATION ── */}
        {isAdmin && (
          <Section icon={<FaBuilding />} title="Company Information">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="form-group">
                <label className="form-label">Company Name</label>
                <input className="form-input" value={settings.company_name || ''} onChange={sf('company_name')} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">MC Number</label>
                  <input className="form-input" value={settings.mc_number || ''} onChange={sf('mc_number')} placeholder="MC-XXXXXX" />
                </div>
                <div className="form-group">
                  <label className="form-label">DOT Number</label>
                  <input className="form-input" value={settings.dot_number || ''} onChange={sf('dot_number')} placeholder="USDOT XXXXXXX" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Address</label>
                <input className="form-input" value={settings.address_line1 || ''} onChange={sf('address_line1')} placeholder="Street address" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
                <div className="form-group">
                  <label className="form-label">City</label>
                  <input className="form-input" value={settings.city || ''} onChange={sf('city')} />
                </div>
                <div className="form-group">
                  <label className="form-label">State</label>
                  <input className="form-input" maxLength={2} value={settings.state || ''} onChange={sf('state')} style={{ textTransform: 'uppercase' }} />
                </div>
                <div className="form-group">
                  <label className="form-label">ZIP</label>
                  <input className="form-input" value={settings.zip || ''} onChange={sf('zip')} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" value={settings.phone || ''} onChange={sf('phone')} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" value={settings.email || ''} onChange={sf('email')} />
              </div>
              <div className="form-group">
                <label className="form-label">IFTA License #</label>
                <input className="form-input" value={settings.ifta_license || ''} onChange={sf('ifta_license')} />
              </div>
              <div className="form-group">
                <label className="form-label">Base State</label>
                <select className="form-input" value={settings.base_state || 'OH'} onChange={sf('base_state')}>
                  {['OH', 'IN', 'KY', 'MI', 'PA', 'WV', 'TN', 'IL'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FaSave /> {saving ? 'Saving...' : 'Save Company Info'}
              </button>
            </div>
          </Section>
        )}
      </form>

      {/* ── CHANGE PASSWORD ── */}
      <Section icon={<FaKey />} title="Account & Security">
        <div style={{ marginBottom: 16, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8 }}>
          <div style={{ fontWeight: 600 }}>{user?.name || user?.full_name}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{user?.email} · <span style={{ color: 'var(--brand-orange)', textTransform: 'uppercase', fontWeight: 700 }}>{user?.role}</span></div>
        </div>
        <form onSubmit={handlePwChange}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <input type="password" className="form-input" value={pwForm.current_password} onChange={pf('current_password')} required />
            </div>
            <div className="form-group">
              <label className="form-label">New Password</label>
              <input type="password" className="form-input" value={pwForm.new_password} onChange={pf('new_password')} required minLength={8} />
            </div>
            <div className="form-group">
              <label className="form-label">Confirm Password</label>
              <input type="password" className="form-input" value={pwForm.confirm_password} onChange={pf('confirm_password')} required />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={savingPw} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FaKey /> {savingPw ? 'Updating...' : 'Change Password'}
            </button>
          </div>
        </form>

        <div style={{ marginTop: 20, padding: '12px 16px', background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)', borderRadius: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
          <FaInfoCircle style={{ marginRight: 6, color: 'var(--info)' }} />
          <strong>BHTL Logistics TMS</strong> — Internal Management System<br />
          Stack: React + Node/Express + PostgreSQL · All data stored securely.<br />
          <strong>Backups:</strong> Export P&L and data regularly via CSV/PDF exports.
        </div>
      </Section>
    </div>
  );
}
