import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import logoUrl from '../assets/blueberry-logo.png';
import defaultSigUrl from '../assets/signature.png';
import type { ResortSettings } from '../types';

function formatRs(val: number | string | undefined | null): string {
  const n = Number(val || 0);
  return `Rs. ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(val?: string | null): string {
  if (!val) return '-';
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return String(val);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function loadImageAsDataUrl(src: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith('data:image/')) return src;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function buildUpiUri(
  upiId: string,
  payeeName: string,
  amount?: number,
  note?: string
): string {
  const pa = encodeURIComponent(upiId.trim());
  const pn = encodeURIComponent((payeeName || 'Blueberry Farm and Resort').trim());
  let uri = `upi://pay?pa=${pa}&pn=${pn}&cu=INR`;
  if (amount && amount > 0) {
    uri += `&am=${amount.toFixed(2)}`;
  }
  if (note) {
    uri += `&tn=${encodeURIComponent(note.trim())}`;
  }
  return uri;
}

export async function generateUpiQrDataUrl(
  upiId: string,
  payeeName: string,
  amount?: number,
  note?: string
): Promise<string | null> {
  if (!upiId || !upiId.trim()) return null;
  try {
    const uri = buildUpiUri(upiId, payeeName, amount, note);
    return await QRCode.toDataURL(uri, {
      width: 240,
      margin: 1,
      color: { dark: '#0F172A', light: '#FFFFFF' },
    });
  } catch {
    return null;
  }
}

async function drawHeader(
  doc: jsPDF,
  settings: ResortSettings,
  docTitle: string,
  docNumberLabel: string,
  docNumber: string,
  docDate: string
): Promise<number> {
  const pageW = doc.internal.pageSize.getWidth();

  // Top Navy Brand Bar
  doc.setFillColor(7, 82, 165);
  doc.rect(0, 0, pageW, 34, 'F');

  // Logo
  const logoData = await loadImageAsDataUrl(logoUrl);
  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', 12, 4, 26, 26);
    } catch {
      // ignore image error
    }
  }

  // Resort Name & Info
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(settings.business_name || 'Blueberry Farm and Resort', 42, 14);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const addrLine = (settings.address_line || '').trim();
  if (addrLine) {
    doc.text(addrLine, 42, 20.5);
  }
  const contactParts: string[] = [];
  if ((settings.phone || '').trim()) contactParts.push(`Mob: ${settings.phone.trim()}`);
  if ((settings.email || '').trim()) contactParts.push(settings.email.trim());
  if ((settings.website || '').trim()) contactParts.push(settings.website.trim());
  if (contactParts.length > 0) {
    doc.text(contactParts.join('  |  '), 42, addrLine ? 26.5 : 21);
  }

  // Document Title Banner on Right
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(pageW - 64, 6, 52, 22, 2.5, 2.5, 'F');
  doc.setTextColor(7, 82, 165);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(docTitle.toUpperCase(), pageW - 38, 13.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`${docNumberLabel}: ${docNumber}`, pageW - 38, 19.5, { align: 'center' });
  doc.text(`Date: ${fmtDate(docDate)}`, pageW - 38, 24.5, { align: 'center' });

  return 42;
}

async function drawPaymentAndSignatureFooter(
  doc: jsPDF,
  settings: ResortSettings,
  qrAmount: number,
  docNumber: string,
  startY: number
): Promise<void> {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = startY;

  if (y > pageH - 72) {
    doc.addPage();
    y = 20;
  }

  const pInfo = settings.payment_info || ({} as any);
  const upiId = pInfo.upi_id || '';
  const bankName = pInfo.bank_name || '';
  const accName = pInfo.account_name || settings.business_name || '';
  const accNo = pInfo.account_number || '';
  const ifsc = pInfo.ifsc_code || '';
  const gpay = pInfo.gpay_number || settings.phone || '';

  // Payment Box (Left + Middle for QR)
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(12, y, 126, 48, 3, 3, 'FD');

  doc.setTextColor(7, 82, 165);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('BANK & UPI PAYMENT DETAILS', 16, y + 7);

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(8.2);
  let py = y + 13.5;
  const rows: Array<[string, string]> = [];
  if (bankName) rows.push(['Bank Name:', bankName]);
  if (accName) rows.push(['Account Name:', accName]);
  if (accNo) rows.push(['Account No:', accNo]);
  if (ifsc) rows.push(['IFSC Code:', ifsc]);
  if (upiId) rows.push(['UPI ID:', upiId]);
  if (gpay) rows.push(['GPay / PhonePe:', gpay]);

  for (const [label, value] of rows.slice(0, 6)) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 16, py);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value).slice(0, 32), 42, py);
    py += 5.4;
  }

  // Scannable UPI QR Code inside right side of Payment Box
  const qrDataUrl = await generateUpiQrDataUrl(upiId, accName, qrAmount, docNumber);
  if (qrDataUrl) {
    try {
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(101, y + 4, 33, 40, 2, 2, 'FD');
      doc.addImage(qrDataUrl, 'PNG', 103.5, y + 6, 28, 28);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.8);
      doc.setTextColor(7, 82, 165);
      doc.text('SCAN & PAY UPI', 117.5, y + 38.5, { align: 'center' });
      if (qrAmount > 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(71, 85, 105);
        doc.text(formatRs(qrAmount), 117.5, y + 42.2, { align: 'center' });
      }
    } catch {
      // ignore QR draw error
    }
  }

  // Authorized Signature Block (Right)
  const sigBoxX = pageW - 64;
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(sigBoxX, y, 52, 48, 3, 3, 'S');

  const sigSrc = settings.documents?.signature_data_url || (settings.documents?.has_signature_image !== false ? defaultSigUrl : '');
  if (sigSrc) {
    const sigData = await loadImageAsDataUrl(sigSrc);
    if (sigData) {
      try {
        doc.addImage(sigData, 'PNG', sigBoxX + 6, y + 8, 40, 20);
      } catch {
        // ignore
      }
    }
  }

  doc.setDrawColor(100, 116, 139);
  doc.line(sigBoxX + 6, y + 34, sigBoxX + 46, y + 34);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('Authorized Signature', sigBoxX + 26, y + 39.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(settings.business_name || 'Blueberry Farm and Resort', sigBoxX + 26, y + 44, { align: 'center' });

  // Bottom Footer Line
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Thank you for choosing ${settings.business_name || 'Blueberry Farm and Resort'} • Mandawane, Karjat • ${settings.phone || '8669408484'}`,
    pageW / 2,
    pageH - 8,
    { align: 'center' }
  );
}

function drawLineItemsTable(doc: jsPDF, items: any[], startY: number): number {
  const pageW = doc.internal.pageSize.getWidth();
  let y = startY;

  // Table Header
  doc.setFillColor(7, 82, 165);
  doc.rect(12, y, pageW - 24, 8.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('#', 15, y + 5.7);
  doc.text('Description', 24, y + 5.7);
  doc.text('Qty', pageW - 76, y + 5.7, { align: 'right' });
  doc.text('Rate', pageW - 46, y + 5.7, { align: 'right' });
  doc.text('Amount', pageW - 15, y + 5.7, { align: 'right' });
  y += 8.5;

  doc.setTextColor(30, 41, 59);
  items.forEach((it, idx) => {
    const descLines = doc.splitTextToSize(String(it.description || 'Item'), 95);
    const incLines = it.inclusion_text ? doc.splitTextToSize(String(it.inclusion_text), 95) : [];
    const rowH = Math.max(8, descLines.length * 4.2 + incLines.length * 3.5 + 3.5);

    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(12, y, pageW - 24, rowH, 'F');
    }
    doc.setDrawColor(226, 232, 240);
    doc.line(12, y + rowH, pageW - 12, y + rowH);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(String(idx + 1), 15, y + 5.2);
    doc.setFont('helvetica', 'bold');
    doc.text(descLines, 24, y + 5.2);

    if (incLines.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(100, 116, 139);
      doc.text(incLines, 24, y + 5.2 + descLines.length * 4.2);
      doc.setTextColor(30, 41, 59);
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    const qty = Number(it.quantity || 1);
    const rate = Number(it.rate || 0);
    const amt = Number(it.amount ?? qty * rate);
    doc.text(`${qty} ${it.unit || ''}`.trim(), pageW - 76, y + 5.2, { align: 'right' });
    doc.text(formatRs(rate), pageW - 46, y + 5.2, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.text(formatRs(amt), pageW - 15, y + 5.2, { align: 'right' });

    y += rowH;
  });

  return y + 4;
}

export async function generateQuotationPdfBlob(q: any, settings: ResortSettings): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = await drawHeader(doc, settings, 'QUOTATION', 'Quote No', q.quotation_number || '', q.quotation_date || '');

  // Customer + Stay Summary Boxes
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(12, y, 92, 28, 2.5, 2.5, 'S');
  doc.roundedRect(108, y, pageW - 120, 28, 2.5, 2.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(7, 82, 165);
  doc.text('QUOTATION FOR:', 16, y + 6);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(String(q.customer_name || 'Guest'), 16, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  if (q.customer_mobile && q.customer_mobile !== 'N/A') doc.text(`Mobile: ${q.customer_mobile}`, 16, y + 17.5);
  if (q.customer_address) doc.text(String(q.customer_address).slice(0, 48), 16, y + 23);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(7, 82, 165);
  doc.text('STAY DETAILS:', 112, y + 6);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.text(`Check-in: ${fmtDate(q.check_in_date)}   |   Check-out: ${fmtDate(q.check_out_date)}`, 112, y + 12);
  doc.text(`Guests: ${q.adults || 0} Adults, ${q.children || 0} Children, ${q.infants || 0} Infants`, 112, y + 17.5);
  doc.text(`Valid Until: ${fmtDate(q.valid_until)}   |   Status: ${q.status || 'Draft'}`, 112, y + 23);

  y += 34;
  y = drawLineItemsTable(doc, q.line_items || [], y);

  // Totals Box
  const totX = pageW - 82;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(totX, y, 70, 28, 2.5, 2.5, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', totX + 4, y + 6.5);
  doc.text(formatRs(q.subtotal), totX + 66, y + 6.5, { align: 'right' });

  doc.text('Discount:', totX + 4, y + 12);
  doc.text(`- ${formatRs(q.discount || q.discount_total || 0)}`, totX + 66, y + 12, { align: 'right' });

  doc.setFillColor(7, 82, 165);
  doc.rect(totX, y + 16, 70, 12, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Grand Total:', totX + 4, y + 23.5);
  doc.text(formatRs(q.grand_total), totX + 66, y + 23.5, { align: 'right' });

  if (q.terms_and_conditions || q.notes) {
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Terms & Notes:', 12, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    const noteLines = doc.splitTextToSize(String(q.terms_and_conditions || q.notes), 105);
    doc.text(noteLines.slice(0, 5), 12, y + 10);
  }

  y += 36;
  const qrAmt = Number(q.advance_required || 0) > 0 ? Number(q.advance_required) : Number(q.grand_total || 0);
  await drawPaymentAndSignatureFooter(doc, settings, qrAmt, q.quotation_number || 'Quotation', y);

  return doc.output('blob');
}

export async function generateInvoicePdfBlob(inv: any, settings: ResortSettings): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const title = inv.document_title || (inv.payment_status === 'Paid' ? 'PAID INVOICE' : 'TAX INVOICE');
  let y = await drawHeader(doc, settings, title, 'Invoice No', inv.invoice_number || '', inv.invoice_date || '');

  // Customer + Stay Summary Boxes
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(12, y, 92, 30, 2.5, 2.5, 'S');
  doc.roundedRect(108, y, pageW - 120, 30, 2.5, 2.5, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(7, 82, 165);
  doc.text('BILL TO:', 16, y + 6);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(10);
  doc.text(String(inv.customer_name || 'Guest'), 16, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  const mob = inv.contact_number || inv.customer_mobile;
  if (mob && mob !== 'N/A') doc.text(`Mobile: ${mob}`, 16, y + 17.5);
  const addr = inv.address || inv.customer_address;
  if (addr) doc.text(String(addr).slice(0, 48), 16, y + 22.5);
  const gstin = inv.gstin || inv.customer_gstin;
  if (gstin) doc.text(`GSTIN: ${gstin}`, 16, y + 27.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(7, 82, 165);
  doc.text('BOOKING & STATUS:', 112, y + 6);
  doc.setTextColor(30, 41, 59);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.text(`Check-in: ${fmtDate(inv.check_in_date)}   |   Check-out: ${fmtDate(inv.check_out_date)}`, 112, y + 12);
  if (inv.booking_reference) doc.text(`Booking Ref: ${inv.booking_reference}`, 112, y + 17.5);
  doc.setFont('helvetica', 'bold');
  doc.text(`Payment Status: ${inv.payment_status || 'Unpaid'}`, 112, y + 23);

  y += 36;
  y = drawLineItemsTable(doc, inv.line_items || [], y);

  // Totals Box
  const totX = pageW - 84;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(totX, y, 72, 42, 2.5, 2.5, 'FD');

  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', totX + 4, y + 6);
  doc.text(formatRs(inv.subtotal), totX + 68, y + 6, { align: 'right' });

  doc.text('Discount:', totX + 4, y + 11.5);
  doc.text(`- ${formatRs(inv.discount_total || inv.discount_amount || 0)}`, totX + 68, y + 11.5, { align: 'right' });

  doc.text('GST / Tax:', totX + 4, y + 17);
  doc.text(formatRs(inv.tax_total || 0), totX + 68, y + 17, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text('Grand Total:', totX + 4, y + 23);
  doc.text(formatRs(inv.grand_total), totX + 68, y + 23, { align: 'right' });

  doc.setTextColor(5, 150, 105);
  doc.text('Amount Paid:', totX + 4, y + 29);
  doc.text(formatRs(inv.total_amount_paid), totX + 68, y + 29, { align: 'right' });

  doc.setFillColor(Number(inv.balance_due) > 0 ? 185 : 5, Number(inv.balance_due) > 0 ? 28 : 150, Number(inv.balance_due) > 0 ? 28 : 105);
  doc.rect(totX, y + 32, 72, 10, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9.5);
  doc.text('Balance Due:', totX + 4, y + 38.5);
  doc.text(formatRs(inv.balance_due), totX + 68, y + 38.5, { align: 'right' });

  if (inv.notes) {
    doc.setTextColor(71, 85, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('Notes:', 12, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(doc.splitTextToSize(String(inv.notes), 102).slice(0, 6), 12, y + 11);
  }

  y += 48;
  const qrAmt = Number(inv.balance_due || 0) > 0 ? Number(inv.balance_due) : 0;
  await drawPaymentAndSignatureFooter(doc, settings, qrAmt, inv.invoice_number || 'Invoice', y);

  return doc.output('blob');
}

export async function generateReceiptPdfBlob(p: any, settings: ResortSettings): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const recNo = p.receipt_number || p.payment_id || p.id || '';
  let y = await drawHeader(doc, settings, 'PAYMENT RECEIPT', 'Receipt No', recNo, p.payment_date || '');

  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(12, y, pageW - 24, 58, 3, 3, 'FD');

  doc.setTextColor(7, 82, 165);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('OFFICIAL PAYMENT ACKNOWLEDGEMENT', 18, y + 9);

  doc.setTextColor(30, 41, 59);
  doc.setFontSize(9.5);
  const details: Array<[string, string]> = [
    ['Received From:', String(p.customer_name || 'Guest')],
    ['Mobile Number:', String(p.customer_mobile || '-')],
    ['Payment Type:', String(p.payment_type || 'Payment')],
    ['Payment Method:', String(p.payment_method || 'UPI / Cash')],
    ['Transaction / Ref ID:', String(p.transaction_id || p.payment_reference || '-')],
    ['Received By:', String(p.received_by || 'Resort Admin')],
  ];
  let ry = y + 17;
  for (const [k, v] of details) {
    doc.setFont('helvetica', 'bold');
    doc.text(k, 18, ry);
    doc.setFont('helvetica', 'normal');
    doc.text(v, 65, ry);
    ry += 6.5;
  }

  // Amount Highlight Box
  doc.setFillColor(5, 150, 105);
  doc.roundedRect(pageW - 76, y + 14, 58, 28, 3, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text('AMOUNT RECEIVED', pageW - 47, y + 23, { align: 'center' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(formatRs(p.amount), pageW - 47, y + 33, { align: 'center' });

  y += 66;
  await drawPaymentAndSignatureFooter(doc, settings, 0, recNo, y);

  return doc.output('blob');
}

export async function generateReportPdfBlob(report: any, settings: ResortSettings): Promise<Blob> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  let y = await drawHeader(
    doc,
    settings,
    report.title || 'RESORT REPORT',
    'Report',
    report.report_type || 'summary',
    new Date().toISOString().slice(0, 10)
  );

  const cols: string[] = report.columns || [];
  const rows: any[][] = report.rows || [];
  const colW = cols.length > 0 ? (pageW - 24) / cols.length : 40;

  if (cols.length > 0) {
    doc.setFillColor(7, 82, 165);
    doc.rect(12, y, pageW - 24, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    cols.forEach((c, i) => {
      doc.text(String(c).slice(0, 22), 14 + i * colW, y + 5.5);
    });
    y += 8;

    doc.setTextColor(30, 41, 59);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    rows.slice(0, 35).forEach((r, idx) => {
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(12, y, pageW - 24, 7, 'F');
      }
      r.forEach((cell, i) => {
        doc.text(String(cell ?? '').slice(0, 24), 14 + i * colW, y + 4.8);
      });
      y += 7;
    });
  }

  return doc.output('blob');
}
