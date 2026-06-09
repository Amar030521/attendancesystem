const PDFDocument = require("pdfkit");
const XLSX = require("xlsx-js-style");

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-AE", { style: "currency", currency: "AED", minimumFractionDigits: 2 }).format(amount || 0);
}
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}
function workbookToBuffer(wb) {
  return Buffer.from(XLSX.write(wb, { bookType: "xlsx", type: "array" }));
}

// Style constants for Sunday/Holiday coloring
const SUNDAY_FILL = { fill: { fgColor: { rgb: "E8D5F5" } } };  // Light purple
const HOLIDAY_FILL = { fill: { fgColor: { rgb: "FDEBD0" } } };  // Light orange
const SUNDAY_HOLIDAY_FILL = { fill: { fgColor: { rgb: "D5C8E8" } } };  // Deeper purple (both)
const HEADER_FILL = { fill: { fgColor: { rgb: "D6E4F0" } }, font: { bold: true } };  // Blue header

/**
 * Apply row coloring to a worksheet for Sunday/Holiday rows.
 * dataStartRow: 0-indexed row where data starts (after headers)
 * rows: array of data objects with is_sunday/is_holiday flags
 * colCount: number of columns
 */
function colorDayRows(ws, dataStartRow, rows, colCount) {
  rows.forEach((r, i) => {
    if (!r.is_sunday && !r.is_holiday) return;
    const fill = (r.is_sunday && r.is_holiday) ? SUNDAY_HOLIDAY_FILL : r.is_sunday ? SUNDAY_FILL : HOLIDAY_FILL;
    const rowIdx = dataStartRow + i;
    for (let c = 0; c < colCount; c++) {
      const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c });
      if (!ws[cellRef]) ws[cellRef] = { v: "", t: "s" };
      ws[cellRef].s = fill;
    }
  });
}

/** Apply header styling */
function colorHeaderRow(ws, rowIdx, colCount) {
  for (let c = 0; c < colCount; c++) {
    const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c });
    if (ws[cellRef]) ws[cellRef].s = HEADER_FILL;
  }
}

// ===== Daily Report =====
function generateDailyExcelReport(date, rows) {
  const data = [["DAILY LABOUR REPORT"], [`Date: ${formatDate(date)}`], [],
    ["Labour ID", "Name", "Designation", "Client", "Site", "Start", "End", "Hours", "Regular (AED)", "OT (AED)", "Total (AED)", "Day Type"]];
  let total = 0;
  const sundayCount = rows.filter(r => r.is_sunday).length;
  const holidayCount = rows.filter(r => r.is_holiday).length;
  rows.forEach(r => { total += r.total_pay || 0; data.push([r.labour_id, r.labour_name, r.designation || "", r.client_name, r.site_name, r.start_time, r.end_time, r.hours_worked, Math.round((r.regular_pay || 0) * 100) / 100, Math.round((r.ot_pay || 0) * 100) / 100, Math.round((r.total_pay || 0) * 100) / 100, r.is_sunday ? "SUNDAY" : r.is_holiday ? "HOLIDAY" : ""]); });
  data.push([], ["", "", "", "", "", "", "", "TOTAL", "", "", Math.round(total * 100) / 100, ""], [`Workers: ${rows.length} | Sundays: ${sundayCount} | Holidays: ${holidayCount}`]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 10 }, { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
  colorHeaderRow(ws, 3, 12);
  colorDayRows(ws, 4, rows, 12);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Daily Report"); return workbookToBuffer(wb);
}

function generateDailyPdfReport(date, rows) {
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
  const chunks = [];
  doc.on("data", c => chunks.push(c));
  doc.fontSize(16).text("DAILY LABOUR REPORT", { align: "center" });
  doc.moveDown(0.5); doc.fontSize(12).text(`Date: ${formatDate(date)}`, { align: "center" }); doc.moveDown(1);
  doc.fontSize(9); doc.text("ID | Name | Designation | Client | Site | Start | End | Hours | Regular | OT | Total"); doc.moveDown(0.3);
  let total = 0;
  rows.forEach(r => { total += r.total_pay || 0; doc.text(`${r.labour_id} | ${r.labour_name} | ${r.designation || "-"} | ${r.client_name} | ${r.site_name} | ${r.start_time} | ${r.end_time} | ${r.hours_worked} | ${formatCurrency(r.regular_pay)} | ${formatCurrency(r.ot_pay)} | ${formatCurrency(r.total_pay)}${r.is_sunday ? " [SUN]" : ""}${r.is_holiday ? " [HOL]" : ""}`); });
  doc.moveDown(1); doc.fontSize(12).text(`TOTAL: ${formatCurrency(total)}`, { align: "right" }); doc.end();
  return new Promise((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
}

// ===== Filtered Daily (for Daily Ops tab) =====
function generateFilteredDailyExcelReport(date, rows, filterLabel) {
  const data = [["DAILY ATTENDANCE REPORT"], [`Date: ${formatDate(date)}` + (filterLabel ? ` | Filter: ${filterLabel}` : "")], [],
    ["Labour ID", "Name", "Designation", "Client", "Site", "Start", "End", "Hours", "Regular (AED)", "OT (AED)", "Total (AED)", "Day Type"]];
  let total = 0;
  rows.forEach(r => { total += r.total_pay || 0; data.push([r.labour_id, r.labour_name, r.designation || "", r.client_name, r.site_name, r.start_time, r.end_time, r.hours_worked, Math.round((r.regular_pay || 0) * 100) / 100, Math.round((r.ot_pay || 0) * 100) / 100, Math.round((r.total_pay || 0) * 100) / 100, r.is_sunday ? "SUNDAY" : r.is_holiday ? "HOLIDAY" : ""]); });
  data.push([], ["", "", "", "", "", "", "", "TOTAL", "", "", Math.round(total * 100) / 100, ""], [`Workers: ${rows.length}`]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 10 }, { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }];
  colorHeaderRow(ws, 3, 12);
  colorDayRows(ws, 4, rows, 12);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Report"); return workbookToBuffer(wb);
}

// ===== Monthly Report =====
function generateMonthlyExcelReport(month, rows, sundayAutoPayMap, adjustmentsMap, laboursList, totalSundays, totalHolidays) {
  const map = {};
  rows.forEach(r => { if (!map[r.labour_id]) map[r.labour_id] = { name: r.labour_name, designation: r.designation || "", recs: [] }; map[r.labour_id].recs.push(r); });
  const dim = new Date(parseInt(month.split("-")[0]), parseInt(month.split("-")[1]), 0).getDate();
  const data = [["MONTHLY ATTENDANCE REPORT"], [`Month: ${month} | Total Sundays: ${totalSundays || 0} | Total Holidays: ${totalHolidays || 0}`], [],
    ["Labour ID", "Name", "Designation", "Days", "Hours", "Regular (AED)", "OT (AED)", "Sunday Rest Pay", "Base Pay", "Incentives", "Deductions", "Net Pay", "Total Sun", "Worked Sun", "Total Hol", "Worked Hol", "Attendance %"]];
  let grand = 0, grandInc = 0, grandDed = 0;
  const addedLabourIds = new Set();

  Object.entries(map).forEach(([id, info]) => {
    addedLabourIds.add(String(id));
    const d = info.recs.length, h = info.recs.reduce((s, r) => s + (r.hours_worked || 0), 0);
    const reg = info.recs.reduce((s, r) => s + (r.regular_pay || 0), 0), ot = info.recs.reduce((s, r) => s + (r.ot_pay || 0), 0), tp = info.recs.reduce((s, r) => s + (r.total_pay || 0), 0);
    const autoP = (sundayAutoPayMap && sundayAutoPayMap[id]) || 0;
    const basePay = tp + autoP;
    const adj = (adjustmentsMap && adjustmentsMap[id]) || { incentives: 0, deductions: 0 };
    const netPay = basePay + adj.incentives - adj.deductions;
    grand += basePay; grandInc += adj.incentives; grandDed += adj.deductions;
    const workedSun = info.recs.filter(r => r.is_sunday).length;
    const workedHol = info.recs.filter(r => r.is_holiday).length;
    data.push([Number(id), info.name, info.designation, d, Math.round(h * 100) / 100, Math.round(reg * 100) / 100, Math.round(ot * 100) / 100, Math.round(autoP * 100) / 100, Math.round(basePay * 100) / 100, Math.round(adj.incentives * 100) / 100, Math.round(adj.deductions * 100) / 100, Math.round(netPay * 100) / 100, totalSundays || 0, workedSun, totalHolidays || 0, workedHol, ((d / dim) * 100).toFixed(1) + "%"]);
  });

  if (sundayAutoPayMap) {
    Object.entries(sundayAutoPayMap).forEach(([id, autoP]) => {
      if (!addedLabourIds.has(String(id)) && autoP > 0 && !id.endsWith("_name") && !id.endsWith("_designation")) {
        addedLabourIds.add(String(id));
        const adj = (adjustmentsMap && adjustmentsMap[id]) || { incentives: 0, deductions: 0 };
        const netPay = autoP + adj.incentives - adj.deductions;
        grand += autoP; grandInc += adj.incentives; grandDed += adj.deductions;
        data.push([Number(id), sundayAutoPayMap[id + "_name"] || "Unknown", sundayAutoPayMap[id + "_designation"] || "", 0, 0, 0, 0, Math.round(autoP * 100) / 100, Math.round(autoP * 100) / 100, Math.round(adj.incentives * 100) / 100, Math.round(adj.deductions * 100) / 100, Math.round(netPay * 100) / 100, totalSundays || 0, 0, totalHolidays || 0, 0, "0.0%"]);
      }
    });
  }

  if (laboursList) {
    laboursList.forEach(l => {
      if (!addedLabourIds.has(String(l.id))) {
        addedLabourIds.add(String(l.id));
        const adj = (adjustmentsMap && adjustmentsMap[l.id]) || { incentives: 0, deductions: 0 };
        const netPay = adj.incentives - adj.deductions;
        grandInc += adj.incentives; grandDed += adj.deductions;
        data.push([l.id, l.name, l.designation || "", 0, 0, 0, 0, 0, 0, Math.round(adj.incentives * 100) / 100, Math.round(adj.deductions * 100) / 100, Math.round(netPay * 100) / 100, totalSundays || 0, 0, totalHolidays || 0, 0, "0.0%"]);
      }
    });
  }

  data.push([], ["", "", "", "", "", "", "", "", "TOTAL", Math.round(grandInc * 100) / 100, Math.round(grandDed * 100) / 100, Math.round((grand + grandInc - grandDed) * 100) / 100, "", "", "", "", ""]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 10 }, { wch: 20 }, { wch: 16 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }];
  colorHeaderRow(ws, 3, 17);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Monthly Report"); return workbookToBuffer(wb);
}

// ===== Labour Report =====
function generateLabourExcelReport(labour, month, rows, sundayAutoPay, totalSundays, totalHolidays) {
  const name = labour ? labour.name : "Unknown";
  const designation = labour && labour.designation ? labour.designation : "";
  const workedSun = rows.filter(r => r.is_sunday).length;
  const workedHol = rows.filter(r => r.is_holiday).length;
  const data = [
    [`LABOUR REPORT - ${name}`],
    designation ? [`Designation: ${designation}`] : [""],
    [`Month: ${month}`],
    [`Sundays: ${totalSundays || 0} total, ${workedSun} worked | Holidays: ${totalHolidays || 0} total, ${workedHol} worked`],
    [],
    ["Date", "Client", "Site", "Start", "End", "Hours", "Regular", "OT", "Total", "Day Type"]
  ];
  let tp = 0;
  rows.forEach(r => { tp += r.total_pay || 0; data.push([r.date, r.client_name, r.site_name, r.start_time, r.end_time, r.hours_worked, r.regular_pay, r.ot_pay, r.total_pay, r.is_sunday ? "SUNDAY" : r.is_holiday ? "HOLIDAY" : ""]); });
  const autoP = sundayAutoPay || 0;
  if (autoP > 0) {
    data.push([]);
    data.push(["", "", "Sunday/Holiday Rest Pay (unattended)", "", "", "", autoP, "", autoP, ""]);
  }
  const grandTotal = Math.round((tp + autoP) * 100) / 100;
  data.push([], ["", "", "", "", "TOTAL", rows.length + " days", "", "", grandTotal, ""]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
  colorHeaderRow(ws, 5, 10);
  colorDayRows(ws, 6, rows, 10);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Labour Report"); return workbookToBuffer(wb);
}

// ===== Client Report =====
function generateClientExcelReport(client, start, end, rows) {
  let actualClient = client, actualStart = start, actualEnd = end, actualRows = rows;
  if (typeof client === "string") { actualStart = client; actualEnd = start; actualClient = { name: end }; actualRows = rows; }
  const name = actualClient ? actualClient.name : "Unknown";
  const sundayCount = actualRows.filter(r => r.is_sunday).length;
  const holidayCount = actualRows.filter(r => r.is_holiday).length;
  const data = [[`CLIENT REPORT - ${name}`], [`Period: ${formatDate(actualStart)} to ${formatDate(actualEnd)}`],
    [`Sundays worked: ${sundayCount} | Holidays worked: ${holidayCount}`], [],
    ["Date", "Labour ID", "Name", "Designation", "Site", "Hours", "Regular", "OT", "Total", "Day Type"]];
  let tp = 0, th = 0;
  actualRows.forEach(r => { tp += r.total_pay || 0; th += r.hours_worked || 0; data.push([r.date, r.labour_id, r.labour_name, r.designation || "", r.site_name, r.hours_worked, r.regular_pay, r.ot_pay, r.total_pay, r.is_sunday ? "SUNDAY" : r.is_holiday ? "HOLIDAY" : ""]); });
  data.push([], ["TOTAL", "", actualRows.length + " entries", "", "", Math.round(th * 100) / 100, "", "", Math.round(tp * 100) / 100, ""]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
  colorHeaderRow(ws, 4, 10);
  colorDayRows(ws, 5, actualRows, 10);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Client Report"); return workbookToBuffer(wb);
}

// ===== Site Report =====
function generateSiteExcelReport(site, start, end, rows) {
  let actualSite = site, actualStart = start, actualEnd = end, actualRows = rows;
  if (typeof site === "string") { actualStart = site; actualEnd = start; actualSite = { name: end }; actualRows = rows; }
  const name = actualSite ? (actualSite.client_name ? `${actualSite.name} (${actualSite.client_name})` : actualSite.name) : "Unknown";
  const sundayCount = actualRows.filter(r => r.is_sunday).length;
  const holidayCount = actualRows.filter(r => r.is_holiday).length;
  const data = [[`SITE REPORT - ${name}`], [`Period: ${formatDate(actualStart)} to ${formatDate(actualEnd)}`],
    [`Sundays worked: ${sundayCount} | Holidays worked: ${holidayCount}`], [],
    ["Date", "Labour ID", "Name", "Designation", "Hours", "Regular", "OT", "Total", "Day Type"]];
  let tp = 0, th = 0;
  actualRows.forEach(r => { tp += r.total_pay || 0; th += r.hours_worked || 0; data.push([r.date, r.labour_id, r.labour_name, r.designation || "", r.hours_worked, r.regular_pay, r.ot_pay, r.total_pay, r.is_sunday ? "SUNDAY" : r.is_holiday ? "HOLIDAY" : ""]); });
  data.push([], ["TOTAL", "", actualRows.length + " entries", "", Math.round(th * 100) / 100, "", "", Math.round(tp * 100) / 100, ""]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 20 }, { wch: 16 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 10 }];
  colorHeaderRow(ws, 4, 9);
  colorDayRows(ws, 5, actualRows, 9);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Site Report"); return workbookToBuffer(wb);
}

// ===== Payroll =====
function generatePayrollExcelReport(month, rows, totalSundays, totalHolidays) {
  const data = [["PAYROLL SUMMARY"], [`Month: ${month} | Total Sundays: ${totalSundays || 0} | Total Holidays: ${totalHolidays || 0}`], [],
    ["Labour ID", "Name", "Designation", "Monthly Wages", "Days", "Hours", "Regular", "OT", "Total Sun", "Worked Sun", "Total Hol", "Worked Hol", "Base Pay", "Incentives", "Deductions", "Net Pay"]];
  let grandBase = 0, grandInc = 0, grandDed = 0;
  rows.forEach(r => {
    const inc = r.incentives || 0;
    const ded = r.deductions || 0;
    const netPay = r.net_pay || ((r.total_pay || 0) + inc - ded);
    grandBase += r.total_pay || 0; grandInc += inc; grandDed += ded;
    data.push([r.labour_id, r.labour_name, r.designation || "", r.daily_wage, r.days_worked, Math.round((r.total_hours || 0) * 100) / 100, Math.round((r.total_regular || 0) * 100) / 100, Math.round((r.total_ot || 0) * 100) / 100, totalSundays || 0, r.sunday_days || 0, totalHolidays || 0, r.holiday_days || 0, Math.round((r.total_pay || 0) * 100) / 100, Math.round(inc * 100) / 100, Math.round(ded * 100) / 100, Math.round(netPay * 100) / 100]);
  });
  data.push([], ["", "", "", "", "", "", "", "", "", "", "", "TOTAL", Math.round(grandBase * 100) / 100, Math.round(grandInc * 100) / 100, Math.round(grandDed * 100) / 100, Math.round((grandBase + grandInc - grandDed) * 100) / 100]);
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws["!cols"] = [{ wch: 10 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  colorHeaderRow(ws, 3, 16);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Payroll"); return workbookToBuffer(wb);
}

module.exports = {
  generateDailyExcelReport, generateDailyPdfReport, generateMonthlyExcelReport,
  generateLabourExcelReport, generateClientExcelReport, generateSiteExcelReport,
  generatePayrollExcelReport, generateFilteredDailyExcelReport, formatCurrency, formatDate,
};