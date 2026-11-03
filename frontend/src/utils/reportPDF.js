import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Brand Colors (matching app palette) ──────────────────────────────────
const NAVY        = [10,  25,  47];    // #0A1929 — deep navy header
const NAVY2       = [15,  36,  64];    // slightly lighter navy
const ORANGE      = [249, 115, 22];    // #F97316 brand orange
const ORANGE_DARK = [234, 88,  12];    // darker orange
const WHITE       = [255, 255, 255];
const LIGHT_BG    = [248, 250, 252];   // table alt row
const DARK_CARD   = [23,  37,  63];    // card background
const RED         = [239, 68,  68];
const GREEN       = [16,  185, 129];
const GREEN_DARK  = [5,   150, 105];
const MUTED       = [100, 116, 139];
const SLATE       = [51,  65,  85];
const BORDER      = [226, 232, 240];

// ── Formatters ────────────────────────────────────────────────────────────
const fmt = (n) => {
  if (n == null || n === '') return '$0.00';
  const val = parseFloat(n);
  return `$${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
};

// ── Load logo as base64 ────────────────────────────────────────────────────
async function getLogoBase64() {
  try {
    const res = await fetch('/bhtl-logo.png');
    if (!res.ok) throw new Error('Logo not found');
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ── Draw diagonal stripe pattern (premium background texture) ─────────────
function drawHeaderTexture(doc, x, y, w, h) {
  doc.setDrawColor(255, 255, 255, 8);
  doc.setLineWidth(0.3);
  for (let i = -h; i < w; i += 10) {
    doc.line(x + i, y, x + i + h, y + h);
  }
}

// ── Rounded filled rectangle ───────────────────────────────────────────────
function filledRoundRect(doc, x, y, w, h, r, color) {
  doc.setFillColor(...color);
  doc.roundedRect(x, y, w, h, r, r, 'F');
}

// ── Main PDF generator ─────────────────────────────────────────────────────
export async function generateReportPDF(report, loadItems) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  const contentW = pageW - margin * 2;
  const reportDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const customDed = Array.isArray(report.custom_deductions)
    ? report.custom_deductions
    : (typeof report.custom_deductions === 'string'
        ? JSON.parse(report.custom_deductions || '[]')
        : []);

  // ── LOAD LOGO ─────────────────────────────────────────────────────────
  const logoBase64 = await getLogoBase64();

  // ================================================================
  // PAGE 1 — HEADER
  // ================================================================

  // Primary header band — navy gradient effect (two rects)
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, pageW, 52, 'F');
  doc.setFillColor(...NAVY2);
  doc.rect(0, 30, pageW, 22, 'F');

  // Orange accent bar at top
  doc.setFillColor(...ORANGE);
  doc.rect(0, 0, pageW, 3.5, 'F');

  // Left side: Logo
  if (logoBase64) {
    // Logo circular background
    doc.setFillColor(0, 0, 0);
    doc.circle(margin + 22, 28, 22, 'F');
    doc.addImage(logoBase64, 'JPEG', margin + 2, 8, 40, 40);
  } else {
    // Fallback text logo box
    doc.setFillColor(...ORANGE);
    doc.roundedRect(margin, 8, 36, 36, 4, 4, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...WHITE);
    doc.text('BHTL', margin + 18, 28, { align: 'center' });
  }

  // Company name and tagline
  const cx = margin + 48;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(...WHITE);
  doc.text('BHTL LOGISTICS LLC', cx, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...ORANGE);
  doc.text('Safety  •  Reliability  •  On Time', cx, 28);

  doc.setFontSize(8);
  doc.setTextColor(180, 200, 230);
  doc.text('Dayton, Ohio', cx, 35);
  if (report.dot_number || report.mc_number) {
    const regInfo = [report.dot_number && `DOT: ${report.dot_number}`, report.mc_number && `MC: ${report.mc_number}`].filter(Boolean).join('  |  ');
    doc.text(regInfo, cx, 41);
  }

  // Right side: Report type badge
  const rxBadge = pageW - margin - 50;
  doc.setFillColor(...ORANGE);
  doc.roundedRect(rxBadge, 8, 50, 16, 3, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...WHITE);
  const reportTypeLabel = (report.report_type || 'weekly').toUpperCase() + ' REPORT';
  doc.text(reportTypeLabel, rxBadge + 25, 18, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(180, 200, 230);
  doc.text(report.report_number || '', rxBadge + 25, 30, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(...MUTED);
  doc.text(`Generated: ${reportDate}`, rxBadge + 25, 37, { align: 'center' });
  doc.text(`Period: ${fmtDate(report.period_start)} – ${fmtDate(report.period_end)}`, rxBadge + 25, 43, { align: 'center' });

  // Bottom orange separator line
  doc.setFillColor(...ORANGE);
  doc.rect(0, 52, pageW, 2.5, 'F');

  // ── SUMMARY STAT CARDS ────────────────────────────────────────────────
  let y = 62;
  const cardCount = 4;
  const cardGap = 5;
  const cardW = (contentW - cardGap * (cardCount - 1)) / cardCount;

  const includedLoads = (loadItems || []).filter(l => l.included !== false);
  const grossRevenue = parseFloat(report.gross_revenue) || includedLoads.reduce((s, l) => s + (parseFloat(l.load_rate) || 0), 0);
  const totalDed = parseFloat(report.total_deductions) || 0;
  const netRevenue = parseFloat(report.net_revenue) || (grossRevenue - totalDed);

  const statCards = [
    { label: 'GROSS REVENUE', value: fmt(grossRevenue), color: GREEN, icon: '↑' },
    { label: 'TOTAL DEDUCTIONS', value: `-${fmt(totalDed)}`, color: RED, icon: '↓' },
    { label: 'NET REVENUE', value: fmt(netRevenue), color: netRevenue >= 0 ? GREEN : RED, icon: netRevenue >= 0 ? '✓' : '!' },
    { label: 'LOADS INCLUDED', value: includedLoads.length.toString(), color: ORANGE, icon: '●' },
  ];

  statCards.forEach((card, i) => {
    const cx2 = margin + i * (cardW + cardGap);

    // Card background
    doc.setFillColor(...DARK_CARD);
    doc.roundedRect(cx2, y, cardW, 26, 3, 3, 'F');

    // Left color accent
    doc.setFillColor(...card.color);
    doc.roundedRect(cx2, y, 3, 26, 1.5, 1.5, 'F');

    // Label
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text(card.label, cx2 + 8, y + 9);

    // Value
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(i === 3 ? 18 : 11);
    doc.setTextColor(...card.color);
    doc.text(card.value, cx2 + 8, y + 20, { maxWidth: cardW - 12 });
  });

  y += 34;

  // ── INFO SECTION (Truck / Driver) ─────────────────────────────────────
  const infoRows = [
    report.truck_unit && { label: 'TRUCK', value: `#${report.truck_unit}${report.make ? ` – ${report.make} ${report.model || ''}` : ''}`.trim() },
    report.driver_first && { label: 'DRIVER', value: `${report.driver_first} ${report.driver_last || ''}` + (report.driver_phone ? `  •  ${report.driver_phone}` : '') },
    { label: 'REPORT STATUS', value: (report.status || 'draft').toUpperCase() },
  ].filter(Boolean);

  if (infoRows.length > 0) {
    const infoW = contentW / infoRows.length;
    infoRows.forEach((info, i) => {
      const ix = margin + i * infoW;
      doc.setFillColor(...DARK_CARD);
      doc.rect(ix, y, infoW - 4, 16, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.setTextColor(...ORANGE);
      doc.text(info.label, ix + 5, y + 6);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(...WHITE);
      doc.text(info.value, ix + 5, y + 13, { maxWidth: infoW - 10 });
    });
    y += 22;
  }

  // ── LOADS TABLE ───────────────────────────────────────────────────────
  // Section title
  doc.setFillColor(...NAVY);
  doc.rect(margin, y, contentW, 9, 'F');
  doc.setFillColor(...ORANGE);
  doc.rect(margin, y, 4, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text('LOAD BREAKDOWN', margin + 8, y + 6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 200, 230);
  doc.text(`${includedLoads.length} load${includedLoads.length !== 1 ? 's' : ''} included`, pageW - margin, y + 6, { align: 'right' });

  y += 11;

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
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
      cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
      textColor: SLATE,
      lineColor: BORDER,
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: { fillColor: LIGHT_BG },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 22, textColor: [37, 99, 235] },
      1: { cellWidth: 54 },
      2: { cellWidth: 21, fontSize: 7 },
      3: { cellWidth: 21, fontSize: 7 },
      4: { halign: 'right', cellWidth: 17 },
      5: { halign: 'right', fontStyle: 'bold', textColor: GREEN_DARK, cellWidth: 24 },
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
        data.cell.styles.textColor = ORANGE;
      }
    },
  });

  y = doc.lastAutoTable.finalY + 12;

  // ── FINANCIAL SECTION ─────────────────────────────────────────────────
  if (y > pageH - 120) {
    doc.addPage();
    y = 20;
  }

  const halfW = (contentW - 8) / 2;

  // ── LEFT: DEDUCTIONS BREAKDOWN ─────────────────────────────────────────
  // Section header
  doc.setFillColor(...NAVY);
  doc.rect(margin, y, halfW, 9, 'F');
  doc.setFillColor(239, 68, 68);
  doc.rect(margin, y, 4, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text('DEDUCTIONS', margin + 8, y + 6);

  const deductionsList = [
    { label: 'Fuel Cost',                    val: report.fuel_cost,            emoji: '⛽' },
    { label: 'ELD Fee (Rock ELD $35/wk)',     val: report.eld_fee,              emoji: '🛰' },
    { label: 'Dispatching Fee (4%)',          val: report.dispatch_fee,         emoji: '📞' },
    { label: 'Insurance ($2,000/mo ÷ 4)',     val: report.insurance_fee,        emoji: '🛡' },
    { label: 'Trailer Payment ($600/mo ÷ 4)', val: report.trailer_payment,      emoji: '🚛' },
    { label: 'Office / Authority (12%)',       val: report.office_authority_fee, emoji: '🏢' },
    { label: 'Driver Salary',                 val: report.driver_salary,        emoji: '👤' },
    ...customDed.map(d => ({ label: d.name, val: d.amount, emoji: '➖' })),
  ];

  let dy = y + 12;
  deductionsList.forEach((ded, idx) => {
    // Alternating row background
    if (idx % 2 === 0) {
      doc.setFillColor(23, 37, 63, 0.4);
      doc.rect(margin, dy - 3, halfW, 9, 'F');
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    doc.text(ded.label, margin + 5, dy + 2.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...RED);
    doc.text(`-${fmt(ded.val)}`, margin + halfW - 4, dy + 2.5, { align: 'right' });

    dy += 9;
  });

  // Total deductions bar
  dy += 2;
  doc.setFillColor(...NAVY);
  doc.rect(margin, dy, halfW, 11, 'F');
  doc.setFillColor(...RED);
  doc.rect(margin, dy, 4, 11, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text('TOTAL DEDUCTIONS', margin + 8, dy + 7.5);
  doc.setTextColor(255, 150, 150);
  doc.text(`-${fmt(report.total_deductions)}`, margin + halfW - 4, dy + 7.5, { align: 'right' });

  // ── RIGHT: REVENUE SUMMARY ─────────────────────────────────────────────
  const rx = margin + halfW + 8;

  // Section header
  doc.setFillColor(...NAVY);
  doc.rect(rx, y, halfW, 9, 'F');
  doc.setFillColor(...GREEN);
  doc.rect(rx, y, 4, 9, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...WHITE);
  doc.text('FINANCIAL SUMMARY', rx + 8, y + 6);

  const summaryItems = [
    { label: 'Gross Revenue',    val: fmt(grossRevenue),       color: GREEN,  isBold: true },
    { label: 'Total Deductions', val: `-${fmt(totalDed)}`,     color: RED,    isBold: false },
    { label: 'Fuel Cost',        val: `-${fmt(report.fuel_cost)}`, color: MUTED, isBold: false },
    { label: 'Driver Salary',    val: `-${fmt(report.driver_salary)}`, color: MUTED, isBold: false },
    { label: 'Fees & Deductions',val: `-${fmt((totalDed - (parseFloat(report.fuel_cost)||0) - (parseFloat(report.driver_salary)||0)).toFixed(2))}`, color: MUTED, isBold: false },
  ];

  let ry = y + 12;
  summaryItems.forEach((row, idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(23, 37, 63, 0.4);
      doc.rect(rx, ry - 3, halfW, 9, 'F');
    }
    doc.setFont('helvetica', row.isBold ? 'bold' : 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...SLATE);
    doc.text(row.label, rx + 5, ry + 2.5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...row.color);
    doc.text(row.val, rx + halfW - 4, ry + 2.5, { align: 'right' });
    ry += 9;
  });

  // Net Revenue Hero Box
  ry += 6;
  const isProfit = netRevenue >= 0;
  const netBg = isProfit ? [4, 47, 46] : [69, 10, 10];
  const netBorderColor = isProfit ? GREEN : RED;
  const netTextColor = isProfit ? [52, 211, 153] : [252, 165, 165];

  doc.setFillColor(...netBg);
  doc.roundedRect(rx, ry, halfW, 30, 4, 4, 'F');
  doc.setDrawColor(...netBorderColor);
  doc.setLineWidth(1);
  doc.roundedRect(rx, ry, halfW, 30, 4, 4);

  // Orange glow top line
  doc.setFillColor(...netBorderColor);
  doc.rect(rx + 4, ry, halfW - 8, 1.5, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...netBorderColor);
  doc.text(isProfit ? '✓ PROFITABLE WEEK' : '⚠ NET LOSS', rx + halfW / 2, ry + 9, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...netTextColor);
  doc.text(fmt(Math.abs(netRevenue)), rx + halfW / 2, ry + 22, { align: 'center' });

  // Notes (if any)
  const bottomY = Math.max(dy + 13, ry + 36);
  if (report.notes) {
    const noteY = bottomY + 8;
    doc.setFillColor(...DARK_CARD);
    doc.roundedRect(margin, noteY, contentW, 16, 2, 2, 'F');
    doc.setFillColor(...ORANGE);
    doc.rect(margin, noteY, 4, 16, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...ORANGE);
    doc.text('NOTES', margin + 8, noteY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...WHITE);
    doc.setFontSize(7.5);
    doc.text(report.notes, margin + 32, noteY + 7, { maxWidth: contentW - 36 });
  }

  // ================================================================
  // FOOTER — on all pages
  // ================================================================
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const footerY = pageH - 16;

    // Footer band
    doc.setFillColor(...NAVY);
    doc.rect(0, footerY - 2, pageW, 18, 'F');
    doc.setFillColor(...ORANGE);
    doc.rect(0, footerY - 2, pageW, 2, 'F');

    // Logo small in footer
    if (logoBase64) {
      doc.addImage(logoBase64, 'JPEG', margin, footerY - 1, 12, 12);
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...ORANGE);
    doc.text('BHTL LOGISTICS LLC', margin + 15, footerY + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...MUTED);
    doc.text('Dayton, Ohio  |  This is a confidential financial document', margin + 15, footerY + 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(`Page ${i} of ${totalPages}  |  ${reportDate}`, pageW - margin, footerY + 7, { align: 'right' });
  }

  return doc;
}

// ── Download PDF ────────────────────────────────────────────────────────────
export async function downloadReportPDF(report, loadItems) {
  const doc = await generateReportPDF(report, loadItems);
  const filename = `BHTL_Report_${report.report_number || 'Report'}_${(report.period_start || '').slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
}

// ── Share PDF via WhatsApp ──────────────────────────────────────────────────
export async function shareReportViaWhatsApp(report, loadItems) {
  const doc = await generateReportPDF(report, loadItems);
  const filename = `BHTL_Report_${report.report_number || 'Report'}_${(report.period_start || '').slice(0, 10)}.pdf`;

  const pdfBlob = doc.output('blob');
  const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' });

  // Try native Web Share API (mobile — shares directly to WhatsApp)
  if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    try {
      await navigator.share({
        title: `BHTL Weekly Report - ${report.report_number}`,
        text: `Weekly Report for ${fmtDate(report.period_start)} to ${fmtDate(report.period_end)}\nNet Revenue: ${fmt(report.net_revenue)}`,
        files: [pdfFile],
      });
      return { method: 'native_share' };
    } catch (err) {
      if (err.name === 'AbortError') return { method: 'cancelled' };
      // Fall through to download
    }
  }

  // Desktop fallback: download PDF then open WhatsApp
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
    `\n📎 Branded PDF has been downloaded — please attach it to this message.`
  );

  setTimeout(() => window.open(`https://wa.me/?text=${waText}`, '_blank'), 600);
  return { method: 'download_then_whatsapp', filename };
}
