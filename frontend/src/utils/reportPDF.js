import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Colors (clean, easy to read) ─────────────────────────────────────────
const NAVY   = [15, 40, 80];
const ORANGE = [217, 95, 14];
const WHITE  = [255, 255, 255];
const GRAY   = [100, 116, 139];
const LIGHT  = [248, 249, 251];
const RED    = [200, 40, 40];
const GREEN  = [22, 140, 90];
const BLACK  = [30, 30, 40];
const BORDER = [210, 218, 228];

const fmt = (n) => {
  if (n == null || n === '') return '$0.00';
  return `$${Math.abs(parseFloat(n) || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
};

// ── Thin horizontal rule ──────────────────────────────────────────────────
function rule(doc, x, y, w, color = BORDER) {
  doc.setDrawColor(...color);
  doc.setLineWidth(0.3);
  doc.line(x, y, x + w, y);
}

// ── Load logo as base64 ───────────────────────────────────────────────────
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

// ── Main PDF generator ────────────────────────────────────────────────────
export async function generateReportPDF(report, loadItems) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 16; // margin
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

  // ── HEADER ────────────────────────────────────────────────────────────
  // White page — navy top strip
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 38, 'F');

  // Orange accent bar at top edge
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, pageW, 2.5, 'F');

  // Logo
  if (logoBase64) {
    doc.addImage(logoBase64, 'JPEG', M, 5, 28, 28);
  }

  // Company name + tagline
  const tx = M + 32;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...WHITE);
  doc.text('BHTL LOGISTICS LLC', tx, 17);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(200, 215, 240);
  doc.text('Safety  •  Reliability  •  On Time  |  Dayton, Ohio', tx, 24);

  // Report title on right
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...WHITE);
  doc.text('WEEKLY REPORT', pageW - M, 16, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(220, 230, 250);
  doc.text(report.report_number || '', pageW - M, 23, { align: 'right' });
  doc.text(`Generated: ${today}`, pageW - M, 30, { align: 'right' });

  // ── INFO ROW ──────────────────────────────────────────────────────────
  let y = 46;
  const infoItems = [
    { label: 'Period', value: `${fmtDate(report.period_start)} – ${fmtDate(report.period_end)}` },
    report.truck_unit && { label: 'Truck', value: `#${report.truck_unit}${report.make ? ` ${report.make} ${report.model || ''}` : ''}` },
    report.driver_first && { label: 'Driver', value: `${report.driver_first} ${report.driver_last || ''}` },
    { label: 'Status', value: (report.status || 'draft').toUpperCase() },
  ].filter(Boolean);

  const colW = W / infoItems.length;
  infoItems.forEach((item, i) => {
    const ix = M + i * colW;
    doc.setFillColor(...LIGHT);
    doc.rect(ix, y, colW - 3, 16, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(item.label.toUpperCase(), ix + 5, y + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.text(item.value, ix + 5, y + 13, { maxWidth: colW - 8 });
  });

  y += 22;

  // ── SUMMARY NUMBERS ───────────────────────────────────────────────────
  rule(doc, M, y, W);
  y += 4;

  const summaryItems = [
    { label: 'Gross Revenue', value: fmt(grossRevenue), color: GREEN },
    { label: 'Total Deductions', value: `-${fmt(totalDed)}`, color: RED },
    { label: 'Net Revenue', value: fmt(Math.abs(netRevenue)), color: netRevenue >= 0 ? GREEN : RED },
    { label: 'Loads Included', value: `${includedLoads.length}`, color: NAVY },
  ];

  const sumW = W / summaryItems.length;
  summaryItems.forEach((s, i) => {
    const sx = M + i * sumW;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.text(s.label, sx, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...s.color);
    doc.text(s.value, sx, y + 13);
  });

  y += 18;
  rule(doc, M, y, W);
  y += 8;

  // ── LOAD BREAKDOWN TABLE ──────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text('LOAD BREAKDOWN', M, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY);
  doc.text(`${includedLoads.length} load${includedLoads.length !== 1 ? 's' : ''} included`, pageW - M, y, { align: 'right' });

  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    head: [['Load #', 'Route', 'Pickup', 'Delivery', 'Miles', 'Rate', 'Driver Pay']],
    body: includedLoads.length > 0
      ? includedLoads.map(l => [
          l.load_number || '—',
          `${l.origin || '—'} → ${l.destination || '—'}`,
          fmtDate(l.pickup_date),
          fmtDate(l.delivery_date),
          l.miles ? Math.round(l.miles).toLocaleString() : '—',
          fmt(l.load_rate),
          fmt(l.driver_pay),
        ])
      : [['No loads included', '', '', '', '', '', '']],
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 3.5,
      textColor: BLACK,
      lineColor: BORDER,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: LIGHT },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 22, textColor: [37, 99, 235] },
      1: { cellWidth: 54 },
      2: { cellWidth: 22, fontSize: 7 },
      3: { cellWidth: 22, fontSize: 7 },
      4: { halign: 'right', cellWidth: 17 },
      5: { halign: 'right', fontStyle: 'bold', textColor: GREEN, cellWidth: 24 },
      6: { halign: 'right', cellWidth: 24 },
    },
    foot: includedLoads.length > 0 ? [[
      'TOTALS', '', '', '', '',
      fmt(includedLoads.reduce((s, l) => s + (parseFloat(l.load_rate) || 0), 0)),
      fmt(includedLoads.reduce((s, l) => s + (parseFloat(l.driver_pay) || 0), 0)),
    ]] : undefined,
    footStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 8,
    },
    didParseCell(data) {
      if (data.section === 'foot' && data.column.index >= 5) {
        data.cell.styles.textColor = [255, 180, 80];
      }
    },
  });

  y = doc.lastAutoTable.finalY + 10;

  // ── FINANCIAL SECTION — check for new page ────────────────────────────
  if (y > pageH - 130) { doc.addPage(); y = 20; }

  const halfW = (W - 6) / 2;

  // ── DEDUCTIONS (left column) ──────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text('DEDUCTIONS', M, y);
  rule(doc, M, y + 2, halfW, NAVY);

  y += 8;

  const deductionsList = [
    { label: 'Fuel Cost',                     val: report.fuel_cost },
    { label: 'ELD Fee (Rock ELD $35/wk)',      val: report.eld_fee },
    { label: 'Dispatching Fee (4%)',           val: report.dispatch_fee },
    { label: 'Insurance ($2,000/mo ÷ 4)',      val: report.insurance_fee },
    { label: 'Trailer Payment ($600/mo ÷ 4)', val: report.trailer_payment },
    { label: 'Office / Authority (12%)',        val: report.office_authority_fee },
    { label: 'Driver Salary',                  val: report.driver_salary },
    ...customDed.map(d => ({ label: d.name, val: d.amount })),
  ];

  let dy = y;
  deductionsList.forEach((ded, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(...LIGHT);
      doc.rect(M, dy - 1, halfW, 7.5, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BLACK);
    doc.text(ded.label, M + 3, dy + 4);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...RED);
    doc.text(`-${fmt(ded.val)}`, M + halfW - 3, dy + 4, { align: 'right' });
    dy += 7.5;
  });

  // Total deductions
  dy += 2;
  doc.setFillColor(...NAVY);
  doc.rect(M, dy, halfW, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...WHITE);
  doc.text('TOTAL DEDUCTIONS', M + 3, dy + 6);
  doc.setTextColor(255, 200, 140);
  doc.text(`-${fmt(report.total_deductions)}`, M + halfW - 3, dy + 6, { align: 'right' });

  // ── REVENUE SUMMARY (right column) ───────────────────────────────────
  const rx = M + halfW + 6;
  let ry = y - 8;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text('REVENUE SUMMARY', rx, ry);
  rule(doc, rx, ry + 2, halfW, NAVY);

  ry += 8;

  const summaryRows = [
    { label: 'Gross Revenue',    val: fmt(grossRevenue),           color: GREEN },
    { label: 'Fuel Cost',        val: `-${fmt(report.fuel_cost)}`, color: RED },
    { label: 'Driver Salary',    val: `-${fmt(report.driver_salary)}`, color: RED },
    { label: 'All Other Fees',   val: `-${fmt((totalDed - (parseFloat(report.fuel_cost) || 0) - (parseFloat(report.driver_salary) || 0)).toFixed(2))}`, color: RED },
    { label: 'Total Deductions', val: `-${fmt(totalDed)}`,         color: RED },
  ];

  summaryRows.forEach((row, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(...LIGHT);
      doc.rect(rx, ry - 1, halfW, 7.5, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...BLACK);
    doc.text(row.label, rx + 3, ry + 4);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...row.color);
    doc.text(row.val, rx + halfW - 3, ry + 4, { align: 'right' });
    ry += 7.5;
  });

  // Net Revenue box — simple, clean
  ry += 4;
  const isProfit = netRevenue >= 0;
  const netBorderR = isProfit ? GREEN[0] : RED[0];
  const netBorderG = isProfit ? GREEN[1] : RED[1];
  const netBorderB = isProfit ? GREEN[2] : RED[2];
  doc.setFillColor(isProfit ? 240 : 255, isProfit ? 249 : 240, isProfit ? 244 : 240);
  doc.rect(rx, ry, halfW, 24, 'F');
  doc.setDrawColor(netBorderR, netBorderG, netBorderB);
  doc.setLineWidth(0.8);
  doc.rect(rx, ry, halfW, 24);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(netBorderR, netBorderG, netBorderB);
  doc.text(isProfit ? 'NET REVENUE' : 'NET LOSS', rx + halfW / 2, ry + 9, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(netBorderR, netBorderG, netBorderB);
  doc.text(fmt(Math.abs(netRevenue)), rx + halfW / 2, ry + 20, { align: 'center' });

  // Notes
  const bottomY = Math.max(dy + 12, ry + 30);
  if (report.notes) {
    const noteY = bottomY + 6;
    doc.setFillColor(...LIGHT);
    doc.rect(M, noteY, W, 14, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text('NOTES', M + 4, noteY + 6);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...BLACK);
    doc.text(report.notes, M + 20, noteY + 6, { maxWidth: W - 24 });
  }

  // ── FOOTER ────────────────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const fy = pageH - 12;

    rule(doc, 0, fy - 2, pageW, BORDER);

    if (logoBase64) doc.addImage(logoBase64, 'JPEG', M, fy - 2, 9, 9);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...NAVY);
    doc.text('BHTL Logistics LLC', M + 12, fy + 3);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...GRAY);
    doc.text('Dayton, Ohio  |  Confidential financial document', M + 12, fy + 7.5);

    doc.text(`Page ${i} of ${totalPages}  |  ${today}`, pageW - M, fy + 5, { align: 'right' });
  }

  return doc;
}

// ── Download PDF ──────────────────────────────────────────────────────────
export async function downloadReportPDF(report, loadItems) {
  const doc = await generateReportPDF(report, loadItems);
  const filename = `BHTL_Report_${report.report_number || 'Report'}_${(report.period_start || '').slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
}

// ── Share PDF via WhatsApp ────────────────────────────────────────────────
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

  // Desktop fallback
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
