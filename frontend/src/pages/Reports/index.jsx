import {
  FaFileAlt, FaPlus, FaCalculator, FaTrash, FaEye, FaWhatsapp,
  FaCheck, FaChevronLeft, FaPrint, FaTimes, FaEdit, FaToggleOn, FaToggleOff,
  FaGasPump, FaTruck, FaUser, FaDollarSign, FaMinus, FaDownload,
  FaFilter, FaCalendarWeek, FaListUl, FaCog, FaFilePdf, FaShare
} from 'react-icons/fa';
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../../api/client';
import {
  Spinner, EmptyState, PageHeader, Modal, formatCurrency, formatDate, ConfirmModal
} from '../../components/ui';
import toast from 'react-hot-toast';
import { downloadReportPDF, shareReportViaWhatsApp, downloadWeeklySummaryPDF } from '../../utils/reportPDF';

// ── Utility ───────────────────────────────────────────────────────────
function getMondayOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function getSundayOfWeek(date = new Date()) {
  const monday = new Date(getMondayOfWeek(date));
  monday.setDate(monday.getDate() + 6);
  return monday.toISOString().slice(0, 10);
}

const fmt = (n) => formatCurrency(n);
const fmtDate = (d) => d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

// ── Report Print View ──────────────────────────────────────────────────
function ReportPrintView({ report, loadItems }) {
  const customDed = Array.isArray(report.custom_deductions)
    ? report.custom_deductions
    : (typeof report.custom_deductions === 'string'
        ? JSON.parse(report.custom_deductions || '[]') : []);

  const [generating, setGenerating] = useState(false);

  const handleDownloadPDF = async () => {
    setGenerating(true);
    try {
      const filename = await downloadReportPDF(report, loadItems);
      toast.success(`PDF downloaded: ${filename}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate PDF');
    } finally {
      setGenerating(false);
    }
  };

  const handleWhatsApp = async () => {
    setGenerating(true);
    try {
      const result = await shareReportViaWhatsApp(report, loadItems);
      if (result.method === 'native_share') {
        toast.success('Report shared via WhatsApp!');
      } else if (result.method === 'download_then_whatsapp') {
        toast.success('PDF downloaded! Attach it to your WhatsApp message.', { duration: 5000 });
      } else if (result.method === 'cancelled') {
        // User cancelled the share sheet — no toast needed
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate PDF');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = async () => {
    // Generate PDF and open in new tab for printing
    setGenerating(true);
    try {
      const { generateReportPDF } = await import('../../utils/reportPDF');
      const doc = await generateReportPDF(report, loadItems);
      const pdfUrl = doc.output('bloburl');
      window.open(pdfUrl, '_blank');
    } catch {
      window.print();
    } finally {
      setGenerating(false);
    }
  };


  return (
    <div className="report-print-view">
      <div className="report-print-header">
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--brand-blue-light)' }}>
            BHTL Logistics LLC
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Dayton, Ohio</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Weekly Report</div>
          <div className="mono" style={{ fontSize: 13, color: 'var(--brand-orange)' }}>{report.report_number}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>PERIOD</div>
          <div style={{ fontWeight: 700 }}>{fmtDate(report.period_start)} — {fmtDate(report.period_end)}</div>
        </div>
        {report.truck_unit && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>TRUCK</div>
            <div style={{ fontWeight: 700 }}>{report.truck_unit} {report.make} {report.model}</div>
          </div>
        )}
        {report.driver_first && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>DRIVER</div>
            <div style={{ fontWeight: 700 }}>{report.driver_first} {report.driver_last}</div>
            {report.driver_phone && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{report.driver_phone}</div>}
          </div>
        )}
      </div>

      {/* Loads Table */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <div className="card-title">Load Breakdown</div>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {loadItems.filter(l => l.included).length} loads included
          </span>
        </div>
        <div className="table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Load #</th>
                <th>Route</th>
                <th>Pickup</th>
                <th>Delivery</th>
                <th>Miles</th>
                <th style={{ textAlign: 'right' }}>Rate</th>
                <th style={{ textAlign: 'right' }}>Driver Pay</th>
              </tr>
            </thead>
            <tbody>
              {loadItems.filter(l => l.included).map(item => (
                <tr key={item.id}>
                  <td className="mono" style={{ fontWeight: 600 }}>{item.load_number}</td>
                  <td style={{ fontSize: 12 }}>{item.origin} → {item.destination}</td>
                  <td style={{ fontSize: 12 }}>{fmtDate(item.pickup_date)}</td>
                  <td style={{ fontSize: 12 }}>{fmtDate(item.delivery_date)}</td>
                  <td>{item.miles ? Math.round(item.miles).toLocaleString() : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>{fmt(item.load_rate)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(item.driver_pay)}</td>
                </tr>
              ))}
              {loadItems.filter(l => l.included).length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>No loads included</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Financial Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="card">
          <div className="card-header"><div className="card-title">Deductions Breakdown</div></div>
          <div style={{ padding: '0 4px' }}>
            {[
              { label: 'Fuel Cost', val: report.fuel_cost, icon: '⛽' },
              { label: 'ELD Fee (Rock ELD)', val: report.eld_fee, icon: '📡' },
              { label: 'Dispatching Fee (4%)', val: report.dispatch_fee, icon: '📞' },
              { label: 'Insurance ($2000/mo ÷ 4)', val: report.insurance_fee, icon: '🛡️' },
              { label: 'Trailer Payment ($600/mo ÷ 4)', val: report.trailer_payment, icon: '🚛' },
              { label: 'Office / Authority Fee (12%)', val: report.office_authority_fee, icon: '🏢' },
              { label: 'Driver Salary', val: report.driver_salary, icon: '👤' },
              ...customDed.map(d => ({ label: d.name, val: d.amount, icon: '➖' })),
            ].map((item, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: '1px solid var(--border-subtle)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {item.icon} {item.label}
                </span>
                <span style={{ fontWeight: 600, color: 'var(--danger)', fontSize: 14 }}>
                  -{fmt(item.val)}
                </span>
              </div>
            ))}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '12px 0', marginTop: 4,
            }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Total Deductions</span>
              <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--danger)' }}>-{fmt(report.total_deductions)}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><div className="card-title">Revenue Summary</div></div>
          <div style={{ padding: '0 4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Gross Revenue</span>
              <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--success)' }}>{fmt(report.gross_revenue)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)' }}>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total Deductions</span>
              <span style={{ fontWeight: 600, color: 'var(--danger)' }}>-{fmt(report.total_deductions)}</span>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', padding: '16px 0', marginTop: 8,
              background: 'rgba(16,185,129,0.08)', borderRadius: 10, paddingLeft: 12, paddingRight: 12,
            }}>
              <span style={{ fontWeight: 800, fontSize: 15 }}>NET REVENUE</span>
              <span style={{
                fontWeight: 900, fontSize: 22,
                color: report.net_revenue >= 0 ? 'var(--success)' : 'var(--danger)'
              }}>{fmt(report.net_revenue)}</span>
            </div>
          </div>

          {report.notes && (
            <div style={{ margin: '16px 0 0', padding: 12, background: 'var(--border-subtle)', borderRadius: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
              <strong>Notes:</strong> {report.notes}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end', flexWrap: 'wrap' }} className="no-print">
        {/* PDF info badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px',
          background: 'rgba(249,115,22,0.1)', border: '1px solid rgba(249,115,22,0.3)',
          borderRadius: 8, fontSize: 12, color: 'var(--brand-orange)',
        }}>
          <FaFilePdf /> Branded PDF with BHTL logo
        </div>

        <button
          onClick={handlePrint}
          disabled={generating}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          {generating ? <Spinner size={14} inline /> : <FaPrint />}
          Open PDF
        </button>

        <button
          onClick={handleDownloadPDF}
          disabled={generating}
          className="btn btn-secondary"
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
        >
          {generating ? <Spinner size={14} inline /> : <FaDownload />}
          Download PDF
        </button>

        <button
          onClick={handleWhatsApp}
          disabled={generating}
          className="btn btn-primary"
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#25D366', borderColor: '#25D366',
            boxShadow: '0 0 16px rgba(37,211,102,0.3)',
          }}
        >
          {generating ? <Spinner size={14} inline /> : <FaWhatsapp />}
          {generating ? 'Generating PDF...' : 'Send PDF via WhatsApp'}
        </button>
      </div>
    </div>
  );
}


// ── Report Form (Create / Edit) ───────────────────────────────────────
function ReportForm({ onSaved, onClose, trucks, drivers, editingReport, editingLoadItems }) {
  const thisMonday = getMondayOfWeek();
  const thisSunday = getSundayOfWeek();

  const [form, setForm] = useState({
    report_type: 'weekly',
    period_start: editingReport?.period_start?.slice(0, 10) || thisMonday,
    period_end: editingReport?.period_end?.slice(0, 10) || thisSunday,
    truck_id: editingReport?.truck_id || '',
    driver_id: editingReport?.driver_id || '',
    notes: editingReport?.notes || '',
    status: editingReport?.status || 'draft',
  });

  const [calcResult, setCalcResult] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [loadItems, setLoadItems] = useState(editingLoadItems || []);
  const [customDed, setCustomDed] = useState(
    editingReport?.custom_deductions ? JSON.parse(editingReport.custom_deductions || '[]') : []
  );
  const [newDedName, setNewDedName] = useState('');
  const [newDedAmt, setNewDedAmt] = useState('');
  const [saving, setSaving] = useState(false);

  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  const toggleLoad = (loadId) => {
    setLoadItems(prev => prev.map(l =>
      l.load_id === loadId ? { ...l, included: !l.included } : l
    ));
  };

  const calculate = async () => {
    if (!form.period_start || !form.period_end) {
      toast.error('Select period first'); return;
    }
    setCalculating(true);
    try {
      const res = await api.post('/reports/calculate', {
        truck_id: form.truck_id || null,
        driver_id: form.driver_id || null,
        period_start: form.period_start,
        period_end: form.period_end,
        exclude_load_ids: [],
      });
      setCalcResult(res.data);
      setLoadItems(res.data.loads.map(l => ({
        ...l,
        load_id: l.load_id || l.id,
        included: true,
      })));
      toast.success(`Found ${res.data.loads.length} loads`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Calculation failed');
    } finally {
      setCalculating(false);
    }
  };

  // Re-compute totals whenever loads or custom deductions change
  const computed = (() => {
    if (!calcResult) return null;
    const includedLoads = loadItems.filter(l => l.included);
    const gross_revenue = includedLoads.reduce((s, l) => s + (parseFloat(l.load_rate) || 0), 0);
    const driver_salary = includedLoads.reduce((s, l) => s + (parseFloat(l.driver_pay) || 0), 0);

    const eld_fee = parseFloat(calcResult.eld_fee) || 35;
    const dispatch_fee = Math.round(gross_revenue * 0.04 * 100) / 100;
    const insurance_fee = parseFloat(calcResult.insurance_fee) || 500;
    const trailer_payment = parseFloat(calcResult.trailer_payment) || 150;
    const office_authority_fee = Math.round(gross_revenue * 0.12 * 100) / 100;
    const fuel_cost = parseFloat(calcResult.fuel_cost) || 0;

    const customTotal = customDed.reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
    const total_deductions = fuel_cost + eld_fee + dispatch_fee + insurance_fee + trailer_payment + driver_salary + office_authority_fee + customTotal;
    const net_revenue = gross_revenue - total_deductions;

    return { gross_revenue, driver_salary, eld_fee, dispatch_fee, insurance_fee, trailer_payment, office_authority_fee, fuel_cost, total_deductions, net_revenue };
  })();

  const addCustomDed = () => {
    if (!newDedName || !newDedAmt) return;
    setCustomDed(prev => [...prev, { name: newDedName, amount: parseFloat(newDedAmt) }]);
    setNewDedName(''); setNewDedAmt('');
  };

  const removeCustomDed = (i) => setCustomDed(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async (saveStatus = form.status) => {
    if (!computed && !editingReport) {
      toast.error('Calculate first'); return;
    }
    setSaving(true);
    try {
      const c = computed || {
        gross_revenue: editingReport.gross_revenue,
        fuel_cost: editingReport.fuel_cost,
        eld_fee: editingReport.eld_fee,
        dispatch_fee: editingReport.dispatch_fee,
        insurance_fee: editingReport.insurance_fee,
        trailer_payment: editingReport.trailer_payment,
        office_authority_fee: editingReport.office_authority_fee,
        driver_salary: editingReport.driver_salary,
        total_deductions: editingReport.total_deductions,
        net_revenue: editingReport.net_revenue,
      };

      const payload = {
        ...form, ...c,
        status: saveStatus,
        custom_deductions: customDed,
        load_items: loadItems,
      };

      if (editingReport) {
        await api.put(`/reports/${editingReport.id}`, payload);
        toast.success('Report updated');
      } else {
        await api.post('/reports', payload);
        toast.success('Report created');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      {/* Period & Filters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Report Type</label>
          <select className="form-input" value={form.report_type} onChange={f('report_type')}>
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Period Start</label>
          <input type="date" className="form-input" value={form.period_start} onChange={f('period_start')} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Period End</label>
          <input type="date" className="form-input" value={form.period_end} onChange={f('period_end')} />
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <button onClick={calculate} disabled={calculating} className="btn btn-primary w-100" style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
            {calculating ? <Spinner size={14} inline /> : <FaCalculator />}
            {calculating ? 'Calculating...' : 'Calculate'}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Truck (optional)</label>
          <select className="form-input" value={form.truck_id} onChange={f('truck_id')}>
            <option value="">All Trucks</option>
            {trucks.map(t => <option key={t.id} value={t.id}>{t.unit_number}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Driver (optional)</label>
          <select className="form-input" value={form.driver_id} onChange={f('driver_id')}>
            <option value="">All Drivers</option>
            {drivers.map(d => <option key={d.id} value={d.id}>{d.first_name} {d.last_name}</option>)}
          </select>
        </div>
      </div>

      {/* Loads Selection */}
      {loadItems.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div className="card-title"><FaListUl style={{ marginRight: 8 }} />Load Selection</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {loadItems.filter(l => l.included).length}/{loadItems.length} included
            </div>
          </div>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Include</th>
                  <th>Load #</th>
                  <th>Route</th>
                  <th>Delivery</th>
                  <th style={{ textAlign: 'right' }}>Rate</th>
                  <th style={{ textAlign: 'right' }}>Driver Pay</th>
                </tr>
              </thead>
              <tbody>
                {loadItems.map(item => (
                  <tr key={item.load_id} style={{ opacity: item.included ? 1 : 0.4 }}>
                    <td>
                      <input type="checkbox" checked={item.included} onChange={() => toggleLoad(item.load_id)}
                        style={{ cursor: 'pointer', width: 16, height: 16 }} />
                    </td>
                    <td className="mono" style={{ fontWeight: 600 }}>{item.load_number}</td>
                    <td style={{ fontSize: 12 }}>{item.origin} → {item.destination}</td>
                    <td style={{ fontSize: 12 }}>{fmtDate(item.delivery_date)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>{fmt(item.load_rate)}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(item.driver_pay)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Financial Breakdown (if calculated) */}
      {computed && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div className="card-title"><FaDollarSign style={{ marginRight: 8 }} />Financial Breakdown</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
            {/* Deductions */}
            <div style={{ padding: '0 20px 16px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 12 }}>DEDUCTIONS</div>
              {[
                { label: '⛽ Fuel Cost', val: computed.fuel_cost },
                { label: '📡 ELD Fee', val: computed.eld_fee },
                { label: '📞 Dispatch Fee (4%)', val: computed.dispatch_fee },
                { label: '🛡️ Insurance ($500/wk)', val: computed.insurance_fee },
                { label: '🚛 Trailer ($150/wk)', val: computed.trailer_payment },
                { label: '🏢 Office Authority (12%)', val: computed.office_authority_fee },
                { label: '👤 Driver Salary', val: computed.driver_salary },
              ].map((row, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{row.label}</span>
                  <span style={{ color: 'var(--danger)', fontWeight: 600 }}>-{fmt(row.val)}</span>
                </div>
              ))}

              {/* Custom deductions */}
              {customDed.map((d, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>➖ {d.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: 'var(--danger)', fontWeight: 600 }}>-{fmt(d.amount)}</span>
                    <button onClick={() => removeCustomDed(i)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: 2 }}><FaTimes /></button>
                  </div>
                </div>
              ))}

              {/* Add custom deduction */}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <input placeholder="Deduction name" value={newDedName} onChange={e => setNewDedName(e.target.value)}
                  className="form-input" style={{ flex: 2, padding: '6px 10px', fontSize: 12 }} />
                <input placeholder="Amount" type="number" value={newDedAmt} onChange={e => setNewDedAmt(e.target.value)}
                  className="form-input" style={{ flex: 1, padding: '6px 10px', fontSize: 12 }} />
                <button onClick={addCustomDed} className="btn btn-secondary" style={{ padding: '6px 10px', fontSize: 12 }}>
                  <FaPlus />
                </button>
              </div>
            </div>

            {/* Revenue Summary */}
            <div style={{ padding: '0 20px 16px', borderLeft: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', letterSpacing: 1, marginBottom: 12 }}>REVENUE SUMMARY</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Gross Revenue</span>
                <span style={{ fontWeight: 700, color: 'var(--success)', fontSize: 16 }}>{fmt(computed.gross_revenue)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Total Deductions</span>
                <span style={{ fontWeight: 600, color: 'var(--danger)' }}>-{fmt(computed.total_deductions)}</span>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '16px 12px', marginTop: 16,
                background: computed.net_revenue >= 0 ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)',
                borderRadius: 10,
              }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>NET REVENUE</span>
                <span style={{ fontWeight: 900, fontSize: 24, color: computed.net_revenue >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {fmt(computed.net_revenue)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="form-group">
        <label className="form-label">Notes</label>
        <textarea className="form-input" rows={2} value={form.notes} onChange={f('notes')} placeholder="Optional notes..." />
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 8 }}>
        <button onClick={onClose} className="btn btn-secondary">Cancel</button>
        <button onClick={() => handleSave('draft')} disabled={saving || (!computed && !editingReport)} className="btn btn-secondary">
          Save Draft
        </button>
        <button onClick={() => handleSave('finalized')} disabled={saving || (!computed && !editingReport)} className="btn btn-primary">
          {saving ? 'Saving...' : 'Finalize Report'}
        </button>
      </div>
    </div>
  );
}

// ── Main Reports Page ──────────────────────────────────────────────────
export default function Reports() {
  const [reports, setReports] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [editingLoadItems, setEditingLoadItems] = useState(null);
  const [viewReport, setViewReport] = useState(null);
  const [viewLoadItems, setViewLoadItems] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [filters, setFilters] = useState({ truck_id: '', status: '' });
  // Weekly PDF download
  const [weeklyPdfTruck, setWeeklyPdfTruck] = useState('');
  const [weeklyPdfStart, setWeeklyPdfStart] = useState(() => {
    const d = new Date(); const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff); return d.toISOString().slice(0, 10);
  });
  const [weeklyPdfEnd, setWeeklyPdfEnd] = useState(() => {
    const d = new Date(); const day = d.getDay(); const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff + 6); return d.toISOString().slice(0, 10);
  });
  const [weeklyPdfGenerating, setWeeklyPdfGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
      const [rRes, tRes, dRes] = await Promise.all([
        api.get('/reports', { params }),
        api.get('/trucks'),
        api.get('/drivers', { params: { active: true } }),
      ]);
      setReports(rRes.data);
      setTrucks(tRes.data);
      setDrivers(dRes.data);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const openView = async (id) => {
    setViewLoading(true);
    setViewReport(null);
    setViewLoadItems([]);
    try {
      const res = await api.get(`/reports/${id}`);
      setViewReport(res.data.report);
      setViewLoadItems(res.data.load_items);
    } catch {
      toast.error('Failed to load report');
    } finally {
      setViewLoading(false);
    }
  };

  const openEdit = async (report) => {
    setViewLoading(true);
    try {
      const res = await api.get(`/reports/${report.id}`);
      setEditingReport(res.data.report);
      setEditingLoadItems(res.data.load_items);
      setShowForm(true);
    } finally {
      setViewLoading(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      await api.delete(`/reports/${id}`);
      toast.success('Report deleted');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Delete failed');
    }
  };

  const handleWeeklyPdf = async () => {
    setWeeklyPdfGenerating(true);
    try {
      const params = { period_start: weeklyPdfStart, period_end: weeklyPdfEnd };
      if (weeklyPdfTruck) params.truck_id = weeklyPdfTruck;
      const res = await api.get('/reports/weekly-summary', { params });
      const data = res.data;
      if (!data.trucks || data.trucks.length === 0) {
        toast.error('No trucks found for that period.');
        return;
      }
      const truckLabel = weeklyPdfTruck
        ? `Truck${trucks.find(t => t.id === weeklyPdfTruck)?.unit_number || ''}`
        : 'AllTrucks';
      const filename = await downloadWeeklySummaryPDF(data, truckLabel);
      toast.success(`PDF downloaded: ${filename}`);
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate weekly PDF');
    } finally {
      setWeeklyPdfGenerating(false);
    }
  };

  const statusColor = { draft: 'var(--text-muted)', finalized: 'var(--brand-blue-light)', sent: 'var(--success)' };

  if (viewReport) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => setViewReport(null)} className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FaChevronLeft /> Back to Reports
          </button>
          <div style={{ fontSize: 20, fontWeight: 700 }}>Report Detail</div>
        </div>
        <ReportPrintView report={viewReport} loadItems={viewLoadItems} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Weekly Reports"
        subtitle="Auto-generate weekly reports with deductions, revenue, and driver settlements"
        action={
          <button onClick={() => { setShowForm(true); setEditingReport(null); setEditingLoadItems(null); }} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FaPlus /> New Report
          </button>
        }
      />

      {/* ── WEEKLY PDF DOWNLOAD CARD ── */}
      <div style={{
        background: 'linear-gradient(135deg, var(--bg-card) 0%, rgba(15,40,80,0.4) 100%)',
        border: '1px solid var(--border-color)',
        borderRadius: 14, padding: '20px 24px', marginBottom: 24,
        display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap',
      }}>
        <div style={{ flex: '0 0 auto' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--brand-orange)', marginBottom: 2 }}>
            <FaFilePdf style={{ marginRight: 6 }} />DOWNLOAD WEEKLY PDF REPORT
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Choose a week and truck, then download a formatted PDF</div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: 11 }}>Truck</label>
          <select className="form-control" style={{ minWidth: 160 }} value={weeklyPdfTruck} onChange={e => setWeeklyPdfTruck(e.target.value)}>
            <option value="">All Trucks</option>
            {trucks.map(t => <option key={t.id} value={t.id}>#{t.unit_number}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: 11 }}>Week Start (Mon)</label>
          <input type="date" className="form-control" value={weeklyPdfStart}
            onChange={e => {
              const d = new Date(e.target.value + 'T12:00:00');
              setWeeklyPdfStart(e.target.value);
              const end = new Date(d); end.setDate(d.getDate() + 6);
              setWeeklyPdfEnd(end.toISOString().slice(0, 10));
            }}
          />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" style={{ fontSize: 11 }}>Week End (Sun)</label>
          <input type="date" className="form-control" value={weeklyPdfEnd}
            onChange={e => setWeeklyPdfEnd(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={handleWeeklyPdf} disabled={weeklyPdfGenerating}
          style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 160 }}>
          <FaFilePdf />{weeklyPdfGenerating ? 'Generating...' : 'Download PDF'}
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <select className="form-input" style={{ maxWidth: 160 }} value={filters.truck_id}
          onChange={e => setFilters(p => ({ ...p, truck_id: e.target.value }))}>
          <option value="">All Trucks</option>
          {trucks.map(t => <option key={t.id} value={t.id}>{t.unit_number}</option>)}
        </select>
        <select className="form-input" style={{ maxWidth: 140 }} value={filters.status}
          onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}>
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="finalized">Finalized</option>
          <option value="sent">Sent</option>
        </select>
      </div>

      {loading ? <Spinner /> : reports.length === 0 ? (
        <EmptyState title="No Reports Yet" subtitle="Generate your first weekly report" icon={<FaFileAlt />} />
      ) : (
        <div className="card">
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Report #</th>
                  <th>Period</th>
                  <th>Truck</th>
                  <th>Driver</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th style={{ textAlign: 'right' }}>Deductions</th>
                  <th style={{ textAlign: 'right' }}>Net</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map(r => (
                  <tr key={r.id}>
                    <td className="mono" style={{ fontWeight: 600, color: 'var(--brand-blue-light)' }}>{r.report_number}</td>
                    <td style={{ fontSize: 12 }}>{fmtDate(r.period_start)} – {fmtDate(r.period_end)}</td>
                    <td>{r.truck_unit || '—'}</td>
                    <td>{r.driver_first ? `${r.driver_first} ${r.driver_last}` : '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--success)' }}>{fmt(r.gross_revenue)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--danger)' }}>-{fmt(r.total_deductions)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: r.net_revenue >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(r.net_revenue)}</td>
                    <td>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'rgba(255,255,255,0.06)', color: statusColor[r.status] || 'var(--text-muted)', textTransform: 'uppercase' }}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openView(r.id)} className="btn btn-secondary btn-sm" title="View Report"><FaEye /></button>
                        <button onClick={() => openEdit(r)} className="btn btn-secondary btn-sm" title="Edit"><FaEdit /></button>
                        <button
                          onClick={async () => {
                            const res = await api.get(`/reports/${r.id}`);
                            toast.promise(
                              downloadReportPDF(res.data.report, res.data.load_items),
                              { loading: 'Generating PDF…', success: 'PDF downloaded!', error: 'Failed' }
                            );
                          }}
                          className="btn btn-secondary btn-sm"
                          title="Download PDF"
                          style={{ color: 'var(--brand-orange)' }}
                        >
                          <FaFilePdf />
                        </button>
                        <button
                          onClick={async () => {
                            const res = await api.get(`/reports/${r.id}`);
                            toast.promise(
                              shareReportViaWhatsApp(res.data.report, res.data.load_items),
                              { loading: 'Generating PDF…', success: 'PDF ready!', error: 'Failed' }
                            );
                          }}
                          className="btn btn-sm"
                          title="Send PDF via WhatsApp"
                          style={{ background: '#25D366', border: 'none', color: '#fff', borderRadius: 6, padding: '4px 8px', cursor: 'pointer' }}
                        >
                          <FaWhatsapp />
                        </button>
                        <button onClick={() => setDeleteTarget(r.id)} className="btn btn-danger btn-sm" title="Delete"><FaTrash /></button>
                      </div>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Modal */}
      <Modal
        open={showForm}
        onClose={() => { setShowForm(false); setEditingReport(null); }}
        title={editingReport ? 'Edit Report' : 'Generate New Report'}
        size="xl"
      >
        <ReportForm
          trucks={trucks}
          drivers={drivers}
          editingReport={editingReport}
          editingLoadItems={editingLoadItems}
          onSaved={() => { setShowForm(false); setEditingReport(null); load(); }}
          onClose={() => { setShowForm(false); setEditingReport(null); }}
        />
      </Modal>

      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Report"
        message="Are you sure you want to delete this report? This cannot be undone."
        onConfirm={() => { handleDelete(deleteTarget); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
        danger
      />
    </div>
  );
}
