import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Color palette ─────────────────────────────────────────────────────
const NAVY   = [15, 40, 80];
const ORANGE = [217, 95, 14];
const WHITE  = [255, 255, 255];
const GRAY   = [100, 116, 139];
const LIGHT  = [245, 247, 251];
const RED    = [185, 28, 28];
const GREEN  = [5, 122, 85];
const BLACK  = [20, 20, 30];
const BORDER = [210, 218, 230];
const TEAL   = [6, 95, 120];

const fmt = (n) => {
  if (n == null || n === '') return '$0.00';
  return `$${Math.abs(parseFloat(n) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  const s = typeof d === 'string' ? d : d.toISOString();
  return new Date(s.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
};

const fmtShort = (d) => {
  if (!d) return '—';
  const s = typeof d === 'string' ? d : d.toISOString();
  return new Date(s.slice(0, 10) + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric',
  });
};

function rule(doc, x, y, w, color = BORDER, lw = 0.3) {
  doc.setDrawColor(...color);
  doc.setLineWidth(lw);
  doc.line(x, y, x + w, y);
}

function filledRect(doc, x, y, w, h, fillColor, strokeColor = null) {
  doc.setFillColor(...fillColor);
  doc.rect(x, y, w, h, strokeColor ? 'FD' : 'F');
}

async function getLogoBase64() {
  try {
    const res = await fetch('/bhtl-logo.png');
    if (!res.ok) throw new Error('not found');
    const blob = await res.blob();
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────
// PAGE HEADER — shared by both PDF types
// ─────────────────────────────────────────────────────────────────────
function drawPageHeader(doc, logoBase64, title, subtitle, today, pageW, M) {
  // Navy banner
  filledRect(doc, 0, 0, pageW, 40, NAVY);
  // Orange accent stripe
  filledRect(doc, 0, 0, pageW, 3, ORANGE);

  // Logo
  if (logoBase64) doc.addImage(logoBase64, 'PNG', M, 7, 26, 26);

  const tx = M + 30;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...WHITE);
  doc.text('BHTL LOGISTICS LLC', tx, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(190, 210, 240);
  doc.text('Safety  •  Reliability  •  On Time  |  Dayton, Ohio', tx, 25);
  doc.text('MC-XXXXXX  |  DOT-XXXXXXX', tx, 31);

  // Title right side
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.text(title, pageW - M, 17, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(200, 220, 255);
  doc.text(subtitle, pageW - M, 24, { align: 'right' });
  doc.text(`Generated: ${today}`, pageW - M, 31, { align: 'right' });
}

// ─────────────────────────────────────────────────────────────────────
// PAGE FOOTER
// ─────────────────────────────────────────────────────────────────────
function drawFooters(doc, logoBase64, today, pageW, pageH, M) {
  const total = doc.internal.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const fy = pageH - 10;
    rule(doc, 0, fy - 3, pageW, BORDER);
    if (logoBase64) doc.addImage(logoBase64, 'PNG', M, fy - 2, 8, 8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...NAVY);
    doc.text('BHTL Logistics LLC', M + 11, fy + 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(...GRAY);
    doc.text('Dayton, Ohio  |  Confidential', M + 11, fy + 6);
    doc.text(`Page ${i} of ${total}  |  ${today}`, pageW - M, fy + 4, { align: 'right' });
  }
}

// ─────────────────────────────────────────────────────────────────────
// STAT BOX — small KPI tile
// ─────────────────────────────────────────────────────────────────────
function drawStatBox(doc, x, y, w, h, label, value, valueColor = BLACK) {
  filledRect(doc, x, y, w, h, LIGHT);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(x, y, w, h);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...GRAY);
  doc.text(label.toUpperCase(), x + 5, y + 7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...valueColor);
  doc.text(value, x + 5, y + h - 5);
}

// ─────────────────────────────────────────────────────────────────────
// MAIN: Generate settlement report PDF (single report)
// ─────────────────────────────────────────────────────────────────────
export async function generateReportPDF(report, loadItems) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 15;
  const W = pageW - M * 2;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const customDed = Array.isArray(report.custom_deductions)
    ? report.custom_deductions
    : (typeof report.custom_deductions === 'string'
        ? JSON.parse(report.custom_deductions || '[]') : []);

  const logoBase64 = await getLogoBase64();
  const includedLoads = (loadItems || []).filter(l => l.included !== false);
  const grossRevenue  = parseFloat(report.gross_revenue) || 0;
  const totalDed      = parseFloat(report.total_deductions) || 0;
  const netRevenue    = parseFloat(report.net_revenue) || (grossRevenue - totalDed);

  // ── HEADER ────────────────────────────────────────────────────────
  drawPageHeader(
    doc, logoBase64,
    'WEEKLY SETTLEMENT', report.report_number || '',
    today, pageW, M
  );

  // ── INFO STRIP ────────────────────────────────────────────────────
  let y = 48;
  const infoItems = [
    { label: 'Period', value: `${fmtDate(report.period_start)} – ${fmtDate(report.period_end)}` },
    report.truck_unit && { label: 'Truck', value: `#${report.truck_unit}${report.make ? ` ${report.make} ${report.model || ''}` : ''}` },
    report.driver_first && { label: 'Driver', value: `${report.driver_first} ${report.driver_last || ''}` },
    { label: 'Status', value: (report.status || 'draft').toUpperCase() },
  ].filter(Boolean);

  const colW = W / infoItems.length;
  infoItems.forEach((item, i) => {
    const ix = M + i * colW;
    // Left border accent
    doc.setFillColor(...ORANGE);
    doc.rect(ix, y, 2.5, 18, 'F');
    filledRect(doc, ix, y, colW - 2, 18, [250, 251, 253]);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(item.label, ix + 7, y + 7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...BLACK);
    doc.text(item.value, ix + 7, y + 14, { maxWidth: colW - 10 });
  });

  y += 24;
  rule(doc, M, y, W, BORDER);
  y += 7;

  // ── KPI ROW ───────────────────────────────────────────────────────
  const kpiW = (W - 6) / 4;
  [
    { label: 'Gross Revenue', value: fmt(grossRevenue), color: GREEN },
    { label: 'Total Deductions', value: `-${fmt(totalDed)}`, color: RED },
    { label: 'Net Revenue', value: fmt(Math.abs(netRevenue)), color: netRevenue >= 0 ? GREEN : RED },
    { label: 'Loads Included', value: `${includedLoads.length}`, color: NAVY },
  ].forEach((kpi, i) => {
    drawStatBox(doc, M + i * (kpiW + 2), y, kpiW, 22, kpi.label, kpi.value, kpi.color);
  });

  y += 28;

  // ── LOAD TABLE ────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text('LOAD BREAKDOWN', M, y);
  rule(doc, M, y + 2, W, NAVY, 0.5);
  y += 7;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Load #', 'Route', 'Pickup', 'Delivery', 'Miles', 'Rate', 'Driver Pay']],
    body: includedLoads.length > 0
      ? includedLoads.map(l => [
          l.load_number || '—',
          `${l.origin || '—'} → ${l.destination || '—'}`,
          fmtShort(l.pickup_date),
          fmtShort(l.delivery_date),
          l.miles ? Math.round(l.miles).toLocaleString() : '—',
          fmt(l.load_rate),
          fmt(l.driver_pay),
        ])
      : [['No loads included', '', '', '', '', '', '']],
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 3, textColor: BLACK, lineColor: BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5, cellPadding: 4 },
    alternateRowStyles: { fillColor: [249, 250, 252] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 22, textColor: [30, 80, 200] },
      1: { cellWidth: 55 },
      2: { cellWidth: 20, fontSize: 7 },
      3: { cellWidth: 20, fontSize: 7 },
      4: { halign: 'right', cellWidth: 16 },
      5: { halign: 'right', fontStyle: 'bold', textColor: GREEN, cellWidth: 24 },
      6: { halign: 'right', cellWidth: 22 },
    },
    foot: includedLoads.length > 0 ? [[
      'TOTALS', '', '', '', '',
      fmt(includedLoads.reduce((s, l) => s + (parseFloat(l.load_rate) || 0), 0)),
      fmt(includedLoads.reduce((s, l) => s + (parseFloat(l.driver_pay) || 0), 0)),
    ]] : undefined,
    footStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 8 },
    didParseCell(data) {
      if (data.section === 'foot' && data.column.index >= 5) data.cell.styles.textColor = [255, 190, 100];
    },
  });

  y = doc.lastAutoTable.finalY + 12;
  if (y > pageH - 120) { doc.addPage(); y = 20; }

  // ── DEDUCTIONS + REVENUE SUMMARY (2 columns) ──────────────────────
  const halfW = (W - 8) / 2;

  // Left: Deductions
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text('DEDUCTIONS', M, y);
  rule(doc, M, y + 2, halfW, NAVY, 0.5);
  y += 8;

  const deductions = [
    { label: 'Fuel Cost',                    val: report.fuel_cost },
    { label: 'ELD Fee (Rock ELD)',            val: report.eld_fee },
    { label: `Dispatching Fee (${report.dispatch_fee && report.gross_revenue ? Math.round((parseFloat(report.dispatch_fee)/parseFloat(report.gross_revenue))*100) : 4}%)`, val: report.dispatch_fee },
    { label: 'Insurance (÷ 4 weeks)',         val: report.insurance_fee },
    { label: 'Trailer Payment (÷ 4 weeks)',   val: report.trailer_payment },
    { label: 'Office / Authority',            val: report.office_authority_fee },
    { label: 'Driver Salary / Pay',           val: report.driver_salary },
    ...customDed.map(d => ({ label: d.name, val: d.amount })),
  ];

  let dy = y;
  deductions.forEach((ded, idx) => {
    if (parseFloat(ded.val) === 0 && !['Fuel Cost','Driver Salary / Pay'].includes(ded.label)) return;
    const bg = idx % 2 === 0 ? [248, 249, 252] : WHITE;
    filledRect(doc, M, dy - 1, halfW, 7.5, bg);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BLACK);
    doc.text(ded.label, M + 3, dy + 4);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...RED);
    doc.text(`-${fmt(ded.val)}`, M + halfW - 3, dy + 4, { align: 'right' });
    dy += 7.5;
  });

  // Total deductions bar
  dy += 2;
  filledRect(doc, M, dy, halfW, 10, NAVY);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...WHITE);
  doc.text('TOTAL DEDUCTIONS', M + 4, dy + 7);
  doc.setTextColor(255, 190, 100);
  doc.text(`-${fmt(report.total_deductions)}`, M + halfW - 3, dy + 7, { align: 'right' });

  // Right: Revenue summary
  const rx = M + halfW + 8;
  let ry = y - 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text('REVENUE SUMMARY', rx, ry);
  rule(doc, rx, ry + 2, halfW, NAVY, 0.5);
  ry += 8;

  const isProfit = netRevenue >= 0;
  [
    { label: 'Gross Revenue',  val: fmt(grossRevenue),                color: GREEN },
    { label: 'Fuel Cost',      val: `-${fmt(report.fuel_cost)}`,      color: RED },
    { label: 'Driver Pay',     val: `-${fmt(report.driver_salary)}`,  color: RED },
    { label: 'All Other Fees', val: `-${fmt(Math.max(0, totalDed - (parseFloat(report.fuel_cost)||0) - (parseFloat(report.driver_salary)||0)).toFixed(2))}`, color: RED },
    { label: 'Total Deductions', val: `-${fmt(totalDed)}`,            color: RED },
  ].forEach((row, idx) => {
    const bg = idx % 2 === 0 ? [248, 249, 252] : WHITE;
    filledRect(doc, rx, ry - 1, halfW, 7.5, bg);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BLACK);
    doc.text(row.label, rx + 3, ry + 4);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...row.color);
    doc.text(row.val, rx + halfW - 3, ry + 4, { align: 'right' });
    ry += 7.5;
  });

  // Net Revenue box
  ry += 5;
  const netColor = isProfit ? GREEN : RED;
  doc.setFillColor(isProfit ? 236 : 254, isProfit ? 253 : 242, isProfit ? 245 : 242);
  doc.rect(rx, ry, halfW, 28, 'F');
  doc.setDrawColor(...netColor);
  doc.setLineWidth(1);
  doc.rect(rx, ry, halfW, 28);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...netColor);
  doc.text(isProfit ? '✓ NET REVENUE' : '✗ NET LOSS', rx + halfW / 2, ry + 10, { align: 'center' });

  doc.setFontSize(20);
  doc.text(fmt(Math.abs(netRevenue)), rx + halfW / 2, ry + 23, { align: 'center' });

  // Notes
  const bottomY = Math.max(dy + 15, ry + 35);
  if (report.notes) {
    filledRect(doc, M, bottomY, W, 16, LIGHT);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text('NOTES', M + 4, bottomY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BLACK);
    doc.text(report.notes, M + 20, bottomY + 7, { maxWidth: W - 24 });
  }

  drawFooters(doc, logoBase64, today, pageW, pageH, M);
  return doc;
}

// ─────────────────────────────────────────────────────────────────────
// WEEKLY SUMMARY PDF — one or all trucks
// ─────────────────────────────────────────────────────────────────────
export async function generateWeeklySummaryPDF(data) {
  const { period, trucks, totals } = data;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 15;
  const W = pageW - M * 2;
  const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const logoBase64 = await getLogoBase64();

  const periodLabel = `${fmtDate(period.start)} – ${fmtDate(period.end)}`;
  const truckLabel  = trucks.length === 1 ? `Truck #${trucks[0].unit_number}` : `All Trucks (${trucks.length})`;

  // ── COVER / SUMMARY PAGE ─────────────────────────────────────────
  drawPageHeader(doc, logoBase64, 'WEEKLY REPORT', periodLabel, today, pageW, M);

  let y = 48;

  // Period info strip
  filledRect(doc, M, y, W, 20, [245, 247, 252]);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(M, y, W, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('REPORT PERIOD', M + 6, y + 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BLACK);
  doc.text(periodLabel, M + 6, y + 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text('COVERAGE', M + W / 2, y + 7);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BLACK);
  doc.text(truckLabel, M + W / 2, y + 15);
  y += 26;

  // Fleet KPIs
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text('FLEET SUMMARY', M, y);
  rule(doc, M, y + 2, W, NAVY, 0.5);
  y += 8;

  const kpiW = (W - 9) / 4;
  [
    { label: 'Gross Revenue',  value: fmt(totals.gross_revenue),  color: GREEN },
    { label: 'Total Fuel Cost', value: fmt(totals.fuel_cost),     color: RED },
    { label: 'Net After Fuel', value: fmt(totals.net_after_fuel), color: totals.net_after_fuel >= 0 ? GREEN : RED },
    { label: 'Total Loads',    value: `${totals.load_count}`,     color: NAVY },
  ].forEach((kpi, i) => {
    drawStatBox(doc, M + i * (kpiW + 3), y, kpiW, 24, kpi.label, kpi.value, kpi.color);
  });
  y += 32;

  // Per-truck summary table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text('PER-TRUCK BREAKDOWN', M, y);
  rule(doc, M, y + 2, W, NAVY, 0.5);
  y += 7;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Truck', 'Driver', 'Loads', 'Gross Revenue', 'Fuel Cost', 'Net After Fuel', 'Driver Pay']],
    body: trucks.map(t => [
      `#${t.unit_number}`,
      t.driver_first ? `${t.driver_first} ${t.driver_last || ''}` : '—',
      `${t.load_count}`,
      fmt(t.gross_revenue),
      fmt(t.fuel_cost),
      fmt(t.net_after_fuel),
      fmt(t.driver_pay),
    ]),
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 3.5, textColor: BLACK, lineColor: BORDER, lineWidth: 0.2 },
    headStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [249, 250, 252] },
    columnStyles: {
      0: { fontStyle: 'bold', textColor: NAVY, cellWidth: 20 },
      1: { cellWidth: 38 },
      2: { halign: 'center', cellWidth: 15 },
      3: { halign: 'right', textColor: GREEN, fontStyle: 'bold' },
      4: { halign: 'right', textColor: RED },
      5: { halign: 'right', fontStyle: 'bold' },
      6: { halign: 'right' },
    },
    foot: [[
      'TOTALS', '', `${totals.load_count}`,
      fmt(totals.gross_revenue), fmt(totals.fuel_cost), fmt(totals.net_after_fuel), '',
    ]],
    footStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold' },
    didParseCell(data) {
      if (data.section === 'foot' && data.column.index === 3) data.cell.styles.textColor = [100, 255, 180];
      if (data.section === 'foot' && data.column.index === 5) data.cell.styles.textColor = [100, 255, 180];
    },
  });

  y = doc.lastAutoTable.finalY + 14;

  // ── PER-TRUCK DETAIL PAGES ───────────────────────────────────────
  for (const truck of trucks) {
    if (truck.loads.length === 0 && truck.load_count === 0) continue;

    doc.addPage();
    drawPageHeader(doc, logoBase64, `TRUCK #${truck.unit_number}`, periodLabel, today, pageW, M);

    let py = 48;

    // Truck & driver info
    const cols = [
      ['Truck Unit', `#${truck.unit_number}${truck.make ? ` — ${truck.make} ${truck.model || ''}` : ''}`],
      ['Driver', truck.driver_first ? `${truck.driver_first} ${truck.driver_last || ''}` : '—'],
      ['Phone', truck.driver_phone || '—'],
      ['Period', periodLabel],
    ];
    const cw = W / cols.length;
    cols.forEach(([label, value], i) => {
      const cx = M + i * cw;
      doc.setFillColor(...ORANGE);
      doc.rect(cx, py, 3, 18, 'F');
      filledRect(doc, cx, py, cw - 2, 18, [250, 251, 253]);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(...GRAY);
      doc.text(label, cx + 7, py + 7);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...BLACK);
      doc.text(value, cx + 7, py + 14, { maxWidth: cw - 10 });
    });
    py += 24;

    // Truck KPIs
    const tKpiW = (W - 6) / 4;
    [
      { label: 'Gross Revenue',  value: fmt(truck.gross_revenue),  color: GREEN },
      { label: 'Fuel Cost',      value: fmt(truck.fuel_cost),      color: RED },
      { label: 'Net After Fuel', value: fmt(truck.net_after_fuel), color: truck.net_after_fuel >= 0 ? GREEN : RED },
      { label: 'Loads',          value: `${truck.load_count}`,     color: NAVY },
    ].forEach((kpi, i) => {
      drawStatBox(doc, M + i * (tKpiW + 2), py, tKpiW, 22, kpi.label, kpi.value, kpi.color);
    });
    py += 29;

    // Fuel sub-stats
    if (truck.fuel_cost > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      const fuelDetail = `⛽  ${truck.fuel_purchases} fuel purchase${truck.fuel_purchases !== 1 ? 's' : ''}  •  ${(truck.total_gallons || 0).toFixed(1)} gallons  •  Avg $${truck.total_gallons > 0 ? (truck.fuel_cost / truck.total_gallons).toFixed(3) : '—'}/gal`;
      doc.text(fuelDetail, M, py);
      py += 10;
    }

    // Loads table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text('LOADS THIS WEEK', M, py);
    rule(doc, M, py + 2, W, NAVY, 0.5);
    py += 7;

    if (truck.loads.length === 0) {
      filledRect(doc, M, py, W, 14, LIGHT);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...GRAY);
      doc.text('No loads delivered this week', M + W / 2, py + 9, { align: 'center' });
      py += 20;
    } else {
      autoTable(doc, {
        startY: py,
        margin: { left: M, right: M },
        head: [['Load #', 'Route', 'Pickup', 'Delivery', 'Miles', 'Rate']],
        body: truck.loads.map(l => [
          l.load_number || '—',
          `${l.origin || '—'} → ${l.destination || '—'}`,
          fmtShort(l.pickup_date),
          fmtShort(l.delivery_date),
          l.miles ? Math.round(l.miles).toLocaleString() : '—',
          fmt(l.rate),
        ]),
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 3.5, textColor: BLACK, lineColor: BORDER, lineWidth: 0.2 },
        headStyles: { fillColor: TEAL, textColor: WHITE, fontStyle: 'bold', fontSize: 7.5 },
        alternateRowStyles: { fillColor: [249, 250, 252] },
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 24, textColor: [30, 80, 200] },
          1: { cellWidth: 65 },
          2: { cellWidth: 20, fontSize: 7 },
          3: { cellWidth: 20, fontSize: 7 },
          4: { halign: 'right', cellWidth: 18 },
          5: { halign: 'right', fontStyle: 'bold', textColor: GREEN },
        },
        foot: [[
          'TOTAL', '', '', '', '',
          fmt(truck.loads.reduce((s, l) => s + (l.rate || 0), 0)),
        ]],
        footStyles: { fillColor: NAVY, textColor: WHITE, fontStyle: 'bold' },
        didParseCell(data) {
          if (data.section === 'foot' && data.column.index === 5) data.cell.styles.textColor = [100, 255, 180];
        },
      });
    }
  }

  drawFooters(doc, logoBase64, today, pageW, pageH, M);
  return doc;
}

// ─────────────────────────────────────────────────────────────────────
// DOWNLOAD helpers
// ─────────────────────────────────────────────────────────────────────
export async function downloadReportPDF(report, loadItems) {
  const doc = await generateReportPDF(report, loadItems);
  const filename = `BHTL_Report_${report.report_number || 'Report'}_${(report.period_start || '').slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
}

export async function downloadWeeklySummaryPDF(data, truckLabel = 'All') {
  const doc = await generateWeeklySummaryPDF(data);
  const start = (data.period?.start || '').slice(0, 10);
  const filename = `BHTL_Weekly_${truckLabel}_${start}.pdf`;
  doc.save(filename);
  return filename;
}

// ─────────────────────────────────────────────────────────────────────
// WHATSAPP SHARE
// ─────────────────────────────────────────────────────────────────────
export async function shareReportViaWhatsApp(report, loadItems) {
  const doc = await generateReportPDF(report, loadItems);
  const filename = `BHTL_Report_${report.report_number || 'Report'}_${(report.period_start || '').slice(0, 10)}.pdf`;
  const pdfBlob = doc.output('blob');
  const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

  if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    try {
      await navigator.share({
        title: `BHTL Weekly Report - ${report.report_number}`,
        text: `Weekly Report: ${fmtDate(report.period_start)} to ${fmtDate(report.period_end)}\nNet Revenue: ${fmt(report.net_revenue)}`,
        files: [pdfFile],
      });
      return { method: 'native_share' };
    } catch (err) {
      if (err.name === 'AbortError') return { method: 'cancelled' };
    }
  }

  doc.save(filename);
  const waText = encodeURIComponent(
    `📋 *BHTL Logistics LLC — Weekly Report*\n` +
    `Report: ${report.report_number || ''}\n` +
    `Period: ${fmtDate(report.period_start)} – ${fmtDate(report.period_end)}\n` +
    (report.truck_unit ? `Truck: #${report.truck_unit}\n` : '') +
    (report.driver_first ? `Driver: ${report.driver_first} ${report.driver_last}\n` : '') +
    `\n💰 Gross Revenue: ${fmt(report.gross_revenue)}\n` +
    `📉 Total Deductions: -${fmt(report.total_deductions)}\n` +
    `✅ *Net Revenue: ${fmt(report.net_revenue)}*\n` +
    `\n📎 PDF downloaded — please attach it to this message.`
  );
  setTimeout(() => window.open(`https://wa.me/?text=${waText}`, '_blank'), 600);
  return { method: 'download_then_whatsapp', filename };
}
