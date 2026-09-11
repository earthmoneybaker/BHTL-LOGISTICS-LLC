import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Spinner, PageHeader } from '../../components/ui';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

export default function Settings() {
  const { user, isAdmin } = useAuth();
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [savingPw, setSavingPw] = useState(false);

  useEffect(() => {
    api.get('/settings').then(res => setSettings(res.data)).finally(() => setLoading(false));
  }, []);

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try { await api.put('/settings', settings); toast.success('Settings saved'); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); } finally { setSaving(false); }
  };

  const handlePwChange = async (e) => {
    e.preventDefault();
    if (pwForm.new_password !== pwForm.confirm_password) { toast.error('Passwords do not match'); return; }
    if (pwForm.new_password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setSavingPw(true);
    try { await api.put('/users/me/password', { current_password: pwForm.current_password, new_password: pwForm.new_password }); toast.success('Password changed successfully'); setPwForm({ current_password:'', new_password:'', confirm_password:'' }); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); } finally { setSavingPw(false); }
  };

  const sf = (k) => (e) => setSettings(p => ({ ...p, [k]: e.target.value }));
  const pf = (k) => (e) => setPwForm(p => ({ ...p, [k]: e.target.value }));

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader title="Company Settings" subtitle="BHTL Logistics LLC — office configuration" />

      <div className="grid-2">
        {/* Company Info */}
        {isAdmin && (
          <div className="card">
            <div className="detail-section-title">Company Information</div>
            <form onSubmit={handleSave}>
              <div className="form-group"><label className="form-label">Company Name</label><input className="form-control" value={settings.company_name||''} onChange={sf('company_name')} /></div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                <div className="form-group"><label className="form-label">MC Number</label><input className="form-control" value={settings.mc_number||''} onChange={sf('mc_number')} placeholder="MC-XXXXXX" /></div>
                <div className="form-group"><label className="form-label">DOT Number</label><input className="form-control" value={settings.dot_number||''} onChange={sf('dot_number')} placeholder="USDOT XXXXXXX" /></div>
              </div>
              <div className="form-group"><label className="form-label">IFTA License #</label><input className="form-control" value={settings.ifta_license||''} onChange={sf('ifta_license')} /></div>
              <div className="form-group"><label className="form-label">Base State</label>
                <select className="form-control" value={settings.base_state||'OH'} onChange={sf('base_state')}>
                  {['OH','IN','KY','MI','PA','WV','TN','IL'].map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">Address</label><input className="form-control" value={settings.address_line1||''} onChange={sf('address_line1')} /></div>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:'8px' }}>
                <div className="form-group"><label className="form-label">City</label><input className="form-control" value={settings.city||''} onChange={sf('city')} /></div>
                <div className="form-group"><label className="form-label">State</label><input className="form-control" maxLength={2} value={settings.state||''} onChange={sf('state')} style={{ textTransform:'uppercase' }} /></div>
                <div className="form-group"><label className="form-label">ZIP</label><input className="form-control" value={settings.zip||''} onChange={sf('zip')} /></div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
                <div className="form-group"><label className="form-label">Phone</label><input className="form-control" value={settings.phone||''} onChange={sf('phone')} /></div>
                <div className="form-group"><label className="form-label">Email</label><input type="email" className="form-control" value={settings.email||''} onChange={sf('email')} /></div>
              </div>
              <button type="submit" className="btn btn-primary w-full" disabled={saving}>{saving ? 'Saving...' : 'Save Company Info'}</button>
            </form>
          </div>
        )}

        {/* Password Change */}
        <div className="card">
          <div className="detail-section-title">Change Password</div>
          <div className="detail-field mb-16">
            <div className="detail-field-label">Signed in as</div>
            <div className="detail-field-value">{user?.name || user?.full_name}</div>
            <div style={{ fontSize:'12px', color:'var(--text-muted)' }}>{user?.email} · {user?.role}</div>
          </div>
          <form onSubmit={handlePwChange}>
            <div className="form-group"><label className="form-label">Current Password</label><input type="password" className="form-control" value={pwForm.current_password} onChange={pf('current_password')} required /></div>
            <div className="form-group"><label className="form-label">New Password</label><input type="password" className="form-control" value={pwForm.new_password} onChange={pf('new_password')} required minLength={8} /></div>
            <div className="form-group"><label className="form-label">Confirm New Password</label><input type="password" className="form-control" value={pwForm.confirm_password} onChange={pf('confirm_password')} required /></div>
            <button type="submit" className="btn btn-primary w-full" disabled={savingPw}>{savingPw ? 'Updating...' : 'Change Password'}</button>
          </form>

          <div className="divider" />
          <div className="detail-section-title">System Info</div>
          <div className="alert alert-info" style={{ fontSize:'12px' }}>
            <div>
              <strong>BHTL Logistics TMS</strong> — Internal Management System<br/>
              Stack: React + Node/Express + PostgreSQL<br/>
              All data stored locally. No external paid services in use.<br/>
              <strong>Backups:</strong> Export P&L and data regularly via CSV/PDF exports.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
