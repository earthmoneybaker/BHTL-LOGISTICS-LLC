import {
  FaTruck, FaGasPump, FaDollarSign, FaBox, FaMapMarkerAlt, FaUser,
  FaSync, FaExclamationTriangle, FaCheck, FaArrowRight, FaClock,
  FaChartBar, FaPhone, FaCalendarWeek, FaFileAlt
} from 'react-icons/fa';
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { Spinner, StatusBadge, formatCurrency, formatDate } from '../../components/ui';
import toast from 'react-hot-toast';

const fmt = (n) => formatCurrency(n);

const STATUS_COLORS = {
  booked: '#3B82F6',
  dispatched: '#8B5CF6',
  in_transit: '#F97316',
  delivered: '#10B981',
  invoiced: '#F59E0B',
  paid: '#059669',
  active: '#10B981',
  in_shop: '#F59E0B',
  out_of_service: '#EF4444',
};

function KpiCard({ icon, label, value, sub, accent = '#3B82F6', large }) {
  return (
    <div className="stat-card" style={{ '--accent': accent }}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={large ? { fontSize: 28 } : {}}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function ActiveLoadCard({ load }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-color)',
      borderRadius: 12,
      padding: 16,
      transition: 'all 0.2s',
    }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(59,130,246,0.4)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.transform = 'none'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--brand-blue-light)' }}>{load.load_number}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{load.customer_name || '—'}</div>
        </div>
        <StatusBadge status={load.status} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
        <FaMapMarkerAlt style={{ color: 'var(--brand-orange)', flexShrink: 0 }} />
        <span style={{ fontWeight: 500 }}>{load.origin_city}, {load.origin_state}</span>
        <FaArrowRight style={{ color: 'var(--text-muted)', fontSize: 11 }} />
        <span style={{ fontWeight: 500 }}>{load.destination_city}, {load.destination_state}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>TRUCK</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{load.truck_unit || '—'}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>DRIVER</div>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{load.driver_first ? `${load.driver_first} ${load.driver_last}` : '—'}</div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '8px 10px' }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>RATE</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>{fmt(load.rate)}</div>
        </div>
      </div>

      {load.delivery_date && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <FaClock />
          Del: {new Date(load.delivery_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          {load.delivery_time && ` @ ${load.delivery_time}`}
        </div>
      )}

      {load.driver_phone && (
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <FaPhone />
          <a href={`tel:${load.driver_phone}`} style={{ color: 'var(--brand-blue-light)', textDecoration: 'none' }}>{load.driver_phone}</a>
        </div>
      )}
    </div>
  );
}

function TruckStatusRow({ truck }) {
  const statusDot = STATUS_COLORS[truck.status] || 'var(--text-muted)';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '14px 0',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 100 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusDot, flexShrink: 0, boxShadow: truck.status === 'active' ? `0 0 8px ${statusDot}` : 'none' }} />
        <span style={{ fontWeight: 700, fontSize: 14 }}>{truck.unit_number}</span>
      </div>

      <div style={{ flex: 1 }}>
        {truck.first_name ? (
          <div style={{ fontSize: 13, fontWeight: 600 }}>{truck.first_name} {truck.last_name}</div>
        ) : (
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No driver assigned</div>
        )}
        {truck.current_load_number && (
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Load: <span style={{ color: 'var(--brand-blue-light)' }}>{truck.current_load_number}</span>
            {truck.destination_city && ` → ${truck.destination_city}, ${truck.destination_state}`}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'right' }}>
        {truck.rate && <div style={{ fontWeight: 700, color: 'var(--success)' }}>{fmt(truck.rate)}</div>}
        {truck.delivery_date && (
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Del {new Date(truck.delivery_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        )}
        {!truck.current_load_number && (
          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            {truck.status}
          </span>
        )}
      </div>
    </div>
  );
}

export default function LiveStats() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [selectedTruck, setSelectedTruck] = useState(null); // null = all

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
    const interval = setInterval(load, 60000); // refresh every minute
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <Spinner />;
  if (!data) return <div className="alert alert-danger">Failed to load live stats.</div>;

  const { summary, active_loads, week_loads, by_truck, truck_status, pending_settlements, week } = data;

  const filteredByTruck = by_truck.filter(t => !selectedTruck || t.truck_id === selectedTruck);
  const displayLoads = selectedTruck
    ? active_loads.filter(l => filteredByTruck.some(t => t.truck_id === l.truck_id))
    : active_loads;

  const weekRevForTruck = selectedTruck ? (filteredByTruck[0]?.gross_revenue || 0) : summary.week_revenue;
  const weekFuelForTruck = selectedTruck ? (filteredByTruck[0]?.fuel_cost || 0) : summary.week_fuel;

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, background: 'linear-gradient(135deg, var(--brand-blue-light), var(--brand-orange))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Live Command Center
          </h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Week of {new Date(week.start + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} –{' '}
            {new Date(week.end + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {lastUpdated && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
          <button onClick={load} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FaSync /> Refresh
          </button>
        </div>
      </div>

      {/* Truck filter */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        <button
          onClick={() => setSelectedTruck(null)}
          className={`btn ${!selectedTruck ? 'btn-primary' : 'btn-secondary'}`}
          style={{ padding: '6px 16px', fontSize: 13 }}
        >
          All Trucks
        </button>
        {by_truck.map(t => (
          <button
            key={t.truck_id}
            onClick={() => setSelectedTruck(t.truck_id)}
            className={`btn ${selectedTruck === t.truck_id ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 16px', fontSize: 13 }}
          >
            {t.unit_number}
          </button>
        ))}
      </div>

      {/* KPI Summary */}
      <div className="stat-grid mb-24">
        <KpiCard icon={<FaDollarSign />} label="Week Revenue" value={fmt(weekRevForTruck)} sub={selectedTruck ? 'This truck' : 'All trucks'} accent="#10B981" />
        <KpiCard icon={<FaGasPump />} label="Week Fuel" value={fmt(weekFuelForTruck)} sub="Fuel cost" accent="#F97316" />
        <KpiCard icon={<FaChartBar />} label="Net After Fuel" value={fmt(weekRevForTruck - weekFuelForTruck)} sub="Before other deductions" accent="#8B5CF6" />
        <KpiCard icon={<FaBox />} label="Active Loads" value={displayLoads.length} sub="In motion" accent="#3B82F6" />
        <KpiCard icon={<FaCheck />} label="Delivered This Week" value={summary.week_loads} sub={`${Math.round(summary.week_miles || 0).toLocaleString()} miles`} accent="#059669" />
        {pending_settlements.length > 0 && (
          <KpiCard icon={<FaExclamationTriangle />} label="Pending Settlements" value={pending_settlements.length} sub="Drivers need settlement" accent="#EF4444" />
        )}
      </div>

      {/* Two column layout */}
      <div className="grid-2 mb-24">
        {/* Active Loads */}
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FaTruck style={{ color: 'var(--brand-blue-light)' }} /> Active Loads ({displayLoads.length})
          </div>
          {displayLoads.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-card)', borderRadius: 12, border: '1px solid var(--border-color)' }}>
              No active loads at this time
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {displayLoads.map(l => <ActiveLoadCard key={l.id} load={l} />)}
            </div>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Truck Status */}
          <div className="card">
            <div className="card-header">
              <div className="card-title"><FaTruck style={{ marginRight: 8 }} />Truck Status</div>
            </div>
            {truck_status.map(t => <TruckStatusRow key={t.id} truck={t} />)}
          </div>

          {/* Revenue by Truck */}
          <div className="card">
            <div className="card-header">
              <div className="card-title"><FaChartBar style={{ marginRight: 8 }} />Week Revenue by Truck</div>
              <Link to="/reports" className="btn btn-secondary btn-sm">Reports →</Link>
            </div>
            {by_truck.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>No revenue recorded this week</div>
            ) : (
              by_truck
                .filter(t => !selectedTruck || t.truck_id === selectedTruck)
                .map(t => (
                  <div key={t.truck_id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>{t.unit_number}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {t.first_name ? `${t.first_name} ${t.last_name}` : '—'} · {t.load_count} loads
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 700, color: 'var(--success)' }}>{fmt(t.gross_revenue)}</div>
                        <div style={{ fontSize: 12, color: 'var(--danger)' }}>Fuel: -{fmt(t.fuel_cost)}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: t.net_after_fuel >= 0 ? 'var(--brand-blue-light)' : 'var(--danger)' }}>
                          Net: {fmt(t.net_after_fuel)}
                        </div>
                      </div>
                    </div>
                    {/* Revenue bar */}
                    <div style={{ marginTop: 8, height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }}>
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

          {/* Pending Settlements Alert */}
          {pending_settlements.length > 0 && (
            <div className="card" style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.06)' }}>
              <div className="card-header">
                <div className="card-title" style={{ color: 'var(--danger)' }}>
                  <FaExclamationTriangle style={{ marginRight: 8 }} />Pending Settlements
                </div>
                <Link to="/settlements" className="btn btn-secondary btn-sm">Go →</Link>
              </div>
              {pending_settlements.map(d => (
                <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
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

      {/* Week Loads Table */}
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
                    <td className="mono" style={{ fontWeight: 600, color: 'var(--brand-blue-light)' }}>
                      <Link to={`/loads/${l.id}`} style={{ color: 'var(--brand-blue-light)', textDecoration: 'none' }}>{l.load_number}</Link>
                    </td>
                    <td style={{ fontSize: 13 }}>{l.customer_name || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{l.origin_city}, {l.origin_state} → {l.destination_city}, {l.destination_state}</td>
                    <td>{l.truck_unit || '—'}</td>
                    <td>{l.driver_first ? `${l.driver_first} ${l.driver_last}` : '—'}</td>
                    <td style={{ fontSize: 12 }}>{l.delivery_date ? new Date(l.delivery_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
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
    </div>
  );
}
