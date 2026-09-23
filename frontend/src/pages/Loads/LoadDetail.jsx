import { FaTractor, FaTrash, FaTruck, FaExclamationTriangle, FaClipboardList, FaFileAlt, FaCreditCard, FaMapMarkerAlt, FaFlagCheckered, FaUser } from 'react-icons/fa';
import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api, { downloadFile } from '../../api/client';
import { StatusBadge, Spinner, Modal, formatCurrency, formatDate, ConfirmModal } from '../../components/ui';
import toast from 'react-hot-toast';

const STATUS_ORDER = ['booked','dispatched','in_transit','delivered','invoiced','paid'];

export default function LoadDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('details');
  const [uploading, setUploading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fileInput, setFileInput] = useState({ doc_type: 'Rate Confirmation', file: null });

  const reload = async () => {
    try {
      const res = await api.get(`/loads/${id}`);
      setData(res.data);
    } catch { navigate('/loads'); }
    finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, [id]);

  const handleStatusChange = async (status) => {
    try {
      const res = await api.patch(`/loads/${id}/status`, { status });
      setData(d => ({ ...d, load: { ...d.load, status } }));
      if (status === 'paid') {
        if (res.data.invoiceCreated) toast.success('Marked paid — added to revenue');
        else if (res.data.hasInvoice) toast.success('Marked paid');
        else toast('Marked paid, but no customer/rate set — revenue not recorded. Edit the load to add them.', { icon: <FaExclamationTriangle /> });
      } else {
        toast.success(`Status → ${status}`);
      }
      reload();
    } catch { toast.error('Failed to update status'); }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!fileInput.file) { toast.error('Select a file first'); return; }
    setUploading(true);
    const fd = new FormData();
    fd.append('file', fileInput.file);
    fd.append('entity_type', 'load');
    fd.append('entity_id', id);
    fd.append('doc_type', fileInput.doc_type);
    try {
      await api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Document uploaded');
      setFileInput({ doc_type: 'Rate Confirmation', file: null });
      reload();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed');
    } finally { setUploading(false); }
  };

  const handleDeleteDoc = async (docId) => {
    try {
      await api.delete(`/documents/${docId}`);
      toast.success('Document deleted');
      reload();
    } catch { toast.error('Failed to delete'); }
  };

  const handleCancel = async () => {
    try {
      await api.delete(`/loads/${id}`);
      toast.success('Load cancelled');
      navigate('/loads');
    } catch { toast.error('Failed to cancel'); }
  };

  if (loading) return <Spinner />;
  if (!data) return null;
  const { load, documents, expenses } = data;

  const currentStepIdx = STATUS_ORDER.indexOf(load.status);

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <Link to="/loads" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '13px' }}>← Loads</Link>
          </div>
          <h1 className="page-title">Load {load.load_number}</h1>
          <div className="page-subtitle">{load.customer_name}</div>
        </div>
        <div className="flex gap-8 flex-wrap">
          {load.invoice_number && (
            <span className="badge badge-invoiced">Invoice: {load.invoice_number}</span>
          )}
          <button className="btn btn-danger btn-sm" onClick={() => setShowDeleteConfirm(true)}>Cancel Load</button>
        </div>
      </div>

      {/* Status Pipeline */}
      <div className="card mb-20" style={{ padding: '16px 20px' }}>
        <div className="pipeline">
          {STATUS_ORDER.map((s, i) => (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                className={`pipeline-step ${i < currentStepIdx ? 'done' : i === currentStepIdx ? 'active' : ''}`}
                onClick={() => handleStatusChange(s)}
                style={{ cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}
              >
                {i < currentStepIdx ? <FaCheck /> : ''}{s.replace(/_/g,' ')}
              </button>
              {i < STATUS_ORDER.length - 1 && <span className="pipeline-arrow">›</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        {['details', 'documents', 'expenses'].map(t => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'details' ? '<FaClipboardList /> Details' : t === 'documents' ? `<FaFileAlt /> Documents (${documents.length})` : `<FaCreditCard /> Expenses (${expenses.length})`}
          </button>
        ))}
      </div>

      {tab === 'details' && (
        <div className="grid-2">
          <div className="card">
            <div className="detail-section-title">Load Information</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                ['Load #', load.load_number], ['Customer', load.customer_name],
                ['Commodity', load.commodity], ['Weight', load.weight ? `${load.weight} lbs` : '—'],
                ['Miles', load.miles || '—'], ['Rate', formatCurrency(load.rate)],
                ['PO #', load.po_number || '—'], ['BOL #', load.bol_number || '—'],
              ].map(([l, v]) => (
                <div key={l} className="detail-field">
                  <div className="detail-field-label">{l}</div>
                  <div className="detail-field-value">{v || '—'}</div>
                </div>
              ))}
            </div>

            <div className="divider" />
            <div className="detail-section-title">Route</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div className="detail-field">
                <div className="detail-field-label"><FaMapMarkerAlt /> Origin</div>
                <div className="detail-field-value">{[load.origin_address, load.origin_city, load.origin_state].filter(Boolean).join(', ')}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Pickup: {formatDate(load.pickup_date)} {load.pickup_time}</div>
              </div>
              <div className="detail-field">
                <div className="detail-field-label"><FaFlagCheckered /> Destination</div>
                <div className="detail-field-value">{[load.destination_address, load.destination_city, load.destination_state].filter(Boolean).join(', ')}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Delivery: {formatDate(load.delivery_date)} {load.delivery_time}</div>
              </div>
            </div>
          </div>

          <div>
            <div className="card mb-16">
              <div className="detail-section-title">Assignment</div>
              {[
                ['<FaTruck /> Truck', load.truck_unit || '—'],
                ['<FaTractor /> Trailer', load.trailer_unit || '—'],
                ['<FaUser /> Driver', load.driver_first ? `${load.driver_first} ${load.driver_last}` : '—'],
                ['📞 Driver Phone', load.driver_phone || '—'],
              ].map(([l, v]) => (
                <div key={l} className="detail-field">
                  <div className="detail-field-label">{l}</div>
                  <div className="detail-field-value">{v}</div>
                </div>
              ))}
            </div>

            {load.notes && (
              <div className="card">
                <div className="detail-section-title">Notes</div>
                <p style={{ fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{load.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div>
          {/* Upload Form */}
          <div className="card mb-16">
            <div className="card-title mb-16">Upload Document</div>
            <form onSubmit={handleUpload} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Document Type</label>
                <select className="form-control" value={fileInput.doc_type} onChange={e => setFileInput(f => ({ ...f, doc_type: e.target.value }))}>
                  {['Rate Confirmation', 'Bill of Lading (BOL)', 'Proof of Delivery (POD)', 'Lumper Receipt', 'Scale Ticket', 'Other'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0, flex: 1 }}>
                <label className="form-label">File</label>
                <input type="file" className="form-control" accept=".pdf,.jpg,.jpeg,.png,.docx"
                  onChange={e => setFileInput(f => ({ ...f, file: e.target.files[0] }))} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={uploading}>
                {uploading ? 'Uploading...' : '⬆ Upload'}
              </button>
            </form>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Type</th><th>File Name</th><th>Uploaded</th><th>Actions</th></tr></thead>
                <tbody>
                  {documents.length === 0 ? (
                    <tr><td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No documents uploaded yet</td></tr>
                  ) : documents.map(doc => (
                    <tr key={doc.id}>
                      <td><span className="badge badge-invoiced">{doc.doc_type}</span></td>
                      <td>{doc.file_name || '—'}</td>
                      <td className="muted">{formatDate(doc.created_at)}</td>
                      <td>
                        <div className="flex gap-8">
                          <button className="btn btn-secondary btn-sm" onClick={() => downloadFile(`/documents/${doc.id}/download`, doc.file_name || 'document')}>⬇ Download</button>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDeleteDoc(doc.id)}><FaTrash /></button>
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

      {tab === 'expenses' && (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="card-title">Load Expenses</div>
            <div style={{ fontWeight: 700, color: 'var(--danger)' }}>
              Total: {formatCurrency(expenses.reduce((a, e) => a + parseFloat(e.amount), 0))}
            </div>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Category</th><th>Description</th><th>Vendor</th><th>Date</th><th>Amount</th></tr></thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>No expenses for this load</td></tr>
                ) : expenses.map(exp => (
                  <tr key={exp.id}>
                    <td><span className="badge badge-invoiced">{exp.category}</span></td>
                    <td>{exp.description || '—'}</td>
                    <td className="muted">{exp.vendor || '—'}</td>
                    <td className="muted">{formatDate(exp.expense_date)}</td>
                    <td style={{ color: 'var(--danger)', fontWeight: 600 }}>{formatCurrency(exp.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <ConfirmModal title="Cancel Load" message={`Cancel load ${load.load_number}? This cannot be undone.`}
          onConfirm={handleCancel} onCancel={() => setShowDeleteConfirm(false)} />
      )}
    </div>
  );
}
