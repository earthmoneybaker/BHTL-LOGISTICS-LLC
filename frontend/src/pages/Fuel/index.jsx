import { FaTrash, FaEdit, FaGasPump, FaRoad, FaChartBar, FaTruck, FaCalendarWeek, FaCreditCard } from 'react-icons/fa';
import { useState, useEffect, useCallback, useMemo } from 'react';
import api, { downloadFile } from '../../api/client';
import { Spinner, EmptyState, PageHeader, Modal, formatCurrency, formatDate, ConfirmModal } from '../../components/ui';
import toast from 'react-hot-toast';
import { getDriverForTruck, getCardsForTruck, formatCardNumber, CARD_DRIVER_MAP } from '../../utils/truckDrivers';

const US_STATES = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];

const defaultFuelForm = {
  truck_id: '', purchase_date: new Date().toISOString().split('T')[0], state: 'OH',
  gallons: '', cost_per_gallon: '', total_cost: '', vendor: '', notes: '', card_last3: '',
};

const defaultMilesForm = {
  truck_id: '', load_id: '', state: 'OH', miles: '', trip_date: new Date().toISOString().split('T')[0],
};

// Get the Monday of the current week
function getWeekStart() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}
function getWeekEnd() {
  const start = new Date(getWeekStart() + 'T12:00:00');
  start.setDate(start.getDate() + 6);
  return start.toISOString().split('T')[0];
}

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
  const [weekFilter, setWeekFilter] = useState('this'); // 'this' | 'all'

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

  // Weekly fuel cost per truck
  const weekStart = getWeekStart();
  const weekEnd = getWeekEnd();

  const weeklyFuel = useMemo(() => {
    const weekFuel = fuel.filter(f => {
      const d = f.purchase_date;
      return d >= weekStart && d <= weekEnd;
    });
    // Group by truck
    const byTruck = {};
    weekFuel.forEach(f => {
      const key = f.truck_id || '__none__';
      if (!byTruck[key]) byTruck[key] = { truck_id: f.truck_id, truck_unit: f.truck_unit || 'Unknown', total_cost: 0, gallons: 0, purchases: 0 };
      byTruck[key].total_cost += parseFloat(f.total_cost || 0);
      byTruck[key].gallons += parseFloat(f.gallons || 0);
      byTruck[key].purchases += 1;
    });
    return Object.values(byTruck).sort((a, b) => b.total_cost - a.total_cost);
  }, [fuel, weekStart, weekEnd]);

  const weeklyTotal = weeklyFuel.reduce((a, t) => a + t.total_cost, 0);

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
        {[['fuel', <><FaGasPump /> Fuel Purchases ({fuel.length})</>], ['weekly', <><FaCalendarWeek /> This Week by Truck</>], ['miles', <><FaRoad /> Miles by State ({miles.length})</>], ['ifta', <><FaChartBar /> IFTA Report</>]].map(([t,l]) => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {loading ? <Spinner /> : (
        <>
          {/* ── ALL FUEL PURCHASES ── */}
          {tab === 'fuel' && (
            <div>
              <div className="stat-grid mb-16">
                <div className="stat-card" style={{ '--accent':'var(--brand-orange)' }}>
                  <div className="stat-label">Total Gallons (All Time)</div>
                  <div className="stat-value">{totalGallons.toFixed(1)}</div>
                </div>
                <div className="stat-card" style={{ '--accent':'var(--danger)' }}>
                  <div className="stat-label">Total Fuel Cost (All Time)</div>
                  <div className="stat-value" style={{ fontSize:'20px' }}>{formatCurrency(totalFuelCost)}</div>
                </div>
                <div className="stat-card" style={{ '--accent':'var(--info)' }}>
                  <div className="stat-label">Avg Cost/Gallon</div>
                  <div className="stat-value">{totalGallons > 0 ? `$${(totalFuelCost / totalGallons).toFixed(3)}` : '—'}</div>
                </div>
                <div className="stat-card" style={{ '--accent':'#10B981' }}>
                  <div className="stat-label">This Week Total</div>
                  <div className="stat-value" style={{ fontSize:'20px' }}>{formatCurrency(weeklyTotal)}</div>
                  <div className="stat-sub">{weeklyFuel.length > 0 ? `${weeklyFuel.length} truck${weeklyFuel.length > 1 ? 's' : ''}` : 'No purchases yet'}</div>
                </div>
              </div>

              <div className="card" style={{ padding: 0 }}>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead><tr><th>Date</th><th>Truck / Driver</th><th>Card</th><th>State</th><th>Gallons</th><th>$/Gal</th><th>Total</th><th>Vendor</th><th>Actions</th></tr></thead>
                    <tbody>
                      {fuel.length === 0 ? <tr><td colSpan={9}><EmptyState icon={<FaGasPump />} title="No fuel purchases logged" /></td></tr>
                        : fuel.map(f => {
                          const driverName = f.truck_unit ? getDriverForTruck(f.truck_unit) : null;
                          const cardDisplay = f.card_last3 ? formatCardNumber(f.card_last3) : null;
                          return (
                            <tr key={f.id}>
                              <td className="muted">{formatDate(f.purchase_date)}</td>
                              <td>
                                <div style={{ fontWeight: 700 }}>{f.truck_unit ? `#${f.truck_unit}` : '—'}</div>
                                {driverName && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{driverName}</div>}
                              </td>
                              <td>
                                {cardDisplay
                                  ? <span style={{ fontFamily: 'monospace', fontSize: 12, background: 'rgba(255,255,255,0.05)', padding: '2px 7px', borderRadius: 5, border: '1px solid var(--border-color)' }}>
                                      <FaCreditCard style={{ marginRight: 4, opacity: 0.5 }} />{cardDisplay}
                                    </span>
                                  : <span className="muted">—</span>}
                              </td>
                              <td style={{ fontWeight:700 }}>{f.state}</td>
                              <td>{parseFloat(f.gallons).toFixed(3)}</td>
                              <td className="muted">{f.cost_per_gallon ? `$${parseFloat(f.cost_per_gallon).toFixed(4)}` : '—'}</td>
                              <td style={{ fontWeight:700, color:'var(--danger)' }}>{formatCurrency(f.total_cost)}</td>
                              <td className="muted">{f.vendor || '—'}</td>
                              <td>
                                <div className="flex gap-8">
                                  <button className="btn btn-ghost btn-sm" onClick={() => { setEditingFuel(f); setFuelForm({ ...defaultFuelForm, ...f, purchase_date: f.purchase_date?.split('T')[0]||'', card_last3: f.card_last3||'' }); setShowFuelModal(true); }}><FaEdit /></button>
                                  <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(f)}><FaTrash /></button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── WEEKLY FUEL BY TRUCK ── */}
          {tab === 'weekly' && (
            <div>
              <div style={{
                background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                borderRadius: 12, padding: '14px 20px', marginBottom: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                    <FaCalendarWeek style={{ marginRight: 8, color: 'var(--brand-blue-light)' }} />
                    Week: {new Date(weekStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {new Date(weekEnd + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Fuel costs for the current work week (Mon–Sun)</div>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--danger)' }}>
                  Week Total: {formatCurrency(weeklyTotal)}
                </div>
              </div>

              {weeklyFuel.length === 0 ? (
                <div className="card">
                  <EmptyState icon={<FaGasPump />} title="No fuel purchases this week" description="Fuel logged this week (Mon–Sun) will appear here grouped by truck." />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                  {weeklyFuel.map(t => (
                    <div key={t.truck_id || '__none__'} style={{
                      background: 'var(--bg-card)', border: '1px solid var(--border-color)',
                      borderRadius: 14, padding: 20, position: 'relative', overflow: 'hidden',
                    }}>
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, var(--brand-orange), transparent)' }} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(249,115,22,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FaTruck style={{ color: 'var(--brand-orange)', fontSize: 18 }} />
                        </div>
                        <div>
                          <div style={{ fontSize: 15, fontWeight: 800 }}>Truck #{t.truck_unit}</div>
                          <div style={{ fontSize: 12, color: 'var(--brand-blue-light)', fontWeight: 600 }}>{getDriverForTruck(t.truck_unit) || ''}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t.purchases} purchase{t.purchases !== 1 ? 's' : ''} this week</div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Cost</div>
                          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--danger)' }}>{formatCurrency(t.total_cost)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gallons</div>
                          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)' }}>{t.gallons.toFixed(1)}</div>
                        </div>
                      </div>
                      <div style={{ marginTop: 12, padding: '8px 12px', background: 'var(--bg-primary)', borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
                        Avg: ${t.gallons > 0 ? (t.total_cost / t.gallons).toFixed(3) : '—'}/gal
                      </div>
                      {/* Bar showing proportion of week total */}
                      <div style={{ marginTop: 10, height: 4, background: 'var(--border-color)', borderRadius: 2 }}>
                        <div style={{ height: '100%', background: 'var(--brand-orange)', borderRadius: 2, width: `${weeklyTotal > 0 ? Math.min((t.total_cost / weeklyTotal) * 100, 100) : 0}%`, transition: 'width 0.5s ease' }} />
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, textAlign: 'right' }}>
                        {weeklyTotal > 0 ? Math.round((t.total_cost / weeklyTotal) * 100) : 0}% of week total
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Detailed purchases this week */}
              {weeklyFuel.length > 0 && (
                <div className="card mt-20" style={{ padding: 0, marginTop: 24 }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', fontWeight: 700 }}>
                    This Week's Fuel Purchases — Detail
                  </div>
                  <div className="table-wrapper">
                    <table className="data-table">
                      <thead><tr><th>Date</th><th>Truck</th><th>State</th><th>Gallons</th><th>$/Gal</th><th>Total</th><th>Vendor</th></tr></thead>
                      <tbody>
                        {fuel
                          .filter(f => f.purchase_date >= weekStart && f.purchase_date <= weekEnd)
                          .map(f => (
                            <tr key={f.id}>
                              <td className="muted">{formatDate(f.purchase_date)}</td>
                              <td style={{ fontWeight: 600 }}>{f.truck_unit ? `#${f.truck_unit}` : '—'}</td>
                              <td style={{ fontWeight: 700 }}>{f.state}</td>
                              <td>{parseFloat(f.gallons).toFixed(3)}</td>
                              <td className="muted">{f.cost_per_gallon ? `$${parseFloat(f.cost_per_gallon).toFixed(4)}` : '—'}</td>
                              <td style={{ fontWeight: 700, color: 'var(--danger)' }}>{formatCurrency(f.total_cost)}</td>
                              <td className="muted">{f.vendor || '—'}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── MILES BY STATE ── */}
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

          {/* ── IFTA REPORT ── */}
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
                      ℹ️ IFTA net gallons calculated from average fleet MPG. Positive = credit, Negative = you owe tax. Consult your state IFTA filing for exact tax rates.
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
                {trucks.map(t => {
                  const driverName = getDriverForTruck(t.unit_number);
                  return <option key={t.id} value={t.id}>#{t.unit_number}{driverName ? ` — ${driverName}` : ''}</option>;
                })}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label"><FaCreditCard style={{ marginRight: 5 }} />Fuel Card (last 3 digits only)</label>
              <input className="form-control" maxLength={3} placeholder="e.g. 839"
                value={fuelForm.card_last3} onChange={ff('card_last3')} />
              {/* Show associated cards for selected truck */}
              {fuelForm.truck_id && (() => {
                const t = trucks.find(tr => tr.id === fuelForm.truck_id);
                const cards = t ? getCardsForTruck(t.unit_number) : [];
                if (cards.length === 0) return null;
                return (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    Known cards for this truck: {cards.map((c, i) => (
                      <span key={i}
                        style={{ cursor: 'pointer', marginLeft: 4, color: 'var(--brand-blue-light)', textDecoration: 'underline' }}
                        onClick={() => setFuelForm(p => ({ ...p, card_last3: c.replace('***', '') }))}
                      >{c}</span>
                    ))}
                  </div>
                );
              })()}
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
        <ConfirmModal title="Delete Fuel Record" message="Delete this fuel purchase? This cannot be undone." onConfirm={handleDeleteFuel} onCancel={() => setDeleteTarget(null)} />
      )}
    </div>
  );
}
