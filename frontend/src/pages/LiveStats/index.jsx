import {
  FaTruck, FaGasPump, FaDollarSign, FaBox, FaMapMarkerAlt, FaUser,
  FaSync, FaExclamationTriangle, FaCheck, FaArrowRight, FaClock,
  FaChartBar, FaPhone, FaCalendarWeek, FaTimes, FaChevronDown,
  FaFire, FaCheckCircle
} from 'react-icons/fa';
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { Spinner, StatusBadge, formatCurrency } from '../../components/ui';
import toast from 'react-hot-toast';

const fmt = (n) => formatCurrency(n);

const STATUS_COLORS = {
  booked: '#3B82F6',
  dispatched: '#8B5CF6',
  in_transit: '#F97316',
  delivered: '#10B981',
  invoiced: '#F59E0B',
  paid: '#059669',
};

// ── Check if delivery is overdue ──────────────────────────────────────────
function isOverdue(load) {
  if (!load.delivery_date) return false;
  const now = new Date();
  const delDate = load.delivery_date;
  const delTime = load.delivery_time || '23:59';
  const delDT = new Date(`${delDate}T${delTime}:00`);
  return delDT < now && (load.status === 'in_transit' || load.status === 'dispatched');
}

// ── Format delivery time display ──────────────────────────────────────────
function formatDeliveryInfo(load) {
  if (!load.delivery_date) return null;
  const dateStr = new Date(load.delivery_date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  const timeStr = load.delivery_time
    ? (() => {
        const [h, m] = load.delivery_time.split(':');
        const dt = new Date();
        dt.setHours(parseInt(h), parseInt(m));
        return dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
      })()
    : null;
  return timeStr ? `${dateStr} @ ${timeStr}` : dateStr;
}

// ── Drill-Down Modal ──────────────────────────────────────────────────────
function DrillDownModal({ type, weekStart, weekEnd, trucks, onClose }) {
  const [selectedTruck, setSelectedTruck] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { start: weekStart, end: weekEnd };
      if (selectedTruck) params.truck_id = selectedTruck;

      if (type === 'fuel') {
        const res = await api.get('/live-stats/fuel-breakdown', { params });
        setData(res.data);
      } else if (type === 'loads' || type === 'revenue') {
        const res = await api.get('/live-stats/loads-breakdown', { params });
        setData(res.data);
      }
    } catch (err) {
      toast.error('Failed to load breakdown');
    } finally {
      setLoading(false);
    }
  }, [type, weekStart, weekEnd, selectedTruck]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const titles = { fuel: '⛽ Fuel Breakdown', loads: '📦 Load Breakdown', revenue: '💰 Revenue Breakdown' };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
        borderRadius: 16, width: '100%', maxWidth: 760, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{titles[type]}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Truck selector */}
            <select
              value={selectedTruck}
              onChange={e => setSelectedTruck(e.target.value)}
              className="form-input"
              style={{ padding: '5px 10px', fontSize: 13, width: 160 }}
            >
              <option value="">All Trucks</option>
              {trucks.map(t => (
                <option key={t.truck_id || t.id} value={t.truck_id || t.id}>
                  {t.unit_number}
                </option>
              ))}
            </select>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, padding: 4 }}>
              <FaTimes />
            </button>
          </div>
        </div>

        {/* Modal body */}
        <div style={{ overflowY: 'auto', flex: 1, padding: 20 }}>
          {loading ? <Spinner /> : !data ? null : (

            // ── FUEL BREAKDOWN ────────────────────────────────────────
            type === 'fuel' ? (
              <div>
                {/* Totals per truck */}
                {data.totals.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10, marginBottom: 20 }}>
                    {data.totals.map(t => (
                      <div key={t.truck_id} style={{ background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 10, padding: 14 }}>
                        <div style={{ fontWeight: 700, fontSize: 15 }}>{t.unit_number || 'Unknown'}</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--danger)', marginTop: 4 }}>{fmt(t.total_cost)}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{parseFloat(t.total_gallons).toFixed(1)} gal · {t.purchases} stops</div>
                      </div>
                    ))}
                  </div>
                )}
                {/* Individual purchases */}
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 10 }}>INDIVIDUAL FUEL STOPS</div>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Truck</th>
                        <th>Date</th>
                        <th>Location</th>
                        <th>Fuel Type</th>
                        <th style={{ textAlign: 'right' }}>Gallons</th>
                        <th style={{ textAlign: 'right' }}>$/Gal</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.purchases.length === 0 ? (
                        <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No fuel purchases this period</td></tr>
                      ) : data.purchases.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 600 }}>{p.unit_number || '—'}</td>
                          <td style={{ fontSize: 12 }}>{p.purchase_date}</td>
                          <td style={{ fontSize: 12 }}>{p.location || '—'}</td>
                          <td style={{ fontSize: 12 }}>{p.fuel_type || 'Diesel'}</td>
                          <td style={{ textAlign: 'right' }}>{parseFloat(p.gallons || 0).toFixed(1)}</td>
                          <td style={{ textAlign: 'right', fontSize: 12 }}>${parseFloat(p.price_per_gallon || 0).toFixed(3)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger)' }}>{fmt(p.total_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )

            // ── LOADS / REVENUE BREAKDOWN ─────────────────────────────
            : (
              <div>
                {/* Summary bar */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
                  {[
                    { label: 'Total Revenue', val: fmt(data.loads.reduce((s, l) => s + (parseFloat(l.rate) || 0), 0)), color: 'var(--success)' },
                    { label: 'Total Loads', val: data.loads.length, color: 'var(--brand-blue-light)' },
                    { label: 'Total Miles', val: Math.round(data.loads.reduce((s, l) => s + (parseFloat(l.miles) || 0), 0)).toLocaleString(), color: 'var(--text-primary)' },
                  ].map(s => (
                    <div key={s.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: 10, padding: '12px 16px' }}>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{s.val}</div>
                    </div>
                  ))}
                </div>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Load #</th>
                        <th>Customer</th>
                        <th>Route</th>
                        <th>Truck</th>
                        <th>Driver</th>
                        <th>Delivery</th>
                        <th style={{ textAlign: 'right' }}>Rate</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.loads.length === 0 ? (
                        <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No loads found</td></tr>
                      ) : data.loads.map(l => (
                        <tr key={l.id}>
                          <td className="mono" style={{ fontWeight: 600, color: 'var(--brand-blue-light)' }}>
                            <Link to={`/loads/${l.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{l.load_number}</Link>
                          </td>
                          <td style={{ fontSize: 12 }}>{l.customer_name || '—'}</td>
                          <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.origin_city}, {l.origin_state} → {l.destination_city}, {l.destination_state}</td>
                          <td style={{ fontSize: 12 }}>{l.truck_unit || '—'}</td>
                          <td style={{ fontSize: 12 }}>{l.driver_first ? `${l.driver_first} ${l.driver_last}` : '—'}</td>
                          <td style={{ fontSize: 12 }}>
                            {l.delivery_date && new Date(l.delivery_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            {l.delivery_time && ` @ ${l.delivery_time}`}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>{fmt(l.rate)}</td>
                          <td><StatusBadge status={l.status} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// ── Clickable KPI card ────────────────────────────────────────────────────
function KpiCard({ icon, label, value, sub, accent = '#3B82F6', onClick, clickable }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="stat-card"
      style={{
        '--accent': accent,
        cursor: clickable ? 'pointer' : 'default',
        transition: 'transform 0.15s, box-shadow 0.15s',
        transform: hovered && clickable ? 'translateY(-3px)' : 'none',
        boxShadow: hovered && clickable ? '0 8px 24px rgba(0,0,0,0.3)' : undefined,
        position: 'relative',
      }}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
      {clickable && (
        <div style={{ position: 'absolute', bottom: 8, right: 10, fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
          <FaChevronDown style={{ fontSize: 8 }} /> tap for details
        </div>
      )}
    </div>
  );
}

// ── Active load card ──────────────────────────────────────────────────────
function ActiveLoadCard({ load }) {
  const overdue = isOverdue(load);
  const delInfo = formatDeliveryInfo(load);

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${overdue ? 'rgba(239,68,68,0.5)' : 'var(--border-color)'}`,
      borderRadius: 12,
      padding: 16,
      transition: 'all 0.2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; }}
    >
      {/* Overdue banner */}
      {overdue && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '4px 10px', marginBottom: 10, fontSize: 12, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
          <FaExclamationTriangle /> Delivery time has passed — auto-mark pending
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--brand-blue-light)' }}>
            <Link to={`/loads/${load.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>{load.load_number}</Link>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{load.customer_name || '—'}</div>
        </div>
        <StatusBadge status={load.status} />
      </div>

      {/* Route */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
        <FaMapMarkerAlt style={{ color: 'var(--brand-orange)', flexShrink: 0 }} />
        <span style={{ fontWeight: 500 }}>{load.origin_city}, {load.origin_state}</span>
        <FaArrowRight style={{ color: 'var(--text-muted)', fontSize: 11 }} />
        <span style={{ fontWeight: 500 }}>{load.destination_city}, {load.destination_state}</span>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {[
          { label: 'TRUCK', val: load.truck_unit || '—' },
          { label: 'DRIVER', val: load.driver_first ? `${load.driver_first} ${load.driver_last}` : '—' },
          { label: 'RATE', val: fmt(load.rate), color: 'var(--success)' },
        ].map(item => (
          <div key={item.label} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{item.label}</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: item.color }}>{item.val}</div>
          </div>
        ))}
      </div>

      {/* Delivery time — prominently shown */}
      {delInfo && (
        <div style={{
          marginTop: 10, padding: '6px 10px', borderRadius: 8,
          background: overdue ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)',
          border: overdue ? '1px solid rgba(239,68,68,0.3)' : '1px solid transparent',
          fontSize: 12, display: 'flex', alignItems: 'center', gap: 6,
          color: overdue ? 'var(--danger)' : 'var(--text-secondary)',
          fontWeight: overdue ? 700 : 400,
        }}>
          <FaClock style={{ flexShrink: 0 }} />
          <span>Delivery: {delInfo}</span>
          {overdue && <span style={{ marginLeft: 'auto', fontSize: 11 }}>⚠ OVERDUE</span>}
        </div>
      )}

      {/* Driver phone */}
      {load.driver_phone && (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <FaPhone />
          <a href={`tel:${load.driver_phone}`} style={{ color: 'var(--brand-blue-light)', textDecoration: 'none' }}>{load.driver_phone}</a>
        </div>
      )}
    </div>
  );
}

// ── Truck status row ──────────────────────────────────────────────────────
function TruckStatusRow({ truck }) {
  const statusDot = STATUS_COLORS[truck.status] || 'var(--text-muted)';
  const delInfo = truck.delivery_date ? formatDeliveryInfo(truck) : null;

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 90, marginTop: 2 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusDot, flexShrink: 0, boxShadow: truck.status === 'active' ? `0 0 8px ${statusDot}` : 'none' }} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>{truck.unit_number}</span>
      </div>

      <div style={{ flex: 1 }}>
        {truck.first_name ? (
          <div style={{ fontSize: 13, fontWeight: 600 }}>{truck.first_name} {truck.last_name}</div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No driver</div>
        )}
        {truck.current_load_number && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            <Link to={`/loads/${truck.load_id}`} style={{ color: 'var(--brand-blue-light)', textDecoration: 'none', fontWeight: 600 }}>{truck.current_load_number}</Link>
            {truck.destination_city && ` → ${truck.destination_city}, ${truck.destination_state}`}
          </div>
        )}
        {/* Delivery time */}
        {delInfo && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
            <FaClock style={{ fontSize: 10 }} /> Del: {delInfo}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'right', minWidth: 80 }}>
        {truck.rate && <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: 13 }}>{fmt(truck.rate)}</div>}
        {!truck.current_load_number && (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            {truck.status}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main LiveStats page ───────────────────────────────────────────────────
export default function LiveStats() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedTruck, setSelectedTruck] = useState(null);
  const [drillDown, setDrillDown] = useState(null); // 'fuel' | 'loads' | 'revenue' | null

  const load = useCallback(async () => {
    try {
      const res = await api.get('/live-stats');
      setData(res.data);
      setLastUpdated(new Date());
    } catch (err) {
      toast.error('Failed to load live stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <Spinner />;
  if (!data) return <div className="alert alert-danger">Failed to load live stats.</div>;

  const { summary, active_loads, week_loads, by_truck, truck_status, pending_settlements, week } = data;

  const filteredByTruck = by_truck.filter(t => !selectedTruck || t.truck_id === selectedTruck);
  const displayLoads = selectedTruck
    ? active_loads.filter(l => l.truck_id === selectedTruck)
    : active_loads;

  const weekRevForTruck = selectedTruck ? (filteredByTruck[0]?.gross_revenue || 0) : summary.week_revenue;
  const weekFuelForTruck = selectedTruck ? (filteredByTruck[0]?.fuel_cost || 0) : summary.week_fuel;

  const overdueCount = active_loads.filter(isOverdue).length;

  // Truck list for drill-down selector
  const truckList = by_truck.length > 0 ? by_truck : truck_status.map(t => ({ truck_id: t.id, unit_number: t.unit_number }));

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg, var(--brand-blue-light), var(--brand-orange))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ⚡ Live Command Center
          </h1>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Week: {new Date(week.start + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} –{' '}
            {new Date(week.end + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            {lastUpdated && <span style={{ marginLeft: 12 }}>· Updated {lastUpdated.toLocaleTimeString()}</span>}
          </div>
        </div>
        <button onClick={load} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <FaSync /> Refresh
        </button>
      </div>

      {/* Overdue alert */}
      {overdueCount > 0 && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 16px', marginBottom: 20, fontSize: 13, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <FaExclamationTriangle />
          <strong>{overdueCount} load{overdueCount > 1 ? 's' : ''} past delivery time.</strong>
          {' '}These will be auto-marked as delivered on the next refresh. Manually revert in{' '}
          <Link to="/loads" style={{ color: 'var(--danger)', fontWeight: 700 }}>Load Management</Link> if delayed.
        </div>
      )}

      {/* Truck filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={() => setSelectedTruck(null)} className={`btn ${!selectedTruck ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '5px 14px', fontSize: 13 }}>
          All Trucks
        </button>
        {truck_status.map(t => (
          <button key={t.id} onClick={() => setSelectedTruck(t.id)} className={`btn ${selectedTruck === t.id ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '5px 14px', fontSize: 13 }}>
            {t.unit_number}
          </button>
        ))}
      </div>

      {/* KPI cards — clickable for drill-down */}
      <div className="stat-grid mb-24">
        <KpiCard
          icon={<FaDollarSign />} label="Week Revenue"
          value={fmt(weekRevForTruck)} sub="Click for load breakdown"
          accent="#10B981" clickable
          onClick={() => setDrillDown('revenue')}
        />
        <KpiCard
          icon={<FaGasPump />} label="Week Fuel"
          value={fmt(weekFuelForTruck)} sub="Click for fuel breakdown"
          accent="#F97316" clickable
          onClick={() => setDrillDown('fuel')}
        />
        <KpiCard
          icon={<FaChartBar />} label="Net After Fuel"
          value={fmt(weekRevForTruck - weekFuelForTruck)} sub="Before other deductions"
          accent="#8B5CF6"
        />
        <KpiCard
          icon={<FaBox />} label="Active Loads"
          value={displayLoads.length} sub="Click for breakdown"
          accent="#3B82F6" clickable
          onClick={() => setDrillDown('loads')}
        />
        <KpiCard
          icon={<FaCheckCircle />} label="Delivered This Week"
          value={summary.week_loads} sub={`${Math.round(summary.week_miles || 0).toLocaleString()} miles`}
          accent="#059669"
        />
        {pending_settlements.length > 0 && (
          <KpiCard
            icon={<FaExclamationTriangle />} label="Pending Settlements"
            value={pending_settlements.length} sub="Drivers need settlement"
            accent="#EF4444"
          />
        )}
      </div>

      {/* Two-column layout */}
      <div className="grid-2 mb-24">
        {/* Active Loads */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FaTruck style={{ color: 'var(--brand-blue-light)' }} />
            Active Loads ({displayLoads.length})
            {overdueCount > 0 && (
              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(239,68,68,0.12)', color: 'var(--danger)', fontWeight: 700 }}>
                {overdueCount} overdue
              </span>
            )}
          </div>
          {displayLoads.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-color)' }}>
              No active loads
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {displayLoads.map(l => <ActiveLoadCard key={l.id} load={l} />)}
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Truck Status */}
          <div className="card">
            <div className="card-header">
              <div className="card-title"><FaTruck style={{ marginRight: 8 }} />Fleet Status</div>
            </div>
            {truck_status.map(t => <TruckStatusRow key={t.id} truck={t} />)}
          </div>

          {/* Revenue by truck — clickable */}
          <div className="card">
            <div className="card-header">
              <div className="card-title"><FaChartBar style={{ marginRight: 8 }} />Week Revenue by Truck</div>
              <Link to="/reports" className="btn btn-secondary btn-sm">Reports →</Link>
            </div>
            {by_truck.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No revenue this week</div>
            ) : (
              by_truck
                .filter(t => !selectedTruck || t.truck_id === selectedTruck)
                .map(t => (
                  <div
                    key={t.truck_id}
                    style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer' }}
                    onClick={() => { setSelectedTruck(t.truck_id); setDrillDown('revenue'); }}
                    title="Click for load breakdown"
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{t.unit_number}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {t.first_name ? `${t.first_name} ${t.last_name}` : '—'} · {t.load_count} loads
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: 'var(--success)', fontSize: 14 }}>{fmt(t.gross_revenue)}</div>
                        <div style={{ fontSize: 12, color: 'var(--danger)' }}>Fuel: -{fmt(t.fuel_cost)}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: t.net_after_fuel >= 0 ? 'var(--brand-blue-light)' : 'var(--danger)' }}>
                          Net: {fmt(t.net_after_fuel)}
                        </div>
                      </div>
                    </div>
                    <div style={{ marginTop: 6, height: 3, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }}>
                      <div style={{
                        height: '100%', borderRadius: 4,
                        width: `${Math.min(100, (t.gross_revenue / Math.max(...by_truck.map(x => x.gross_revenue), 1)) * 100)}%`,
                        background: 'linear-gradient(90deg, var(--brand-blue), var(--brand-blue-light))',
                      }} />
                    </div>
                  </div>
                ))
            )}
          </div>

          {/* Pending Settlements */}
          {pending_settlements.length > 0 && (
            <div className="card" style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.04)' }}>
              <div className="card-header">
                <div className="card-title" style={{ color: 'var(--danger)' }}>
                  <FaExclamationTriangle style={{ marginRight: 8 }} />Pending Settlements
                </div>
                <Link to="/settlements" className="btn btn-secondary btn-sm">Go →</Link>
              </div>
              {pending_settlements.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(239,68,68,0.1)' }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{d.first_name} {d.last_name}</div>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)', marginRight: 8 }}>{d.week_load_count} loads</span>
                    <span style={{ fontWeight: 700, color: 'var(--success)' }}>{fmt(d.week_revenue)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delivered this week */}
      <div className="card">
        <div className="card-header">
          <div>
            <div className="card-title"><FaCalendarWeek style={{ marginRight: 8 }} />Delivered This Week</div>
            <div className="card-subtitle">{week.start} — {week.end}</div>
          </div>
          <Link to="/loads" className="btn btn-secondary btn-sm">All Loads →</Link>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Load #</th>
                <th>Customer</th>
                <th>Route</th>
                <th>Truck</th>
                <th>Driver</th>
                <th>Delivery</th>
                <th style={{ textAlign: 'right' }}>Rate</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {week_loads
                .filter(l => !selectedTruck || truck_status.find(t => t.unit_number === l.truck_unit && t.id === selectedTruck))
                .slice(0, 20)
                .map(l => (
                  <tr key={l.id}>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      <Link to={`/loads/${l.id}`} style={{ color: 'var(--brand-blue-light)', textDecoration: 'none' }}>{l.load_number}</Link>
                    </td>
                    <td style={{ fontSize: 13 }}>{l.customer_name || '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l.origin_city}, {l.origin_state} → {l.destination_city}, {l.destination_state}</td>
                    <td>{l.truck_unit || '—'}</td>
                    <td style={{ fontSize: 13 }}>{l.driver_first ? `${l.driver_first} ${l.driver_last}` : '—'}</td>
                    <td style={{ fontSize: 12 }}>
                      {l.delivery_date && new Date(l.delivery_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {l.delivery_time && <span style={{ color: 'var(--text-muted)' }}> @ {l.delivery_time}</span>}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--success)' }}>{fmt(l.rate)}</td>
                    <td><StatusBadge status={l.status} /></td>
                  </tr>
                ))}
              {week_loads.length === 0 && (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No deliveries this week yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drill-down modal */}
      {drillDown && (
        <DrillDownModal
          type={drillDown}
          weekStart={week.start}
          weekEnd={week.end}
          trucks={truckList}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}
