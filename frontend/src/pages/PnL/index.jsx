import { FaChartBar, FaCreditCard, FaMoneyBillWave, FaSearch, FaChartLine, FaDollarSign, FaChartArea } from 'react-icons/fa';
import { categoryLabel } from '../../utils/expenseCategories';
import { useState, useEffect } from 'react';
import api, { downloadFile } from '../../api/client';
import { Spinner, PageHeader, formatCurrency } from '../../components/ui';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import toast from 'react-hot-toast';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export default function PnL() {
  const [data, setData] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('summary');
  const [filters, setFilters] = useState({
    period_type: 'month',
    year: new Date().getFullYear(),
    period: new Date().getMonth() + 1,
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [pnlRes, trendRes] = await Promise.all([
        api.get('/pnl', { params: filters }),
        api.get('/pnl/trend'),
      ]);
      setData(pnlRes.data);
      setTrend(trendRes.data);
    } catch (err) { toast.error('Failed to load P&L data'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, [filters]);

  const exportCsv = () => downloadFile(`/pnl/export/csv?start=${data?.start}&end=${data?.end}&label=${data?.label}`, `pnl-${data?.label}.csv`);
  const exportPdf = () => downloadFile(`/pnl/export/pdf?start=${data?.start}&end=${data?.end}&label=${data?.label}`, `pnl-${data?.label}.pdf`);

  const f = (k) => (e) => setFilters(p => ({ ...p, [k]: e.target.value }));

  return (
    <div>
      <PageHeader title="Profit & Loss"
        subtitle="Automatic — live from invoices, expenses, and payroll"
        actions={
          <div className="flex gap-8">
            <button className="btn btn-secondary" onClick={exportCsv}>⬇ CSV</button>
            <button className="btn btn-secondary" onClick={exportPdf}>⬇ PDF</button>
          </div>
        }
      />

      {/* Period Selector */}
      <div className="card mb-20" style={{ padding:'16px 20px' }}>
        <div className="flex gap-12 items-center flex-wrap">
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Period Type</label>
            <select className="form-control" value={filters.period_type} onChange={f('period_type')}>
              <option value="month">Monthly</option>
              <option value="quarter">Quarterly</option>
              <option value="year">Yearly</option>
            </select>
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">Year</label>
            <select className="form-control" value={filters.year} onChange={f('year')}>
              {[2023,2024,2025,2026].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
          {filters.period_type === 'month' && (
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">Month</label>
              <select className="form-control" value={filters.period} onChange={f('period')}>
                {MONTHS.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
            </div>
          )}
          {filters.period_type === 'quarter' && (
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">Quarter</label>
              <select className="form-control" value={filters.period} onChange={f('period')}>
                <option value="1">Q1 (Jan–Mar)</option><option value="2">Q2 (Apr–Jun)</option>
                <option value="3">Q3 (Jul–Sep)</option><option value="4">Q4 (Oct–Dec)</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div className="tabs">
        {[['summary','<FaChartBar /> Summary'],['breakdown','<FaSearch /> Breakdown'],['trend','<FaChartLine /> 12-Month Trend']].map(([t,l]) => (
          <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {loading ? <Spinner /> : !data ? null : (
        <>
          {tab === 'summary' && (
            <div>
              <div className="stat-grid mb-20">
                <div className="stat-card" style={{ '--accent':'var(--success)' }}>
                  <div className="stat-icon"><FaDollarSign /></div>
                  <div className="stat-label">Total Revenue</div>
                  <div className="stat-value" style={{ fontSize:'22px' }}>{formatCurrency(data.summary.revenue)}</div>
                  <div className="stat-sub">Invoiced in period</div>
                </div>
                <div className="stat-card" style={{ '--accent':'var(--danger)' }}>
                  <div className="stat-icon"><FaCreditCard /></div>
                  <div className="stat-label">Total Expenses</div>
                  <div className="stat-value" style={{ fontSize:'22px', color:'var(--danger)' }}>{formatCurrency(data.summary.expenses)}</div>
                </div>
                <div className="stat-card" style={{ '--accent':'var(--warning)' }}>
                  <div className="stat-icon"><FaMoneyBillWave /></div>
                  <div className="stat-label">Total Payroll</div>
                  <div className="stat-value" style={{ fontSize:'22px', color:'var(--warning)' }}>{formatCurrency(data.summary.payroll)}</div>
                </div>
                <div className="stat-card" style={{ '--accent': data.summary.net_profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  <div className="stat-icon">{data.summary.net_profit >= 0 ? <FaChartLine /> : <FaChartArea />}</div>
                  <div className="stat-label">Net Profit / Loss</div>
                  <div className="stat-value" style={{ fontSize:'22px', color: data.summary.net_profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {formatCurrency(data.summary.net_profit)}
                  </div>
                </div>
              </div>

              <div className="grid-2">
                <div className="card">
                  <div className="card-title mb-16">Revenue Breakdown</div>
                  {data.invoice_detail.length === 0 ? <div className="no-data">No invoices in this period</div> : (
                    <div className="table-wrapper">
                      <table className="data-table">
                        <thead><tr><th>Invoice</th><th>Customer</th><th>Date</th><th>Amount</th></tr></thead>
                        <tbody>
                          {data.invoice_detail.map((inv,i) => (
                            <tr key={i}>
                              <td className="mono">{inv.invoice_number}</td>
                              <td className="truncate">{inv.customer_name}</td>
                              <td className="muted">{inv.date_issued}</td>
                              <td style={{ fontWeight:600, color:'var(--success)' }}>{formatCurrency(inv.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="card">
                  <div className="card-title mb-16">Expense Breakdown</div>
                  {data.expense_detail.length === 0 ? <div className="no-data">No expenses in this period</div> : (
                    data.expense_detail.map(exp => {
                      const total = data.summary.expenses;
                      const pct = total > 0 ? (parseFloat(exp.total) / total * 100).toFixed(1) : 0;
                      return (
                        <div key={exp.category} className="pnl-bar-wrapper">
                          <div className="pnl-bar-label">
                            <span>{categoryLabel(exp.category)}</span>
                            <span>{formatCurrency(exp.total)} ({pct}%)</span>
                          </div>
                          <div className="pnl-bar-track">
                            <div className="pnl-bar-fill pnl-bar-expense" style={{ width:`${pct}%` }} />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'breakdown' && (
            <div className="grid-2">
              <div className="card">
                <div className="card-title mb-16">By Truck</div>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead><tr><th>Truck</th><th>Revenue</th><th>Expenses</th><th>Net</th></tr></thead>
                    <tbody>
                      {data.truck_breakdown.length === 0 ? <tr><td colSpan={4} className="no-data">No data</td></tr>
                        : data.truck_breakdown.map(t => (
                        <tr key={t.truck_id}>
                          <td style={{ fontWeight:700 }}>#{t.unit_number}</td>
                          <td style={{ color:'var(--success)' }}>{formatCurrency(t.revenue)}</td>
                          <td style={{ color:'var(--danger)' }}>{formatCurrency(t.expenses)}</td>
                          <td style={{ fontWeight:700, color: (t.revenue - t.expenses) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {formatCurrency(parseFloat(t.revenue) - parseFloat(t.expenses))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="card">
                <div className="card-title mb-16">By Driver</div>
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead><tr><th>Driver</th><th>Revenue</th><th>Payroll</th><th>Net</th></tr></thead>
                    <tbody>
                      {data.driver_breakdown.length === 0 ? <tr><td colSpan={4} className="no-data">No data</td></tr>
                        : data.driver_breakdown.map(d => (
                        <tr key={d.driver_id}>
                          <td style={{ fontWeight:600 }}>{d.first_name} {d.last_name}</td>
                          <td style={{ color:'var(--success)' }}>{formatCurrency(d.revenue)}</td>
                          <td style={{ color:'var(--warning)' }}>{formatCurrency(d.payroll)}</td>
                          <td style={{ fontWeight:700, color: (d.revenue - d.payroll) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                            {formatCurrency(parseFloat(d.revenue) - parseFloat(d.payroll))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {tab === 'trend' && (
            <div className="card">
              <div className="card-title mb-16">12-Month Revenue & Profit Trend</div>
              <div className="chart-wrapper" style={{ height: 340 }}>
                <ResponsiveContainer>
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill:'var(--text-muted)', fontSize:11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                    <Tooltip
                      contentStyle={{ background:'var(--bg-card)', border:'1px solid var(--border-color)', borderRadius:'8px' }}
                      formatter={(v) => [`$${v.toLocaleString()}`]}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="revenue" stroke="#2563EB" strokeWidth={2.5} dot={{ r:4 }} name="Revenue" />
                    <Line type="monotone" dataKey="expenses" stroke="#EF4444" strokeWidth={2} dot={{ r:3 }} name="Expenses" strokeDasharray="4 2" />
                    <Line type="monotone" dataKey="net_profit" stroke="#10B981" strokeWidth={2.5} dot={{ r:4 }} name="Net Profit" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="grid-4 mt-20">
                {trend.slice(-4).map(m => (
                  <div key={m.label} className="stat-card" style={{ '--accent': m.net_profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    <div className="stat-label">{m.label}</div>
                    <div className="stat-value" style={{ fontSize:'16px', color: m.net_profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(m.net_profit)}</div>
                    <div className="stat-sub">Rev: {formatCurrency(m.revenue)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
