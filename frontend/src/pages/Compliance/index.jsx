import { useState, useEffect } from 'react';
import api, { downloadFile } from '../../api/client';
import { Spinner, EmptyState, PageHeader, Modal, ExpirationBadge, formatDate, daysUntil } from '../../components/ui';
import toast from 'react-hot-toast';

const DOC_TYPES = ['CDL Copy','Medical Certificate','MVR','Employment Application','Road Test Certificate','Drug Test Result','Training Certificate','Insurance Certificate','IFTA License','IRP Cab Card','MC Authority','DOT Authority','Rate Confirmation','Bill of Lading (BOL)','Proof of Delivery (POD)','Contract','Other'];
const ENTITY_TYPES = ['company','driver','truck','trailer','load'];

export default function Compliance() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filters, setFilters] = useState({ entity_type: '', expiring_days: '' });
  const [form, setForm] = useState({ entity_type: 'company', entity_id: '', doc_type: 'Insurance Certificate', expiration_date: '', notes: '', file: null });
  const [drivers, setDrivers] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [trailers, setTrailers] = useState([]);
  const [editingDoc, setEditingDoc] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showEditModal, setShowEditModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([,v]) => v));
      const [docsRes, drRes, trRes, traRes] = await Promise.all([
        api.get('/documents', { params }),
        api.get('/drivers', { params: { active: true } }),
        api.get('/trucks'),
        api.get('/trailers'),
      ]);
      setDocs(docsRes.data);
      setDrivers(drRes.data);
      setTrucks(trRes.data);
      setTrailers(traRes.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filters]);

  const handleUpload = async (e) => {
    e.preventDefault();
    setUploading(true);
    const fd = new FormData();
    fd.append('entity_type', form.entity_type);
    if (form.entity_id) fd.append('entity_id', form.entity_id);
    fd.append('doc_type', form.doc_type);
    if (form.expiration_date) fd.append('expiration_date', form.expiration_date);
    if (form.notes) fd.append('notes', form.notes);
    if (form.file) fd.append('file', form.file);
    try {
      await api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Document saved');
      setShowModal(false);
      setForm({ entity_type: 'company', entity_id: '', doc_type: 'Insurance Certificate', expiration_date: '', notes: '', file: null });
      load();
    } catch (err) { toast.error(err.response?.data?.error || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this document?')) return;
    try { await api.delete(`/documents/${id}`); toast.success('Deleted'); load(); }
    catch { toast.error('Failed'); }
  };

  const openEdit = (doc) => {
    setEditingDoc(doc);
    setEditForm({ doc_type: doc.doc_type, expiration_date: doc.expiration_date?.split('T')[0]||'', notes: doc.notes||'' });
    setShowEditModal(true);
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    try { await api.put(`/documents/${editingDoc.id}`, editForm); toast.success('Updated'); setShowEditModal(false); load(); }
    catch { toast.error('Failed'); }
  };

  const getEntityOptions = () => {
    if (form.entity_type === 'driver') return drivers.map(d => ({ id: d.id, label: `${d.first_name} ${d.last_name}` }));
    if (form.entity_type === 'truck') return trucks.map(t => ({ id: t.id, label: `#${t.unit_number}` }));
    if (form.entity_type === 'trailer') return trailers.map(t => ({ id: t.id, label: `#${t.unit_number}` }));
    return [];
  };

  const expiringCount = docs.filter(d => d.expiration_date && daysUntil(d.expiration_date) <= 30).length;
  const expiredCount = docs.filter(d => d.expiration_date && daysUntil(d.expiration_date) < 0).length;

  return (
    <div>
      <PageHeader title="Documents & Compliance"
        subtitle={`${docs.length} documents${expiringCount > 0 ? ` — ${expiringCount} expiring within 30 days` : ''}`}
        actions={<button className="btn btn-primary" onClick={() => setShowModal(true)}>+ Upload Document</button>}
      />

      {(expiredCount > 0 || expiringCount > 0) && (
        <div className="alert alert-danger mb-16">
          🚨 <strong>{expiredCount} expired</strong> · <strong>{expiringCount} expiring within 30 days</strong> — review below
        </div>
      )}

      <div className="filter-bar mb-16">
        <select className="filter-select" value={filters.entity_type} onChange={e => setFilters(f => ({ ...f, entity_type: e.target.value }))}>
          <option value="">All Entity Types</option>
          {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="filter-select" value={filters.expiring_days} onChange={e => setFilters(f => ({ ...f, expiring_days: e.target.value }))}>
          <option value="">All Documents</option>
          <option value="30">Expiring within 30 days</option>
          <option value="60">Expiring within 60 days</option>
          <option value="90">Expiring within 90 days</option>
        </select>
        <button className="btn btn-secondary btn-sm" onClick={() => setFilters({ entity_type:'', expiring_days:'' })}>Clear</button>
      </div>

      {loading ? <Spinner /> : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Type</th><th>Document</th><th>Entity</th><th>Expiration</th><th>Status</th><th>Uploaded</th><th>Actions</th></tr></thead>
              <tbody>
                {docs.length === 0 ? <tr><td colSpan={7}><EmptyState icon="📋" title="No documents" description="Upload your first document." /></td></tr>
                  : docs.map(doc => {
                  const days = daysUntil(doc.expiration_date);
                  const status = !doc.expiration_date ? 'no-exp' : days < 0 ? 'expired' : days <= 30 ? 'danger' : days <= 90 ? 'warning' : 'ok';
                  return (
                    <tr key={doc.id}>
                      <td><span style={{ fontSize:'11px', textTransform:'uppercase', fontWeight:700, color:'var(--text-muted)' }}>{doc.entity_type}</span></td>
                      <td style={{ fontWeight:600 }}>{doc.doc_type}</td>
                      <td className="muted">{doc.entity_id || 'Company'}</td>
                      <td><ExpirationBadge date={doc.expiration_date} label={doc.doc_type} /></td>
                      <td>
                        {status === 'no-exp' ? <span className="badge badge-active">No Expiry</span>
                          : status === 'expired' ? <span className="badge badge-cancelled">EXPIRED</span>
                          : status === 'danger' ? <span className="badge badge-overdue">Expiring Soon</span>
                          : status === 'warning' ? <span className="badge badge-invoiced">Within 90d</span>
                          : <span className="badge badge-paid">Valid</span>}
                      </td>
                      <td className="muted">{formatDate(doc.created_at)}</td>
                      <td>
                        <div className="flex gap-8">
                          {doc.file_name && (
                            <button className="btn btn-secondary btn-sm" onClick={() => downloadFile(`/documents/${doc.id}/download`, doc.file_name || 'document')}>⬇</button>
                          )}
                          <button className="btn btn-ghost btn-sm" onClick={() => openEdit(doc)}>✏️</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(doc.id)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showModal && (
        <Modal title="Upload / Record Document" onClose={() => setShowModal(false)}
          footer={<><button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleUpload} disabled={uploading}>{uploading ? 'Uploading...' : 'Save Document'}</button></>}
        >
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
            <div className="form-group"><label className="form-label">Entity Type</label>
              <select className="form-control" value={form.entity_type} onChange={e => setForm(f => ({ ...f, entity_type: e.target.value, entity_id: '' }))}>
                {ENTITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            {form.entity_type !== 'company' && (
              <div className="form-group"><label className="form-label">{form.entity_type.charAt(0).toUpperCase() + form.entity_type.slice(1)}</label>
                <select className="form-control" value={form.entity_id} onChange={e => setForm(f => ({ ...f, entity_id: e.target.value }))}>
                  <option value="">Select...</option>
                  {getEntityOptions().map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            )}
            <div className="form-group" style={{ gridColumn: form.entity_type === 'company' ? '1/-1' : '' }}>
              <label className="form-label">Document Type *</label>
              <select className="form-control" value={form.doc_type} onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))}>
                {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Expiration Date</label>
              <input type="date" className="form-control" value={form.expiration_date} onChange={e => setForm(f => ({ ...f, expiration_date: e.target.value }))} />
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">File (PDF, JPG, PNG)</label>
              <input type="file" className="form-control" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setForm(f => ({ ...f, file: e.target.files[0] }))} />
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">Notes</label>
              <textarea className="form-control" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Modal */}
      {showEditModal && editingDoc && (
        <Modal title="Edit Document" onClose={() => setShowEditModal(false)}
          footer={<><button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveEdit}>Update</button></>}
        >
          <div className="form-group"><label className="form-label">Document Type</label>
            <select className="form-control" value={editForm.doc_type} onChange={e => setEditForm(f => ({ ...f, doc_type: e.target.value }))}>
              {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group"><label className="form-label">Expiration Date</label>
            <input type="date" className="form-control" value={editForm.expiration_date} onChange={e => setEditForm(f => ({ ...f, expiration_date: e.target.value }))} />
          </div>
          <div className="form-group"><label className="form-label">Notes</label>
            <textarea className="form-control" value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
        </Modal>
      )}
    </div>
  );
}
