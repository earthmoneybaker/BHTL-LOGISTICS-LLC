import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { StatusBadge, ExpirationBadge, Spinner, formatCurrency, formatDate, daysUntil } from '../../components/ui';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

const STATUS_ORDER = ['booked', 'dispatched', 'in_transit', 'delivered', 'invoiced'];

const STATUS_LABELS = {
  booked: 'Booked',
  dispatched: 'Dispatched',
  in_transit: 'In Transit',
  delivered: 'Delivered',
  invoiced: 'Invoiced',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

const STATUS_COLORS = {
  booked: '#3B82F6',
  dispatched: '#8B5CF6',
  in_transit: '#F97316',
  delivered: '#10B981',
  invoiced: '#F59E0B',
  paid: '#059669',
};

export default function Dashboard() {
  const { isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [dashRes, trendRes] = await Promise.all([
          api.get('/dashboard'),
          isAdmin ? api.get('/pnl/trend') : Promise.resolve({ data: [] }),
        ]);
        setData(dashRes.data);
        setTrend(trendRes.data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadDashboard();
  }, [isAdmin]);

  if (loading) return <Spinner />;
  if (!data) return <div className="alert alert-danger">Failed to load dashboard data.</div>;

  const totalActiveLoads = data.load_status.reduce((acc, s) => acc + parseInt(s.count), 0);
  const expirationsDanger = data.expirations.filter(e => daysUntil(e.expiration_date) <= 30);
  const expirationsWarning = data.expirations.filter(e => {
    const d = daysUntil(e.expiration_date);
    return d > 30 && d <= 90;
  });

  const loadStatusData = STATUS_ORDER.map(s => ({
    name: STATUS_LABELS[s] || s,
    count: parseInt(data.load_status.find(r => r.status === s)?.count || 0),
    color: STATUS_COLORS[s],
  }));

  return (
    <div>
      {/* Expiration Alert Banner */}
      {expirationsDanger.length > 0 && (
        <div className="alert alert-danger mb-16">
          🚨 <strong>{expirationsDanger.length} item{expirationsDanger.length > 1 ? 's' : ''}</strong> expiring within 30 days — 
          <Link to="/compliance" style={{ color: '#FCA5A5', marginLeft: '6px', textDecoration: 'underline' }}>
            View all →
          </Link>
        </div>
      )}

      {/* KPI Stats */}
      <div className="stat-grid mb-24">
        <div className="stat-card" style={{ '--accent': '#3B82F6' }}>
          <div className="stat-icon">📦</div>
          <div className="stat-label">Active Loads</div>
          <div className="stat-value">{totalActiveLoads}</div>
          <div className="stat-sub">Not yet paid</div>
        </div>

        <div className="stat-card" style={{ '--accent': '#10B981' }}>
          <div className="stat-icon">🚛</div>
          <div className="stat-label">Trucks Active</div>
          <div className="stat-value">{data.truck_status?.active || 0}</div>
          <div className="stat-sub">
            {data.truck_status?.in_shop || 0} in shop · {data.truck_status?.out_of_service || 0} OOS
          </div>
        </div>

        <div className="stat-card" style={{ '--accent': '#F59E0B' }}>
          <div className="stat-icon">📄</div>
          <div className="stat-label">Unpaid Invoices</div>
          <div className="stat-value">
            {formatCurrency(data.invoice_summary?.unpaid_amount)}
          </div>
          <div className="stat-sub">{data.invoice_summary?.unpaid_count || 0} invoices outstanding</div>
        </div>

        <div className="stat-card" style={{ '--accent': '#EF4444' }}>
          <div className="stat-icon">⚠️</div>
          <div className="stat-label">Overdue Invoices</div>
          <div className="stat-value" style={{ color: 'var(--danger)' }}>
            {formatCurrency(data.invoice_summary?.overdue_amount)}
          </div>
          <div className="stat-sub">{data.invoice_summary?.overdue_count || 0} overdue</div>
        </div>

        {isAdmin && (
          <>
            <div className="stat-card" style={{ '--accent': '#059669' }}>
              <div className="stat-icon">💰</div>
              <div className="stat-label">Revenue This Month</div>
              <div className="stat-value">{formatCurrency(data.revenue?.this_month)}</div>
              <div className="stat-sub">
                Last month: {formatCurrency(data.revenue?.last_month)}
              </div>
            </div>

            <div className="stat-card" style={{ '--accent': '#8B5CF6' }}>
              <div className="stat-icon">🔔</div>
              <div className="stat-label">Expiration Alerts</div>
              <div className="stat-value" style={{ color: expirationsDanger.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
                {expirationsDanger.length}
              </div>
              <div className="stat-sub">{expirationsWarning.length} within 90 days</div>
            </div>
          </>
        )}
      </div>

      {/* Main Content Grid */}
      <div className="grid-2 mb-20" style={{ gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr 1fr' }}>
        {/* Load Status Chart */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Load Pipeline</div>
              <div className="card-subtitle">Current active loads by status</div>
            </div>
            <Link to="/loads" className="btn btn-secondary btn-sm">View All →</Link>
          </div>
          <div className="chart-wrapper" style={{ height: 220 }}>
            <ResponsiveContainer>
              <BarChart data={loadStatusData} barSize={32}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                  labelStyle={{ color: 'var(--text-primary)' }}
                  cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                />
                <Bar dataKey="count" fill="#2563EB" radius={[4,4,0,0]}>
                  {loadStatusData.map((entry, i) => (
                    <rect key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* P&L Trend (admin only) or Recent Loads */}
        {isAdmin && trend.length > 0 ? (
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Revenue Trend</div>
                <div className="card-subtitle">Last 12 months</div>
              </div>
              <Link to="/pnl" className="btn btn-secondary btn-sm">Full P&L →</Link>
            </div>
            <div className="chart-wrapper" style={{ height: 220 }}>
              <ResponsiveContainer>
                <LineChart data={trend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}
                    formatter={(v) => [`$${v.toLocaleString()}`, '']}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2} dot={false} name="Revenue" />
                  <Line type="monotone" dataKey="net_profit" stroke="#10B981" strokeWidth={2} dot={false} name="Net Profit" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="card-header">
              <div className="card-title">Fleet Status</div>
            </div>
            <div>
              {[
                { label: 'Active', count: data.truck_status?.active || 0, color: 'var(--success)' },
                { label: 'In Shop', count: data.truck_status?.in_shop || 0, color: 'var(--warning)' },
                { label: 'Out of Service', count: data.truck_status?.out_of_service || 0, color: 'var(--danger)' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: s.color }} />
                    <span style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>{s.label}</span>
                  </div>
                  <span style={{ fontSize: '20px', fontWeight: 800, color: s.color }}>{s.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bottom row */}
      <div className="grid-2">
        {/* Expiration Alerts */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Expiration Alerts</div>
              <div className="card-subtitle">Next 90 days</div>
            </div>
            <Link to="/compliance" className="btn btn-secondary btn-sm">All Docs →</Link>
          </div>
          {data.expirations.length === 0 ? (
            <div className="empty-state" style={{ padding: '30px' }}>
              <div style={{ fontSize: '32px' }}>✅</div>
              <div className="empty-state-title">All clear — no expirations within 90 days</div>
            </div>
          ) : (
            <div className="expiration-list">
              {data.expirations.slice(0, 8).map((item, i) => {
                const days = daysUntil(item.expiration_date);
                const urgency = days < 0 ? 'danger' : days <= 30 ? 'danger' : 'warning';
                return (
                  <div key={i} className={`expiration-item ${urgency}`}>
                    <div style={{ flex: 1 }}>
                      <div className="expiration-item-name">{item.entity_name}</div>
                      <div className="expiration-item-type">{item.doc_type}</div>
                    </div>
                    <div className={`expiration-item-date text-${urgency === 'danger' ? 'danger' : 'warning'}`}>
                      {days < 0 ? `EXPIRED ${Math.abs(days)}d ago` : days === 0 ? 'TODAY' : `${days}d`}
                    </div>
                  </div>
                );
              })}
              {data.expirations.length > 8 && (
                <Link to="/compliance" style={{ textAlign: 'center', display: 'block', color: 'var(--brand-blue-light)', fontSize: '13px', padding: '8px', textDecoration: 'none' }}>
                  +{data.expirations.length - 8} more →
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Recent Loads */}
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Recent Loads</div>
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
                  <th>Status</th>
                  <th>Rate</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_loads.length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>No loads yet</td></tr>
                ) : (
                  data.recent_loads.map(load => (
                    <tr key={load.id}>
                      <td className="mono">
                        <Link to={`/loads/${load.id}`} style={{ color: 'var(--brand-blue-light)', textDecoration: 'none', fontWeight: 600 }}>
                          {load.load_number}
                        </Link>
                      </td>
                      <td className="truncate">{load.customer_name || '—'}</td>
                      <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {load.pickup_date ? new Date(load.pickup_date).toLocaleDateString() : '—'}
                      </td>
                      <td><StatusBadge status={load.status} /></td>
                      <td>{formatCurrency(load.rate)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
