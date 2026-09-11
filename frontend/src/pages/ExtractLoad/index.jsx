import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { EXPENSE_CATEGORIES } from '../../utils/expenseCategories';
import RedactTool from '../../components/RedactTool';

const DOC_TYPES = {
  load: {
    label: 'Rate Confirmation / BOL / POD',
    endpoint: '/extract/load-document',
    fields: [
      { key: 'load_number', label: 'Load Number' },
      { key: 'po_number', label: 'PO Number' },
      { key: 'bol_number', label: 'BOL Number' },
      { key: 'customer_name', label: 'Customer' },
      { key: 'origin_address', label: 'Origin Address' },
      { key: 'origin_city', label: 'Origin City' },
      { key: 'origin_state', label: 'Origin State' },
      { key: 'origin_zip', label: 'Origin Zip' },
      { key: 'destination_address', label: 'Destination Address' },
      { key: 'destination_city', label: 'Destination City' },
      { key: 'destination_state', label: 'Destination State' },
      { key: 'destination_zip', label: 'Destination Zip' },
      { key: 'pickup_date', label: 'Pickup Date', type: 'date' },
      { key: 'delivery_date', label: 'Delivery Date', type: 'date' },
      { key: 'rate', label: 'Rate ($)', type: 'number' },
      { key: 'weight', label: 'Weight' },
      { key: 'commodity', label: 'Commodity' },
      { key: 'notes', label: 'Notes', type: 'textarea' },
    ],
  },
  fuel: {
    label: 'Fuel Receipt',
    endpoint: '/extract/fuel-receipt',
    fields: [
      { key: 'purchase_date', label: 'Purchase Date', type: 'date' },
      { key: 'state', label: 'State (2-letter)' },
      { key: 'gallons', label: 'Gallons', type: 'number' },
      { key: 'cost_per_gallon', label: 'Cost per Gallon ($)', type: 'number' },
      { key: 'total_cost', label: 'Total Cost ($)', type: 'number' },
      { key: 'vendor', label: 'Vendor' },
    ],
  },
  maintenance: {
    label: 'Maintenance / Repair Invoice',
    endpoint: '/extract/maintenance-invoice',
    fields: [
      { key: 'service_date', label: 'Service Date', type: 'date' },
      { key: 'service_type', label: 'Service Type' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'cost', label: 'Cost ($)', type: 'number' },
      { key: 'mileage_at_service', label: 'Mileage at Service', type: 'number' },
    ],
  },
  expense: {
    label: 'General Expense Receipt / Bill',
    endpoint: '/extract/expense-receipt',
    fields: [
      { key: 'category', label: 'Category', type: 'select' },
      { key: 'amount', label: 'Amount ($)', type: 'number' },
      { key: 'expense_date', label: 'Date', type: 'date' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
  },
  payroll: {
    label: 'Driver Settlement / Payroll Statement',
    endpoint: '/extract/payroll-document',
    fields: [
      { key: 'person_name', label: 'Driver Name' },
      { key: 'period_start', label: 'Period Start', type: 'date' },
      { key: 'period_end', label: 'Period End', type: 'date' },
      { key: 'gross_pay', label: 'Gross Pay ($)', type: 'number' },
      { key: 'deductions', label: 'Deductions ($)', type: 'number' },
      { key: 'net_pay', label: 'Net Pay ($)', type: 'number' },
    ],
  },
  bank_statement: {
    label: 'Bank Statement (multiple transactions)',
    endpoint: '/extract/bank-statement',
  },
};

export default function ExtractLoad() {
  const navigate = useNavigate();
  const [docType, setDocType] = useState('load');
  const [file, setFile] = useState(null);
  const [fields, setFields] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [batchResult, setBatchResult] = useState(null);
  const [showRedact, setShowRedact] = useState(false);

  const reset = () => {
    setFile(null); setFields(null); setTransactions(null); setError(''); setBatchResult(null);
  };

  const handleExtract = () => {
    if (!file) { setError('Choose a file first'); return; }
    setShowRedact(true);
  };

  const handleExtractFromRedacted = async (redactedFiles) => {
    setShowRedact(false);
    setLoading(true); setError('');
    try {
      if (docType === 'bank_statement') {
        let allTransactions = [];
        for (const rFile of redactedFiles) {
          const formData = new FormData();
          formData.append('file', rFile);
          const res = await api.post(DOC_TYPES[docType].endpoint, formData);
          allTransactions = allTransactions.concat(res.data.transactions || []);
        }
        setTransactions(allTransactions.map(t => ({ ...t, include: t.classification !== 'review' })));
      } else {
        const formData = new FormData();
        formData.append('file', redactedFiles[0]);
        const res = await api.post(DOC_TYPES[docType].endpoint, formData);
        setFields(res.data.extracted);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  // ---------- Single-record save (load, fuel, maintenance, expense, payroll) ----------
  const handleSaveSingle = async () => {
    setSaving(true); setError('');
    try {
      if (docType === 'load') {
        const res = await api.post('/extract/create-load', fields);
        navigate(`/loads/${res.data.id}`);
        return;
      }
      if (docType === 'fuel') {
        await api.post('/fuel', fields);
        navigate('/fuel');
        return;
      }
      if (docType === 'maintenance') {
        await api.post('/maintenance', { ...fields, entity_type: 'truck' });
        navigate('/fleet');
        return;
      }
      if (docType === 'expense') {
        await api.post('/expenses', fields);
        navigate('/expenses');
        return;
      }
      if (docType === 'payroll') {
        const gross = parseFloat(fields.gross_pay) || 0;
        const ded = parseFloat(fields.deductions) || 0;
        await api.post('/payroll', {
          person_name: fields.person_name,
          period_start: fields.period_start,
          period_end: fields.period_end,
          gross_pay: gross,
          deductions: ded,
          net_pay: fields.net_pay || (gross - ded),
          status: 'draft',
        });
        navigate('/payroll');
        return;
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  // ---------- Batch save (bank statement) ----------
  const handleSaveBatch = async () => {
    setSaving(true); setError('');
    try {
      const toSave = transactions.filter(t => t.include && t.classification !== 'review');
      const res = await api.post('/extract/create-batch', { transactions: toSave });
      setBatchResult(res.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not save transactions');
    } finally {
      setSaving(false);
    }
  };

  const updateTransaction = (i, patch) => {
    setTransactions(prev => prev.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  };

  const config = DOC_TYPES[docType];

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-title">Extract from Document</div>
          <div className="page-subtitle">Upload a document, pick its type, and we'll read it and fill in the details for you</div>
        </div>
      </div>

      {!fields && !transactions && (
        <div className="card mb-24">
          <div className="form-group">
            <label className="form-label">Document Type</label>
            <select className="form-control" value={docType} onChange={(e) => { setDocType(e.target.value); reset(); }}>
              {Object.entries(DOC_TYPES).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Document (PDF, JPG, or PNG)</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="form-control"
              onChange={(e) => setFile(e.target.files[0])}
            />
          </div>
          {error && <div className="alert alert-danger">{error}</div>}
          <button className="btn btn-primary" onClick={handleExtract} disabled={loading}>
            {loading ? 'Reading document...' : 'Continue: Black Out Sensitive Info'}
          </button>
        </div>
      )}

      {showRedact && (
        <RedactTool
          file={file}
          onDone={handleExtractFromRedacted}
          onCancel={() => setShowRedact(false)}
        />
      )}

      {/* Single-record review form */}
      {fields && (
        <div className="card">
          <div className="card-title mb-16">Review extracted details — {config.label}</div>
          <div className="page-subtitle mb-24">Check every field against the original document before saving.</div>

          <div className="form-grid">
            {config.fields.map(f => (
              <div className="form-group" key={f.key}>
                <label className="form-label">{f.label}</label>
                {f.type === 'textarea' ? (
                  <textarea className="form-control" value={fields[f.key] ?? ''} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })} />
                ) : f.type === 'select' ? (
                  <select className="form-control" value={fields[f.key] ?? ''} onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}>
                    <option value="">-- Select --</option>
                    {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                ) : (
                  <input
                    type={f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text'}
                    step={f.type === 'number' ? '0.01' : undefined}
                    className="form-control"
                    value={fields[f.key] ?? ''}
                    onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>

          {error && <div className="alert alert-danger mt-16">{error}</div>}

          <div className="flex gap-12 mt-24">
            <button className="btn btn-secondary" onClick={reset}>Start Over</button>
            <button className="btn btn-primary" onClick={handleSaveSingle} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Batch review table for bank statements */}
      {transactions && !batchResult && (
        <div className="card">
          <div className="card-title mb-16">Review transactions ({transactions.length} found)</div>
          <div className="page-subtitle mb-24">
            Uncheck anything you don't want to import. "Review" items are flagged as transfers, owner draws, or unclear — check them only after fixing the classification.
          </div>

          <div className="table-wrapper mb-16">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Include</th><th>Date</th><th>Description</th><th>Amount</th><th>Type</th><th>Category</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t, i) => (
                  <tr key={i} style={t.classification === 'review' ? { opacity: 0.6 } : {}}>
                    <td><input type="checkbox" checked={t.include} onChange={(e) => updateTransaction(i, { include: e.target.checked })} /></td>
                    <td className="muted">{t.date}</td>
                    <td className="truncate">{t.description}</td>
                    <td>${parseFloat(t.amount).toFixed(2)}</td>
                    <td>
                      <select className="form-control" value={t.classification} onChange={(e) => updateTransaction(i, { classification: e.target.value })}>
                        <option value="expense">Expense</option>
                        <option value="revenue">Revenue</option>
                        <option value="review">Review / Skip</option>
                      </select>
                    </td>
                    <td>
                      {t.classification === 'expense' ? (
                        <select className="form-control" value={t.category || ''} onChange={(e) => updateTransaction(i, { category: e.target.value })}>
                          <option value="">-- Select --</option>
                          {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      ) : <span className="no-data">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {error && <div className="alert alert-danger mb-16">{error}</div>}

          <div className="flex gap-12">
            <button className="btn btn-secondary" onClick={reset}>Start Over</button>
            <button className="btn btn-primary" onClick={handleSaveBatch} disabled={saving}>
              {saving ? 'Saving...' : `Import ${transactions.filter(t => t.include).length} Transactions`}
            </button>
          </div>
        </div>
      )}

      {batchResult && (
        <div className="card">
          <div className="card-title mb-16">Import Complete</div>
          <div className="flex gap-16 mb-16">
            <div className="text-success font-bold">{batchResult.expensesCreated} expenses added</div>
            <div className="text-success font-bold">{batchResult.revenueCreated} revenue records added</div>
            {batchResult.failed > 0 && <div className="text-danger font-bold">{batchResult.failed} failed</div>}
          </div>
          {batchResult.errors?.length > 0 && (
            <div className="table-wrapper mb-16">
              <table className="data-table">
                <thead><tr><th>Row</th><th>Error</th></tr></thead>
                <tbody>
                  {batchResult.errors.map((e, i) => <tr key={i}><td>{e.row}</td><td className="text-danger">{e.message}</td></tr>)}
                </tbody>
              </table>
            </div>
          )}
          <button className="btn btn-secondary" onClick={reset}>Import Another Document</button>
        </div>
      )}
    </div>
  );
}
