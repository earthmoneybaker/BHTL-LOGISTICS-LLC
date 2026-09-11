import { useState, useEffect } from 'react';
import api from '../../api/client';
import { Spinner, EmptyState, PageHeader, Modal, ConfirmModal } from '../../components/ui';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [form, setForm] = useState({ email:'', full_name:'', role:'staff', password:'', is_active:true });

  const load = async () => {
    setLoading(true);
    try { const res = await api.get('/users'); setUsers(res.data); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm({ email:'', full_name:'', role:'staff', password:'', is_active:true }); setShowModal(true); };
  const openEdit = (u) => { setEditing(u); setForm({ email:u.email, full_name:u.full_name, role:u.role, password:'', is_active:u.is_active }); setShowModal(true); };

  const handleSave = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const payload = { ...form };
      if (!payload.password) delete payload.password;
      if (editing) { await api.put(`/users/${editing.id}`, payload); toast.success('User updated'); }
      else {
        if (!form.password) { toast.error('Password is required for new users'); setSaving(false); return; }
        await api.post('/users', payload); toast.success('User created');
      }
      setShowModal(false); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try { await api.delete(`/users/${deleteTarget.id}`); toast.success('User deactivated'); setDeleteTarget(null); load(); }
    catch (err) { toast.error(err.response?.data?.error || 'Failed'); }
  };

  const f = (k) => (e) => setForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div>
      <PageHeader title="User Management"
        subtitle="Admin-only: manage office staff accounts and access levels"
        actions={<button className="btn btn-primary" onClick={openCreate}>+ Add User</button>}
      />

      {loading ? <Spinner /> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {users.length === 0 ? <tr><td colSpan={6}><EmptyState icon="👥" title="No users" /></td></tr>
                  : users.map(u => (
                  <tr key={u.id}>
                    <td style={{ fontWeight:600 }}>{u.full_name} {u.id === me?.id ? <span style={{ fontSize:'10px', color:'var(--brand-orange)', fontWeight:700 }}>(you)</span> : ''}</td>
                    <td className="muted">{u.email}</td>
                    <td>
                      <span className={`badge ${u.role === 'admin' ? 'badge-paid' : 'badge-invoiced'}`}>
                        {u.role === 'admin' ? '👑 Admin' : '👤 Staff'}
                      </span>
                    </td>
                    <td><span className={`badge ${u.is_active ? 'badge-active' : 'badge-inactive'}`}>{u.is_active ? 'Active' : 'Inactive'}</span></td>
                    <td className="muted">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td>
                      <div className="flex gap-8">
                        <button className="btn btn-ghost btn-sm" onClick={() => openEdit(u)}>✏️ Edit</button>
                        {u.id !== me?.id && (
                          <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(u)}>Deactivate</button>
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

      {showModal && (
        <Modal title={editing ? `Edit User — ${editing.full_name}` : 'Add User'} onClose={() => setShowModal(false)}
          footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update' : 'Create User'}</button></>}
        >
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
            <div className="form-group"><label className="form-label">Full Name *</label><input className="form-control" value={form.full_name} onChange={f('full_name')} required /></div>
            <div className="form-group"><label className="form-label">Email *</label><input type="email" className="form-control" value={form.email} onChange={f('email')} required /></div>
            <div className="form-group"><label className="form-label">Role</label>
              <select className="form-control" value={form.role} onChange={f('role')}>
                <option value="staff">Office Staff</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="form-group"><label className="form-label">{editing ? 'New Password (leave blank to keep)' : 'Password *'}</label>
              <input type="password" className="form-control" value={form.password} onChange={f('password')} required={!editing} placeholder={editing ? 'Leave blank to keep current' : ''} />
            </div>
            {editing && (
              <div className="form-group" style={{ display:'flex', alignItems:'center', gap:'10px', paddingTop:'24px' }}>
                <input type="checkbox" id="is_active" checked={form.is_active} onChange={f('is_active')} style={{ width:'18px', height:'18px' }} />
                <label htmlFor="is_active" style={{ color:'var(--text-secondary)', fontSize:'14px' }}>Active</label>
              </div>
            )}
          </div>
          <div className="alert alert-info mt-16">
            <div>
              <strong>Role permissions:</strong><br/>
              • <strong>Admin:</strong> Full access including financial reports, P&L, and user management<br/>
              • <strong>Office Staff:</strong> Operations only — no P&L, no user management
            </div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal title="Deactivate User" message={`Deactivate ${deleteTarget.full_name}? They will no longer be able to log in.`}
          onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
