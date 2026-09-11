import { useState } from 'react';

const IMPORT_TYPES = {
  invoices: { label: 'Invoices' },
  expenses: { label: 'Expenses' },
  payroll: { label: 'Payroll' },
};

export default function Import() {
  const [step, setStep] = useState(1);
  const [type, setType] = useState('invoices');
  const [file, setFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [mapping, setMapping] = useState({});
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const token = localStorage.getItem('token');
  const authHeaders = token ? { 'Authorization': `Bearer ${token}` } : {};

  const reset = () => {
    setStep(1);
    setFile(null);
    setAnalysis(null);
    setMapping({});
    setResult(null);
    setError('');
  };

  const handleAnalyze = async () => {
    if (!file) { setError('Choose a file first'); return; }
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/import/${type}/analyze`, {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not read file');
      setAnalysis(data);
      setMapping(data.suggestedMapping);
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('mapping', JSON.stringify(mapping));
      const res = await fetch(`/api/import/${type}`, {
        method: 'POST',
        headers: authHeaders,
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Import failed');
      setResult(data);
      setStep(3);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const missingRequired = analysis
    ? analysis.fieldDefs.filter(f => f.required && !mapping[f.field])
    : [];

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <div className="page-title">Bulk Import</div>
          <div className="page-subtitle">Upload any CSV or Excel file — we'll match the columns for you</div>
        </div>
      </div>

      {step === 1 && (
        <div className="card mb-24">
          <div className="form-group">
            <label className="form-label">Import Type</label>
            <select className="form-control" value={type} onChange={(e) => { setType(e.target.value); reset(); }}>
              {Object.entries(IMPORT_TYPES).map(([key, val]) => (
                <option key={key} value={key}>{val.label}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">File (CSV or Excel)</label>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="form-control"
              onChange={(e) => setFile(e.target.files[0])}
            />
          </div>

          {error && <div className="alert alert-danger">{error}</div>}

          <button className="btn btn-primary" onClick={handleAnalyze} disabled={loading}>
            {loading ? 'Reading file...' : 'Next: Review Columns'}
          </button>
        </div>
      )}

      {step === 2 && analysis && (
        <div className="card mb-24">
          <div className="card-title mb-16">
            Match your columns ({analysis.totalRows} rows found)
          </div>
          <div className="page-subtitle mb-24">
            We guessed the matches below — fix any that look wrong before importing.
          </div>

          {analysis.fieldDefs.map(def => (
            <div className="form-group" key={def.field}>
              <label className="form-label">
                {def.label}{def.required ? ' *' : ''}
              </label>
              <select
                className="form-control"
                value={mapping[def.field] || ''}
                onChange={(e) => setMapping({ ...mapping, [def.field]: e.target.value || null })}
              >
                <option value="">-- Not mapped --</option>
                {analysis.headers.map(h => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          ))}

          {analysis.sampleRows.length > 0 && (
            <div className="mb-24">
              <div className="form-label mb-8">Preview (first row)</div>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      {analysis.fieldDefs.map(def => <th key={def.field}>{def.label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {analysis.fieldDefs.map(def => (
                        <td key={def.field}>
                          {mapping[def.field] ? String(analysis.sampleRows[0][mapping[def.field]] ?? '') : <span className="no-data">—</span>}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {missingRequired.length > 0 && (
            <div className="alert alert-warning">
              Still need to map: {missingRequired.map(f => f.label).join(', ')}
            </div>
          )}
          {error && <div className="alert alert-danger">{error}</div>}

          <div className="flex gap-12">
            <button className="btn btn-secondary" onClick={reset}>Back</button>
            <button
              className="btn btn-primary"
              onClick={handleImport}
              disabled={loading || missingRequired.length > 0}
            >
              {loading ? 'Importing...' : `Import ${analysis.totalRows} Rows`}
            </button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="card">
          <div className="card-title mb-16">Import Results</div>
          <div className="flex gap-16 mb-16">
            <div className="text-success font-bold">{result.imported} imported</div>
            <div className="text-danger font-bold">{result.failed} failed</div>
          </div>
          {result.errors && result.errors.length > 0 && (
            <div className="table-wrapper mb-16">
              <table className="data-table">
                <thead>
                  <tr><th>Row</th><th>Error</th></tr>
                </thead>
                <tbody>
                  {result.errors.map((e, i) => (
                    <tr key={i}><td>{e.row}</td><td className="text-danger">{e.message}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button className="btn btn-secondary" onClick={reset}>Import Another File</button>
        </div>
      )}
    </div>
  );
}
