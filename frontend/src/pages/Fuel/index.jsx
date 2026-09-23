import { FaTrash, FaEdit, FaGasPump, FaRoad, FaChartBar } from 'react-icons/fa';
import { useState, useEffect, useCallback } from 'react';
import api, { downloadFile } from '../../api/client';
import { Spinner, EmptyState, PageHeader, Modal, formatCurrency, formatDate, ConfirmModal } from '../../components/ui';
import toast from 'react-hot-toast';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const defaultFuelForm = {
  truck_id: '', purchase_date: new Date().toISOString().split('T')[0], state: 'OH',
  gallons: '', cost_per_gallon: '', total_cost: '', vendor: '', notes: '',
};

const defaultMilesForm = {
  truck_id: '', load_id: '', state: 'OH', miles: '', trip_date: new Date().toISOString().split('T')[0],
};

export default function Fuel() {
  const [tab, setTab] = useState('fuel');
  const [fuel, setFuel] = useState([]);
  const [miles, setMiles] = useState([]);
  const [iftaReport, setIftaReport] = useState(null);
  const [trucks, setTrucks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [showMilesModal, setShowMilesModal] = useState(false);
  const [editingFuel, setEditingFuel] = useState(null);
  const [fuelForm, setFuelForm] = useState(defaultFuelForm);
  const [milesForm, setMilesForm] = useState(defaultMilesForm);
  const [saving, setSaving] = useState(false);
  const [iftaFilters, setIftaFilters] = useState({
    quarter: `${Math.ceil((new Date().getMonth() + 1) / 3)}`,
    year: `${new Date().getFullYear()}`, truck_id: '',
  });
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fuelRes, truckRes, milesRes] = await Promise.all([
        api.get('/fuel'), api.get('/trucks'), api.get('/fuel/miles'),
      ]);
      setFuel(fuelRes.data);
      setTrucks(truckRes.data);
      setMiles(milesRes.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const ff = (k) => (e) => {
    const val = e.target.value;
    setFuelForm(p => {
      const updated = { ...p, [k]: val };
      if (k === 'gallons' || k === 'cost_per_gallon') {
        const g = parseFloat(k === 'gallons' ? val : p.gallons) || 0;
        const c = parseFloat(k === 'cost_per_gallon' ? val : p.cost_per_gallon) || 0;
        if (g && c) updated.total_cost = (g * c).toFixed(2);
      }
      return updated;
    });
  };
  const mf = (k) => (e) => setMilesForm(p => ({ ...p, [k]: e.target.value }));

  const saveFuel = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editingFuel) { await api.put(`/fuel/${editingFuel.id}`, fuelForm); toast.success('Updated'); }
      else { await api.post('/fuel', fuelForm); toast.success('Fuel purchase logged'); }
      setShowFuelModal(false); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); } finally { setSaving(false); }
  };

  const saveMiles = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      await api.post('/fuel/miles', milesForm);
      toast.success('Miles logged');
      setShowMilesModal(false); load();
    } catch (err) { toast.error(err.response?.data?.error || 'Failed'); } finally { setSaving(false); }
  };

  const loadIfta = async () => {
    try {
      const res = await api.get('/fuel/report/ifta', { params: iftaFilters });
      setIftaReport(res.data);
    } catch { toast.error('Failed to generate IFTA report'); }
  };

  const exportIftaCsv = () => {
    const p = new URLSearchParams(iftaFilters).toString();
    downloadFile(`/fuel/report/ifta/csv?${p}`, 'ifta-report.csv');
  };

  const handleDeleteFuel = async () => {
    try { await api.delete(`/fuel/${deleteTarget.id}`); toast.success('Deleted'); setDeleteTarget(null); load(); }
    catch { toast.error('Failed'); }
  };

  const totalGallons = fuel.reduce((a, f) => a + parseFloat(f.gallons || 0), 0);
  const totalFuelCost = fuel.reduce((a, f) => a + parseFloat(f.total_cost || 0), 0);

  return (
    <div>
      <PageHeader title="Fuel & IFTA"
        actions={
          <div className="flex gap-8">
            <button className="btn btn-primary" onClick={() => { setEditingFuel(null); setFuelForm(defaultFuelForm); setShowFuelModal(true); }}>+ Log Fuel Purchase</button>
            <button className="btn btn-secondary" onClick={() => { setMilesForm(defaultMilesForm); setShowMilesModal(true); }}>+ Log Miles by State</button>
          </div>
        }
      />

      <div className="tabs">
        {[['fuel',`<FaGasPump /> Fuel Purchases (${fuel.length})`], ['miles',`<FaRoad /> Miles by State (${miles.length})`], ['ifta','<FaChartBar /> IFTA Report']].map(([t,l]) => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <>
          {tab === 'fuel' && (
            <div>
              <div className="stat-grid mb-16">
                <div className="stat-card" style={{ '--accent':'var(--brand-orange)' }}>
                  <div className="stat-label">Total Gallons</div>
                  <div className="stat-value">{totalGallons.toFixed(1)}</div>
                </div>
                <div className="stat-card" style={{ '--accent':'var(--danger)' }}>
                  <div className="stat-label">Total Fuel Cost</div>
                  <div className="stat-value" style={{ fontSize:'20px' }}>{formatCurrency(totalFuelCost)}</div>
                </div>
                <div className="stat-card" style={{ '--accent':'var(--info)' }}>
                  <div className="stat-label">Avg Cost/Gallon</div>
                  <div className="stat-value">{totalGallons > 0 ? `$${(totalFuelCost / totalGallons).toFixed(3)}` : '—'}</div>
                </div>
              </div>

              <div className="card" style={{ padding: 0 }}>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead><tr><th>Date</th><th>Truck</th><th>State</th><th>Gallons</th><th>$/Gal</th><th>Total</th><th>Vendor</th><th>Actions</th></tr></thead>
                    <tbody>
                      {fuel.length === 0 ? <tr><td colSpan={8}><EmptyState icon={<FaGasPump />} title="No fuel purchases logged" /></td></tr>
                        : fuel.map(f => (
                        <tr key={f.id}>
                          <td className="muted">{formatDate(f.purchase_date)}</td>
                          <td>{f.truck_unit ? `#${f.truck_unit}` : '—'}</td>
                          <td style={{ fontWeight:700 }}>{f.state}</td>
                          <td>{parseFloat(f.gallons).toFixed(3)}</td>
                          <td className="muted">{f.cost_per_gallon ? `$${parseFloat(f.cost_per_gallon).toFixed(4)}` : '—'}</td>
                          <td style={{ fontWeight:700, color:'var(--danger)' }}>{formatCurrency(f.total_cost)}</td>
                          <td className="muted">{f.vendor || '—'}</td>
                          <td>
                            <div className="flex gap-8">
                              <button className="btn btn-ghost btn-sm" onClick={() => { setEditingFuel(f); setFuelForm({ ...defaultFuelForm, ...f, purchase_date: f.purchase_date?.split('T')[0]||'' }); setShowFuelModal(true); }}><FaEdit /></button>
                              <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(f)}><FaTrash /></button>
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

          {tab === 'miles' && (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead><tr><th>Date</th><th>Truck</th><th>Load #</th><th>State</th><th>Miles</th><th>Quarter</th></tr></thead>
                  <tbody>
                    {miles.length === 0 ? <tr><td colSpan={6}><EmptyState icon={<FaRoad />} title="No miles logged yet" /></td></tr>
                      : miles.map(m => (
                      <tr key={m.id}>
                        <td className="muted">{formatDate(m.trip_date)}</td>
                        <td>{m.truck_unit ? `#${m.truck_unit}` : '—'}</td>
                        <td className="mono">{m.load_number || '—'}</td>
                        <td style={{ fontWeight:700 }}>{m.state}</td>
                        <td>{parseFloat(m.miles).toFixed(1)}</td>
                        <td className="muted">{m.quarter} {m.year}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'ifta' && (
            <div>
              <div className="card mb-16" style={{ padding:'16px 20px' }}>
                <div className="flex gap-12 items-center flex-wrap">
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Quarter</label>
                    <select className="filter-select" value={iftaFilters.quarter} onChange={e => setIftaFilters(f => ({ ...f, quarter: e.target.value }))}>
                      <option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Year</label>
                    <select className="filter-select" value={iftaFilters.year} onChange={e => setIftaFilters(f => ({ ...f, year: e.target.value }))}>
                      {[2023,2024,2025,2026].map(y => <option key={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin:0 }}>
                    <label className="form-label">Truck</label>
                    <select className="filter-select" value={iftaFilters.truck_id} onChange={e => setIftaFilters(f => ({ ...f, truck_id: e.target.value }))}>
                      <option value="">All Trucks</option>
                      {trucks.map(t => <option key={t.id} value={t.id}>#{t.unit_number}</option>)}
                    </select>
                  </div>
                  <div style={{ display:'flex', gap:'8px', marginTop:'20px' }}>
                    <button className="btn btn-primary" onClick={loadIfta}>Generate Report</button>
                    {iftaReport && <button className="btn btn-secondary" onClick={exportIftaCsv}>⬇ Export CSV</button>}
                  </div>
                </div>
              </div>

              {iftaReport && (
                <div>
                  <div className="stat-grid mb-16">
                    <div className="stat-card"><div className="stat-label">Total Miles</div><div className="stat-value">{parseFloat(iftaReport.total_miles).toLocaleString()}</div></div>
                    <div className="stat-card"><div className="stat-label">Total Gallons</div><div className="stat-value">{parseFloat(iftaReport.total_gallons).toFixed(2)}</div></div>
                    <div className="stat-card"><div className="stat-label">Avg MPG</div><div className="stat-value">{iftaReport.avg_mpg}</div></div>
                    <div className="stat-card"><div className="stat-label">States Operated</div><div className="stat-value">{iftaReport.by_state.length}</div></div>
                  </div>

                  <div className="card" style={{ padding:0 }}>
                    <div style={{ padding:'14px 20px', borderBottom:'1px solid var(--border-color)' }}>
                      <span style={{ fontWeight:700 }}>IFTA Summary — Q{iftaReport.quarter} {iftaReport.year}</span>
                      <span style={{ fontSize:'12px', color:'var(--text-muted)', marginLeft:'12px' }}>{iftaReport.period}</span>
                    </div>
                    <div className="table-wrapper">
                      <table className="data-table">
                        <thead><tr><th>State</th><th>Miles Traveled</th><th>Gal. Purchased</th><th>Gal. Used</th><th>Net Gal. (+ = credit, - = owe)</th></tr></thead>
                        <tbody>
                          {iftaReport.by_state.map(row => (
                            <tr key={row.state}>
                              <td style={{ fontWeight:700 }}>{row.state}</td>
                              <td>{parseFloat(row.miles).toLocaleString()}</td>
                              <td>{parseFloat(row.gallons_purchased).toFixed(3)}</td>
                              <td>{parseFloat(row.gallons_used).toFixed(3)}</td>
                              <td style={{ fontWeight:700, color: parseFloat(row.gallons_net) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                {parseFloat(row.gallons_net) >= 0 ? '+' : ''}{parseFloat(row.gallons_net).toFixed(3)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="alert alert-info" style={{ margin:'16px', borderRadius:'8px' }}>
                      ℹ️ IFTA net gallons calculated from average fleet MPG. Positive = credit (paid more than used), Negative = you owe tax. Consult your state IFTA filing instructions for exact tax rates.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Fuel Modal */}
      {showFuelModal && (
        <Modal title={editingFuel ? 'Edit Fuel Purchase' : 'Log Fuel Purchase'} onClose={() => setShowFuelModal(false)}
          footer={<><button className="btn btn-secondary" onClick={() => setShowFuelModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveFuel} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}
        >
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
            <div className="form-group"><label className="form-label">Date *</label><input type="date" className="form-control" value={fuelForm.purchase_date} onChange={ff('purchase_date')} /></div>
            <div className="form-group"><label className="form-label">State *</label>
              <select className="form-control" value={fuelForm.state} onChange={ff('state')}>
                {US_STATES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Truck</label>
              <select className="form-control" value={fuelForm.truck_id} onChange={ff('truck_id')}>
                <option value="">Select truck...</option>
                {trucks.map(t => <option key={t.id} value={t.id}>#{t.unit_number}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Vendor / Station</label><input className="form-control" value={fuelForm.vendor} onChange={ff('vendor')} /></div>
            <div className="form-group"><label className="form-label">Gallons *</label><input type="number" step="0.001" className="form-control" value={fuelForm.gallons} onChange={ff('gallons')} required /></div>
            <div className="form-group"><label className="form-label">Price per Gallon ($)</label><input type="number" step="0.0001" className="form-control" value={fuelForm.cost_per_gallon} onChange={ff('cost_per_gallon')} /></div>
            <div className="form-group"><label className="form-label">Total Cost ($)</label><input type="number" step="0.01" className="form-control" value={fuelForm.total_cost} onChange={ff('total_cost')} /></div>
            <div className="form-group"><label className="form-label">Notes</label><input className="form-control" value={fuelForm.notes} onChange={ff('notes')} /></div>
          </div>
        </Modal>
      )}

      {/* Miles Modal */}
      {showMilesModal && (
        <Modal title="Log Miles by State" onClose={() => setShowMilesModal(false)}
          footer={<><button className="btn btn-secondary" onClick={() => setShowMilesModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveMiles} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}
        >
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' }}>
            <div className="form-group"><label className="form-label">Date *</label><input type="date" className="form-control" value={milesForm.trip_date} onChange={mf('trip_date')} /></div>
            <div className="form-group"><label className="form-label">State *</label>
              <select className="form-control" value={milesForm.state} onChange={mf('state')}>
                {US_STATES.map(s => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Truck</label>
              <select className="form-control" value={milesForm.truck_id} onChange={mf('truck_id')}>
                <option value="">Select truck...</option>
                {trucks.map(t => <option key={t.id} value={t.id}>#{t.unit_number}</option>)}
              </select>
            </div>
            <div className="form-group"><label className="form-label">Miles in State *</label><input type="number" step="0.1" className="form-control" value={milesForm.miles} onChange={mf('miles')} required /></div>
          </div>
        </Modal>
      )}

      {deleteTarget && (
        <ConfirmModal title="Delete Fuel Record" message="Delete this fuel purchase?" onConfirm={handleDeleteFuel} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
