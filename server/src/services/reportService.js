const PDFDocument = require("pdfkit");
const XLSX = require("xlsx");

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: 2 }).format(amount || 0);
}
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}
/** Proper buffer from XLSX — uses type:'array' to avoid corruption */
function workbookToBuffer(wb) {
  return Buffer.from(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
}

// ===== Daily Report =====
function generateDailyExcelReport(date, rows) {
  const data = [["DAILY LABOUR REPORT"], [`Date: ${formatDate(date)}`], [],
    ["Labour ID", "Name", "Client", "Site", "Start", "End", "Hours", "Regular (AED)", "OT (AED)", "Total (AED)"]];
  let total = 0;
  rows.forEach(r => { total += r.total_pay || 0; data.push([r.labour_id, r.labour_name, r.client_name, r.site_name, r.start_time, r.end_time, r.hours_worked, Math.round((r.regular_pay || 0) * 100) / 100, Math.round((r.ot_pay || 0) * 100) / 100, Math.round((r.total_pay || 0) * 100) / 100]); });
  data.push([], ["", "", "", "", "", "", "TOTAL", "", "", Math.round(total * 100) / 100]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Daily Report"); return workbookToBuffer(wb);
}

function generateDailyPdfReport(date, rows) {
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
  const chunks = [];
  doc.on("data", c => chunks.push(c));
  doc.fontSize(16).text("DAILY LABOUR REPORT", { align: "center" });
  doc.moveDown(0.5); doc.fontSize(12).text(`Date: ${formatDate(date)}`, { align: "center" }); doc.moveDown(1);
  doc.fontSize(9); doc.text("ID | Name | Client | Site | Start | End | Hours | Regular | OT | Total"); doc.moveDown(0.3);
  let total = 0;
  rows.forEach(r => { total += r.total_pay || 0; doc.text(`${r.labour_id} | ${r.labour_name} | ${r.client_name} | ${r.site_name} | ${r.start_time} | ${r.end_time} | ${r.hours_worked} | ${formatCurrency(r.regular_pay)} | ${formatCurrency(r.ot_pay)} | ${formatCurrency(r.total_pay)}`); });
  doc.moveDown(1); doc.fontSize(12).text(`TOTAL: ${formatCurrency(total)}`, { align: "right" }); doc.end();
  return new Promise((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
}

// ===== Filtered Daily (for Daily Ops tab) =====
function generateFilteredDailyExcelReport(date, rows, filterLabel) {
  const data = [["DAILY ATTENDANCE REPORT"], [`Date: ${formatDate(date)}` + (filterLabel ? ` | Filter: ${filterLabel}` : "")], [],
    ["Labour ID", "Name", "Client", "Site", "Start", "End", "Hours", "Regular (AED)", "OT (AED)", "Total (AED)"]];
  let total = 0;
  rows.forEach(r => { total += r.total_pay || 0; data.push([r.labour_id, r.labour_name, r.client_name, r.site_name, r.start_time, r.end_time, r.hours_worked, Math.round((r.regular_pay || 0) * 100) / 100, Math.round((r.ot_pay || 0) * 100) / 100, Math.round((r.total_pay || 0) * 100) / 100]); });
  data.push([], ["", "", "", "", "", "", "TOTAL", "", "", Math.round(total * 100) / 100], [`Workers: ${rows.length}`]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Report"); return workbookToBuffer(wb);
}

// ===== Monthly Report =====
function generateMonthlyExcelReport(month, rows) {
  const map = {};
  rows.forEach(r => { if (!map[r.labour_id]) map[r.labour_id] = { name: r.labour_name, recs: [] }; map[r.labour_id].recs.push(r); });
  const dim = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0).getDate();
  const data = [["MONTHLY ATTENDANCE REPORT"], [`Month: ${month}`], [], ["Labour ID", "Name", "Days", "Hours", "Regular (AED)", "OT (AED)", "Total (AED)", "Attendance %"]];
  let grand = 0;
  Object.entries(map).forEach(([id, info]) => {
    const d = info.recs.length, h = info.recs.reduce((s, r) => s + (r.hours_worked || 0), 0);
    const reg = info.recs.reduce((s, r) => s + (r.regular_pay || 0), 0), ot = info.recs.reduce((s, r) => s + (r.ot_pay || 0), 0), tp = info.recs.reduce((s, r) => s + (r.total_pay || 0), 0);
    grand += tp; data.push([Number(id), info.name, d, Math.round(h * 100) / 100, Math.round(reg * 100) / 100, Math.round(ot * 100) / 100, Math.round(tp * 100) / 100, ((d / dim) * 100).toFixed(1) + "%"]);
  });
  data.push([], ["", "", "", "", "", "TOTAL", Math.round(grand * 100) / 100, ""]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 10 }, { wch: 20 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Monthly Report"); return workbookToBuffer(wb);
}

// ===== Labour Report =====
function generateLabourExcelReport(labour, month, rows) {
  const name = labour ? labour.name : "Unknown";
  const data = [[`LABOUR REPORT - ${name}`], [`Month: ${month}`], [], ["Date", "Client", "Site", "Start", "End", "Hours", "Regular", "OT", "Total", "Sunday", "Holiday"]];
  let tp = 0;
  rows.forEach(r => { tp += r.total_pay || 0; data.push([r.date, r.client_name, r.site_name, r.start_time, r.end_time, r.hours_worked, r.regular_pay, r.ot_pay, r.total_pay, r.is_sunday ? "Yes" : "", r.is_holiday ? "Yes" : ""]); });
  data.push([], ["", "", "", "", "TOTAL", rows.length + " days", "", "", Math.round(tp * 100) / 100, "", ""]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Labour Report"); return workbookToBuffer(wb);
}

// ===== Client Report =====
function generateClientExcelReport(client, start, end, rows) {
  const name = client ? client.name : "Unknown";
  const data = [[`CLIENT REPORT - ${name}`], [`Period: ${formatDate(start)} to ${formatDate(end)}`], [], ["Date", "Labour ID", "Name", "Site", "Hours", "Regular", "OT", "Total"]];
  let tp = 0, th = 0;
  rows.forEach(r => { tp += r.total_pay || 0; th += r.hours_worked || 0; data.push([r.date, r.labour_id, r.labour_name, r.site_name, r.hours_worked, r.regular_pay, r.ot_pay, r.total_pay]); });
  data.push([], ["TOTAL", "", rows.length + " entries", "", Math.round(th * 100) / 100, "", "", Math.round(tp * 100) / 100]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Client Report"); return workbookToBuffer(wb);
}

// ===== Site Report =====
function generateSiteExcelReport(site, start, end, rows) {
  const name = site ? `${site.name} (${site.client_name})` : "Unknown";
  const data = [[`SITE REPORT - ${name}`], [`Period: ${formatDate(start)} to ${formatDate(end)}`], [], ["Date", "Labour ID", "Name", "Hours", "Regular", "OT", "Total"]];
  let tp = 0, th = 0;
  rows.forEach(r => { tp += r.total_pay || 0; th += r.hours_worked || 0; data.push([r.date, r.labour_id, r.labour_name, r.hours_worked, r.regular_pay, r.ot_pay, r.total_pay]); });
  data.push([], ["TOTAL", "", rows.length + " entries", Math.round(th * 100) / 100, "", "", Math.round(tp * 100) / 100]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Site Report"); return workbookToBuffer(wb);
}

// ===== Payroll =====
function generatePayrollExcelReport(month, rows) {
  const data = [["PAYROLL SUMMARY"], [`Month: ${month}`], [], ["Labour ID", "Name", "Monthly Wages", "Days", "Hours", "Regular", "OT", "Sunday", "Holiday", "Total"]];
  let grand = 0;
  rows.forEach(r => { grand += r.total_pay || 0; data.push([r.labour_id, r.labour_name, r.daily_wage, r.days_worked, Math.round((r.total_hours || 0) * 100) / 100, Math.round((r.total_regular || 0) * 100) / 100, Math.round((r.total_ot || 0) * 100) / 100, r.sunday_days, r.holiday_days, Math.round((r.total_pay || 0) * 100) / 100]); });
  data.push([], ["", "", "", "", "", "", "", "", "TOTAL", Math.round(grand * 100) / 100]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 10 }, { wch: 20 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 8 }, { wch: 8 }, { wch: 12 }];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Payroll"); return workbookToBuffer(wb);
}

module.exports = {
  generateDailyExcelReport, generateDailyPdfReport, generateMonthlyExcelReport,
  generateLabourExcelReport, generateClientExcelReport, generateSiteExcelReport,
  generatePayrollExcelReport, generateFilteredDailyExcelReport, formatCurrency, formatDate,
}