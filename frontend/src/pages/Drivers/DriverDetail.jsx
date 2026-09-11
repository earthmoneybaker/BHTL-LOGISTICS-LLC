import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api, { downloadFile } from '../../api/client';
import { Spinner, ExpirationBadge, StatusBadge, formatCurrency, formatDate } from '../../components/ui';
import toast from 'react-hot-toast';

export default function DriverDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('profile');
  const [uploading, setUploading] = useState(false);
  const [docForm, setDocForm] = useState({ doc_type: 'CDL Copy', file: null, expiration_date: '' });
  const [docs, setDocs] = useState([]);

  const reload = async () => {
    try {
      const [driverRes, docsRes] = await Promise.all([
        api.get(`/drivers/${id}`),
        api.get('/documents', { params: { entity_type: 'driver', entity_id: id } }),
      ]);
      setData(driverRes.data);
      setDocs(docsRes.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { reload(); }, [id]);

  const toggleDqItem = async (item) => {
    try {
      await api.put(`/drivers/${id}/dq/${item.id}`, {
        is_complete: !item.is_complete,
        completed_date: !item.is_complete ? new Date().toISOString().split('T')[0] : null,
        expiration_date: item.expiration_date,
        notes: item.notes,
      });
      reload();
    } catch { toast.error('Failed to update'); }
  };

  const handleDocUpload = async (e) => {
    e.preventDefault();
    if (!docForm.file) { toast.error('Select a file'); return; }
    setUploading(true);
    const fd = new FormData();
    fd.append('file', docForm.file);
    fd.append('entity_type', 'driver');
    fd.append('entity_id', id);
    fd.append('doc_type', docForm.doc_type);
    if (docForm.expiration_date) fd.append('expiration_date', docForm.expiration_date);
    try {
      await api.post('/documents', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Document uploaded');
      setDocForm({ doc_type: 'CDL Copy', file: null, expiration_date: '' });
      reload();
    } catch (err) { toast.error(err.response?.data?.error || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const deleteDoc = async (docId) => {
    try { await api.delete(`/documents/${docId}`); toast.success('Deleted'); reload(); }
    catch { toast.error('Failed'); }
  };

  if (loading) return <Spinner />;
  if (!data) return null;
  const { driver, dq_items, loads } = data;

  const dqComplete = dq_items.filter(i => i.is_complete).length;
  const dqTotal = dq_items.length;
  const dqPct = dqTotal > 0 ? Math.round((dqComplete / dqTotal) * 100) : 0;

  return (
    <div>
      <div className="page-header">
        <div>
          <div style={{ marginBottom: '4px' }}><Link to="/drivers" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '13px' }}>← Drivers</Link></div>
          <h1 className="page-title">{driver.first_name} {driver.last_name}</h1>
          <div className="page-subtitle">CDL {driver.cdl_class} — {driver.pay_type?.replace(/_/g,' ')} @ {driver.pay_type === 'percentage' ? `${driver.pay_rate}%` : `$${driver.pay_rate}`}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>DQ File Completion</div>
          <div style={{ fontSize: '24px', fontWeight: 800, color: dqPct === 100 ? 'var(--success)' : dqPct >= 70 ? 'var(--warning)' : 'var(--danger)' }}>{dqPct}%</div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{dqComplete}/{dqTotal} items</div>
        </div>
      </div>

      <div className="tabs">
        {['profile','dq-file','loads','documents','payroll'].map(t => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'profile' ? '👤 Profile' : t === 'dq-file' ? `📋 DQ File (${dqComplete}/${dqTotal})` : t === 'loads' ? `📦 Loads (${loads.length})` : t === 'documents' ? `📄 Docs (${docs.length})` : '💵 Payroll'}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="grid-2">
          <div className="card">
            <div className="detail-section-title">Personal Info</div>
            {[['Full Name', `${driver.first_name} ${driver.last_name}`], ['Phone', driver.phone], ['Email', driver.email],
              ['Address', [driver.address_line1, driver.city, driver.state].filter(Boolean).join(', ')],
              ['Hire Date', formatDate(driver.hire_date)],
            ].map(([l,v]) => <div key={l} className="detail-field"><div className="detail-field-label">{l}</div><div className="detail-field-value">{v || '—'}</div></div>)}
          </div>
          <div className="card">
            <div className="detail-section-title">CDL & Compliance</div>
            {[['CDL Number', driver.cdl_number], ['CDL Class', `Class ${driver.cdl_class}`], ['Endorsements', driver.cdl_endorsements]].map(([l,v]) =>
              <div key={l} className="detail-field"><div className="detail-field-label">{l}</div><div className="detail-field-value">{v || '—'}</div></div>
            )}
            <div className="detail-field">
              <div className="detail-field-label">CDL Expiration</div>
              <div className="detail-field-value"><ExpirationBadge date={driver.cdl_expiration} label="CDL" /></div>
            </div>
            <div className="detail-field">
              <div className="detail-field-label">Medical Card Expiration</div>
              <div className="detail-field-value"><ExpirationBadge date={driver.medical_card_expiration} label="Medical Card" /></div>
            </div>
            <div className="detail-field"><div className="detail-field-label">Clearinghouse Status</div><div className="detail-field-value">{driver.clearinghouse_status || '—'}</div></div>
          </div>
        </div>
      )}

      {tab === 'dq-file' && (
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Driver Qualification File</div>
              <div className="card-subtitle">FMCSA 49 CFR Part 391 requirements</div>
            </div>
            <div>
              <div style={{ height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', width: '160px' }}>
                <div style={{ height: '100%', borderRadius: '3px', background: dqPct === 100 ? 'var(--success)' : dqPct >= 70 ? 'var(--warning)' : 'var(--danger)', width: `${dqPct}%`, transition: 'width 0.4s ease' }} />
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>{dqComplete}/{dqTotal} complete</div>
            </div>
          </div>
          {dq_items.map(item => (
            <div key={item.id} className="checklist-item">
              <div className={`checklist-check ${item.is_complete ? 'checked' : ''}`} onClick={() => toggleDqItem(item)}>
                {item.is_complete && '✓'}
              </div>
              <div style={{ flex: 1 }}>
                <div className={`checklist-label ${item.is_complete ? 'done' : ''}`}>{item.item_name}</div>
                {item.completed_date && <div className="checklist-date">Completed: {formatDate(item.completed_date)}</div>}
              </div>
              {item.expiration_date && (
                <ExpirationBadge date={item.expiration_date} label={item.item_name} />
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'loads' && (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrapper">
            <table className="data-table">
              <thead><tr><th>Load #</th><th>Customer</th><th>Route</th><th>Pickup</th><th>Miles</th><th>Rate</th><th>Status</th></tr></thead>
              <tbody>
                {loads.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign:'center', padding:'24px', color:'var(--text-muted)' }}>No loads assigned</td></tr>
                ) : loads.map(l => (
                  <tr key={l.id}>
                    <td className="mono"><Link to={`/loads/${l.id}`} style={{ color:'var(--brand-blue-light)', textDecoration:'none' }}>{l.load_number}</Link></td>
                    <td>{l.customer_name}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{l.origin_city}, {l.origin_state} → {l.destination_city}, {l.destination_state}</td>
                    <td className="muted">{formatDate(l.pickup_date)}</td>
                    <td className="muted">{l.miles || '—'}</td>
                    <td style={{ fontWeight: 600 }}>{formatCurrency(l.rate)}</td>
                    <td><StatusBadge status={l.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'documents' && (
        <div>
          <div className="card mb-16">
            <div className="card-title mb-16">Upload Document</div>
            <form onSubmit={handleDocUpload} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Document Type</label>
                <select className="form-control" value={docForm.doc_type} onChange={e => setDocForm(f => ({ ...f, doc_type: e.target.value }))}>
                  {['CDL Copy', 'Medical Certificate', 'MVR', 'Employment Application', 'Road Test Certificate', 'Drug Test Result', 'Training Certificate', 'Other'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Expiration Date</label>
                <input type="date" className="form-control" value={docForm.expiration_date} onChange={e => setDocForm(f => ({ ...f, expiration_date: e.target.value }))} />
              </div>
              <div className="form-group" style={{ margin: 0, flex: 1 }}>
                <label className="form-label">File</label>
                <input type="file" className="form-control" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setDocForm(f => ({ ...f, file: e.target.files[0] }))} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={uploading}>{uploading ? 'Uploading...' : '⬆ Upload'}</button>
            </form>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead><tr><th>Type</th><th>File</th><th>Expiration</th><th>Uploaded</th><th>Actions</th></tr></thead>
                <tbody>
                  {docs.length === 0 ? <tr><td colSpan={5} style={{ textAlign:'center', padding:'24px', color:'var(--text-muted)' }}>No documents</td></tr>
                    : docs.map(doc => (
                    <tr key={doc.id}>
                      <td><span className="badge badge-invoiced">{doc.doc_type}</span></td>
                      <td>{doc.file_name}</td>
                      <td><ExpirationBadge date={doc.expiration_date} label={doc.doc_type} /></td>
                      <td className="muted">{formatDate(doc.created_at)}</td>
                      <td>
                        <div className="flex gap-8">
                          <button className="btn btn-secondary btn-sm" onClick={() => downloadFile(`/documents/${doc.id}/download`, doc.file_name || 'document')}>⬇ Download</button>
                          <button className="btn btn-danger btn-sm" onClick={() => deleteDoc(doc.id)}>🗑</button>
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

      {tab === 'payroll' && (
        <PayrollHistory driverId={id} />
      )}
    </div>
  );
}

function PayrollHistory({ driverId }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/drivers/${driverId}/payroll`)
      .then(res => setRecords(res.data))
      .finally(() => setLoading(false));
  }, [driverId]);

  if (loading) return <Spinner />;

  return (
    <div className="card" style={{ padding: 0 }}>
      <div className="table-wrapper">
        <table className="data-table">
          <thead><tr><th>Period</th><th>Pay Type</th><th>Gross Pay</th><th>Deductions</th><th>Net Pay</th><th>Status</th></tr></thead>
          <tbody>
            {records.length === 0 ? <tr><td colSpan={6} style={{ textAlign:'center', padding:'24px', color:'var(--text-muted)' }}>No payroll records</td></tr>
              : records.map(r => (
              <tr key={r.id}>
                <td className="muted">{formatDate(r.period_start)} – {formatDate(r.period_end)}</td>
                <td className="muted">{r.pay_type?.replace(/_/g,' ')}</td>
                <td style={{ fontWeight:600 }}>{formatCurrency(r.gross_pay)}</td>
                <td style={{ color:'var(--danger)' }}>({formatCurrency(r.deductions)})</td>
                <td style={{ fontWeight:700, color:'var(--success)' }}>{formatCurrency(r.net_pay)}</td>
                <td><span className={`badge badge-${r.status}`}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
