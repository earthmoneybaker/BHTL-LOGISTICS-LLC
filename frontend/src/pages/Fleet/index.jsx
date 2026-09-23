import { FaTractor, FaTrash, FaWrench, FaTruck, FaCheck, FaEdit } from 'react-icons/fa';
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { Spinner, EmptyState, PageHeader, Modal, formatDate, ExpirationBadge, ConfirmModal } from '../../components/ui';
import toast from 'react-hot-toast';

const defaultTruck = {
  unit_number: '', vin: '', plate_number: '', plate_state: 'OH', year: '', make: '', model: '',
  registration_expiration: '', irp_status: '', irp_expiration: '', current_mileage: '',
  assigned_driver_id: '', status: 'active', notes: '',
};

const defaultTrailer = {
  unit_number: '', vin: '', plate_number: '', plate_state: 'OH', trailer_type: 'Dry Van',
  year: '', make: '', registration_expiration: '', assigned_truck_id: '', status: 'active', notes: '',
};

const defaultMaint = {
  entity_type: 'truck', truck_id: '', trailer_id: '', service_date: new Date().toISOString().split('T')[0],
  service_type: '', description: '', vendor: '', cost: '', mileage_at_service: '',
  next_due_mileage: '', next_due_date: '', dot_inspection: false, dot_inspection_expiration: '',
};

export default function Fleet() {
  const [tab, setTab] = useState('trucks');
  const [trucks, setTrucks] = useState([]);
  const [trailers, setTrailers] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showTruckModal, setShowTruckModal] = useState(false);
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [showMaintModal, setShowMaintModal] = useState(false);
  const [editingTruck, setEditingTruck] = useState(null);
  const [editingTrailer, setEditingTrailer] = useState(null);
  const [editingMaint, setEditingMaint] = useState(null);
  const [truckForm, setTruckForm] = useState(defaultTruck);
  const [trailerForm, setTrailerForm] = useState(defaultTrailer);
  const [maintForm, setMaintForm] = useState(defaultMaint);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, trRes, mRes, dRes] = await Promise.all([
        api.get('/trucks'), api.get('/trailers'),
        api.get('/maintenance'), api.get('/drivers', { params: { active: true } }),
      ]);
      setTrucks(tRes.data); setTrailers(trRes.data);
      setMaintenance(mRes.data); setDrivers(dRes.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const tf = (k) => (e) => setTruckForm(p => ({ ...p, [k]: e.target.value }));
  const trf = (k) => (e) => setTrailerForm(p => ({ ...p, [k]: e.target.value }));
  const mf = (k) => (e) => setMaintForm(p => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const saveTruck = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editingTruck) { await api.put(`/trucks/${editingTruck.id}`, truckForm); toast.success('Truck updated'); }
      else { await api.post('/trucks', truckForm); toast.success('Truck added'); }
      setShowTruckModal(false); loadAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); } finally { setSaving(false); }
  };

  const saveTrailer = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editingTrailer) { await api.put(`/trailers/${editingTrailer.id}`, trailerForm); toast.success('Trailer updated'); }
      else { await api.post('/trailers', trailerForm); toast.success('Trailer added'); }
      setShowTrailerModal(false); loadAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); } finally { setSaving(false); }
  };

  const saveMaint = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editingMaint) { await api.put(`/maintenance/${editingMaint.id}`, maintForm); toast.success('Updated'); }
      else { await api.post('/maintenance', maintForm); toast.success('Maintenance logged'); }
      setShowMaintModal(false); loadAll();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    try {
      if (deleteTarget.type === 'truck') await api.delete(`/trucks/${deleteTarget.id}`);
      else if (deleteTarget.type === 'trailer') await api.delete(`/trailers/${deleteTarget.id}`);
      else if (deleteTarget.type === 'maint') await api.delete(`/maintenance/${deleteTarget.id}`);
      toast.success('Deleted');
      setDeleteTarget(null); loadAll();
    } catch { toast.error('Failed'); }
  };

  const openTruck = (t) => { setEditingTruck(t); setTruckForm(t ? { ...defaultTruck, ...t, registration_expiration: t.registration_expiration?.split('T')[0]||'', irp_expiration: t.irp_expiration?.split('T')[0]||'' } : defaultTruck); setShowTruckModal(true); };
  const openTrailer = (t) => { setEditingTrailer(t); setTrailerForm(t ? { ...defaultTrailer, ...t, registration_expiration: t.registration_expiration?.split('T')[0]||'' } : defaultTrailer); setShowTrailerModal(true); };
  const openMaint = (m, preEntity) => {
    setEditingMaint(m);
    setMaintForm(m ? { ...defaultMaint, ...m, service_date: m.service_date?.split('T')[0]||'', next_due_date: m.next_due_date?.split('T')[0]||'', dot_inspection_expiration: m.dot_inspection_expiration?.split('T')[0]||'' }
      : { ...defaultMaint, ...preEntity });
    setShowMaintModal(true);
  };

  const getExpClass = (d) => { if (!d) return ''; const days = Math.floor((new Date(d)-new Date())/(1000*60*60*24)); return days<0?'exp-expired':days<=30?'exp-danger':days<=90?'exp-warning':'exp-ok'; };

  return (
    <div>
      <PageHeader title="Fleet Management"
        actions={
          <div className="flex gap-8">
            <button className="btn btn-primary" onClick={() => openTruck(null)}>+ Add Truck</button>
            <button className="btn btn-secondary" onClick={() => openTrailer(null)}>+ Add Trailer</button>
            <button className="btn btn-secondary" onClick={() => openMaint(null, { entity_type: 'truck' })}>+ Log Maintenance</button>
          </div>
        }
      />

      <div className="tabs">
        {[['trucks', `<FaTruck /> Trucks (${trucks.length})`], ['trailers', `<FaTractor /> Trailers (${trailers.length})`], ['maintenance', `<FaWrench /> Maintenance (${maintenance.length})`]].map(([t, l]) => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <>
          {tab === 'trucks' && (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead><tr><th>Unit #</th><th>Year/Make/Model</th><th>VIN</th><th>Plate</th><th>Reg. Exp.</th><th>IRP Exp.</th><th>Assigned Driver</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {trucks.length === 0 ? <tr><td colSpan={9}><EmptyState icon={<FaTruck />} title="No trucks" /></td></tr>
                      : trucks.map(t => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 700, fontSize: '15px' }}>{t.unit_number}</td>
                        <td>{[t.year, t.make, t.model].filter(Boolean).join(' ')}</td>
                        <td className="mono" style={{ fontSize: '11px' }}>{t.vin || '—'}</td>
                        <td className="muted">{[t.plate_number, t.plate_state].filter(Boolean).join(' ')}</td>
                        <td><span className={getExpClass(t.registration_expiration)}>{formatDate(t.registration_expiration)}</span></td>
                        <td><span className={getExpClass(t.irp_expiration)}>{formatDate(t.irp_expiration)}</span></td>
                        <td className="muted">{t.first_name ? `${t.first_name} ${t.last_name}` : '—'}</td>
                        <td><span className={`badge badge-${t.status}`}>{t.status.replace(/_/g,' ')}</span></td>
                        <td>
                          <div className="flex gap-8">
                            <Link to={`/fleet/trucks/${t.id}`} className="btn btn-ghost btn-sm"><FaEye /></Link>
                            <button className="btn btn-ghost btn-sm" onClick={() => openTruck(t)}><FaEdit /></button>
                            <button className="btn btn-ghost btn-sm" onClick={() => openMaint(null, { entity_type:'truck', truck_id:t.id })}><FaWrench /></button>
                            <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget({ id:t.id, type:'truck', name:`Truck ${t.unit_number}` })}><FaTrash /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'trailers' && (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead><tr><th>Unit #</th><th>Type</th><th>Year/Make</th><th>VIN</th><th>Plate</th><th>Reg. Exp.</th><th>Assigned Truck</th><th>Status</th><th>Actions</th></tr></thead>
                  <tbody>
                    {trailers.length === 0 ? <tr><td colSpan={9}><EmptyState icon={<FaTractor />} title="No trailers" /></td></tr>
                      : trailers.map(t => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 700 }}>{t.unit_number}</td>
                        <td className="muted">{t.trailer_type}</td>
                        <td className="muted">{[t.year, t.make].filter(Boolean).join(' ')}</td>
                        <td className="mono" style={{ fontSize: '11px' }}>{t.vin || '—'}</td>
                        <td className="muted">{[t.plate_number, t.plate_state].filter(Boolean).join(' ')}</td>
                        <td><span className={getExpClass(t.registration_expiration)}>{formatDate(t.registration_expiration)}</span></td>
                        <td className="muted">{t.truck_unit ? `#${t.truck_unit}` : '—'}</td>
                        <td><span className={`badge badge-${t.status}`}>{t.status.replace(/_/g,' ')}</span></td>
                        <td>
                          <div className="flex gap-8">
                            <button className="btn btn-ghost btn-sm" onClick={() => openTrailer(t)}><FaEdit /></button>
                            <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget({ id:t.id, type:'trailer', name:`Trailer ${t.unit_number}` })}><FaTrash /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'maintenance' && (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead><tr><th>Entity</th><th>Date</th><th>Service Type</th><th>Vendor</th><th>Cost</th><th>Mileage</th><th>Next Due</th><th>DOT Insp.</th><th>Actions</th></tr></thead>
                  <tbody>
                    {maintenance.length === 0 ? <tr><td colSpan={9}><EmptyState icon={<FaWrench />} title="No maintenance records" /></td></tr>
                      : maintenance.map(m => (
                      <tr key={m.id}>
                        <td style={{ fontWeight:600 }}>{m.truck_unit ? `<FaTruck /> #${m.truck_unit}` : m.trailer_unit ? `<FaTractor /> #${m.trailer_unit}` : '—'}</td>
                        <td className="muted">{formatDate(m.service_date)}</td>
                        <td>{m.service_type}</td>
                        <td className="muted">{m.vendor || '—'}</td>
                        <td style={{ fontWeight:600 }}>{m.cost ? `$${parseFloat(m.cost).toFixed(2)}` : '—'}</td>
                        <td className="muted">{m.mileage_at_service?.toLocaleString() || '—'}</td>
                        <td>
                          {m.next_due_date && <span className={getExpClass(m.next_due_date)}>{formatDate(m.next_due_date)}</span>}
                          {m.next_due_mileage && <div style={{ fontSize:'11px', color:'var(--text-muted)' }}>{m.next_due_mileage?.toLocaleString()} mi</div>}
                        </td>
                        <td>
                          {m.dot_inspection ? (
                            <span><FaCheck /> <span className={getExpClass(m.dot_inspection_expiration)} style={{ fontSize:'11px' }}>{formatDate(m.dot_inspection_expiration)}</span></span>
                          ) : '—'}
                        </td>
                        <td>
                          <div className="flex gap-8">
                            <button className="btn btn-ghost btn-sm" onClick={() => openMaint(m, {})}><FaEdit /></button>
                            <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget({ id:m.id, type:'maint', name:'record' })}><FaTrash /></button>
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

      {/* Truck Modal */}
      {showTruckModal && (
        <Modal title={editingTruck ? `Edit Truck #${editingTruck.unit_number}` : 'Add Truck'} onClose={() => setShowTruckModal(false)} size="modal-lg"
          footer={<><button className="btn btn-secondary" onClick={() => setShowTruckModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveTruck} disabled={saving}>{saving ? 'Saving...' : editingTruck ? 'Update' : 'Add Truck'}</button></>}
        >
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
            <div className="form-group"><label className="form-label">Unit Number *</label><input className="form-control" value={truckForm.unit_number} onChange={tf('unit_number')} required /></div>
            <div className="form-group"><label className="form-label">Status</label>
              <select className="form-control" value={truckForm.status} onChange={tf('status')}>
                {['active','in_shop','out_of_service','sold'].map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Year</label><input type="number" className="form-control" value={truckForm.year} onChange={tf('year')} /></div>
            <div className="form-group"><label className="form-label">Make</label><input className="form-control" value={truckForm.make} onChange={tf('make')} placeholder="Freightliner, Kenworth..." /></div>
            <div className="form-group"><label className="form-label">Model</label><input className="form-control" value={truckForm.model} onChange={tf('model')} /></div>
            <div className="form-group"><label className="form-label">VIN</label><input className="form-control" value={truckForm.vin} onChange={tf('vin')} /></div>
            <div className="form-group"><label className="form-label">Plate Number</label><input className="form-control" value={truckForm.plate_number} onChange={tf('plate_number')} /></div>
            <div className="form-group"><label className="form-label">Plate State</label><input className="form-control" maxLength={2} value={truckForm.plate_state} onChange={tf('plate_state')} style={{ textTransform:'uppercase' }} /></div>
            <div className="form-group"><label className="form-label">Registration Expiration</label><input type="date" className="form-control" value={truckForm.registration_expiration} onChange={tf('registration_expiration')} /></div>
            <div className="form-group"><label className="form-label">IRP Expiration</label><input type="date" className="form-control" value={truckForm.irp_expiration} onChange={tf('irp_expiration')} /></div>
            <div className="form-group"><label className="form-label">Current Mileage</label><input type="number" className="form-control" value={truckForm.current_mileage} onChange={tf('current_mileage')} /></div>
            <div className="form-group"><label className="form-label">Assigned Driver</label>
              <select className="form-control" value={truckForm.assigned_driver_id} onChange={tf('assigned_driver_id')}>
                <option value="">Unassigned</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}><label className="form-label">Notes</label><textarea className="form-control" value={truckForm.notes} onChange={tf('notes')} rows={2} /></div>
          </div>
        </Modal>
      )}

      {/* Trailer Modal */}
      {showTrailerModal && (
        <Modal title={editingTrailer ? `Edit Trailer #${editingTrailer.unit_number}` : 'Add Trailer'} onClose={() => setShowTrailerModal(false)} size="modal-lg"
          footer={<><button className="btn btn-secondary" onClick={() => setShowTrailerModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveTrailer} disabled={saving}>{saving ? 'Saving...' : editingTrailer ? 'Update' : 'Add Trailer'}</button></>}
        >
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
            <div className="form-group"><label className="form-label">Unit Number *</label><input className="form-control" value={trailerForm.unit_number} onChange={trf('unit_number')} required /></div>
            <div className="form-group"><label className="form-label">Type</label>
              <select className="form-control" value={trailerForm.trailer_type} onChange={trf('trailer_type')}>
                {['Dry Van','Refrigerated (Reefer)','Flatbed','Step Deck','Lowboy','Tanker','Other'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Year</label><input type="number" className="form-control" value={trailerForm.year} onChange={trf('year')} /></div>
            <div className="form-group"><label className="form-label">Make</label><input className="form-control" value={trailerForm.make} onChange={trf('make')} /></div>
            <div className="form-group"><label className="form-label">VIN</label><input className="form-control" value={trailerForm.vin} onChange={trf('vin')} /></div>
            <div className="form-group"><label className="form-label">Plate</label><input className="form-control" value={trailerForm.plate_number} onChange={trf('plate_number')} /></div>
            <div className="form-group"><label className="form-label">Plate State</label><input className="form-control" maxLength={2} value={trailerForm.plate_state} onChange={trf('plate_state')} style={{ textTransform:'uppercase' }} /></div>
            <div className="form-group"><label className="form-label">Reg. Expiration</label><input type="date" className="form-control" value={trailerForm.registration_expiration} onChange={trf('registration_expiration')} /></div>
            <div className="form-group"><label className="form-label">Assigned Truck</label>
              <select className="form-control" value={trailerForm.assigned_truck_id} onChange={trf('assigned_truck_id')}>
                <option value="">Unassigned</option>
                {trucks.map(t => <option key={t.id} value={t.id}>#{t.unit_number}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Status</label>
              <select className="form-control" value={trailerForm.status} onChange={trf('status')}>
                {['active','in_shop','out_of_service','sold'].map(s => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
              </select>
            </div>
          </div>
        </Modal>
      )}

      {/* Maintenance Modal */}
      {showMaintModal && (
        <Modal title={editingMaint ? 'Edit Maintenance Record' : 'Log Maintenance'} onClose={() => setShowMaintModal(false)} size="modal-lg"
          footer={<><button className="btn btn-secondary" onClick={() => setShowMaintModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveMaint} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}
        >
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
            <div className="form-group"><label className="form-label">Entity Type</label>
              <select className="form-control" value={maintForm.entity_type} onChange={mf('entity_type')}>
                <option value="truck">Truck</option><option value="trailer">Trailer</option>
              </select>
            </div>
            {maintForm.entity_type === 'truck' ? (
              <div className="form-group"><label className="form-label">Truck</label>
                <select className="form-control" value={maintForm.truck_id} onChange={mf('truck_id')}>
                  <option value="">Select truck...</option>
                  {trucks.map(t => <option key={t.id} value={t.id}>#{t.unit_number}</option>)}
                </select>
              </div>
            ) : (
              <div className="form-group"><label className="form-label">Trailer</label>
                <select className="form-control" value={maintForm.trailer_id} onChange={mf('trailer_id')}>
                  <option value="">Select trailer...</option>
                  {trailers.map(t => <option key={t.id} value={t.id}>#{t.unit_number}</option>)}
                </select>
              </div>
            )}
            <div className="form-group"><label className="form-label">Service Date *</label><input type="date" className="form-control" value={maintForm.service_date} onChange={mf('service_date')} required /></div>
            <div className="form-group"><label className="form-label">Service Type *</label>
              <select className="form-control" value={maintForm.service_type} onChange={mf('service_type')}>
                {['Oil Change','Tire Rotation/Replacement','Brake Service','DOT Annual Inspection','PM Service','Engine Repair','Transmission','A/C Service','Lights/Electrical','Other'].map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}><label className="form-label">Description</label><textarea className="form-control" value={maintForm.description} onChange={mf('description')} rows={2} /></div>
            <div className="form-group"><label className="form-label">Vendor / Shop</label><input className="form-control" value={maintForm.vendor} onChange={mf('vendor')} /></div>
            <div className="form-group"><label className="form-label">Cost ($)</label><input type="number" step="0.01" className="form-control" value={maintForm.cost} onChange={mf('cost')} /></div>
            <div className="form-group"><label className="form-label">Mileage at Service</label><input type="number" className="form-control" value={maintForm.mileage_at_service} onChange={mf('mileage_at_service')} /></div>
            <div className="form-group"><label className="form-label">Next Due Mileage</label><input type="number" className="form-control" value={maintForm.next_due_mileage} onChange={mf('next_due_mileage')} /></div>
            <div className="form-group"><label className="form-label">Next Due Date</label><input type="date" className="form-control" value={maintForm.next_due_date} onChange={mf('next_due_date')} /></div>
            <div className="form-group" style={{ display:'flex', alignItems:'center', gap:'10px', paddingTop:'28px' }}>
              <input type="checkbox" id="dot_insp" checked={maintForm.dot_inspection} onChange={mf('dot_inspection')} style={{ width:'18px', height:'18px' }} />
              <label htmlFor="dot_insp" style={{ color:'var(--text-secondary)', fontSize:'14px', fontWeight:600 }}>DOT Annual Inspection</label>
            </div>
            {maintForm.dot_inspection && (
              <div className="form-group"><label className="form-label">DOT Inspection Expiration</label><input type="date" className="form-control" value={maintForm.dot_inspection_expiration} onChange={mf('dot_inspection_expiration')} /></div>
            )}
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal title="Delete" message={`Delete ${deleteTarget.name}?`} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
