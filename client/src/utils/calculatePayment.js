export function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map((v) => parseInt(v, 10));
  return h * 60 + m;
}

// OT Rate = Salary ÷ 30 ÷ 10 (FIXED 30 days)
// Sunday Rate = OT Rate × 1.5
export function calculatePayment(dailyWage, startTime, endTime, date, holidays, config, designation) {
  if (!dailyWage || !startTime || !endTime || !date || !config) {
    return { hoursWorked: 0, regularPay: 0, otPay: 0, totalPay: 0, isSunday: false, isHoliday: false };
  }

  const start = parseTimeToMinutes(startTime);
  let end = parseTimeToMinutes(endTime);
  if (end <= start) end += 24 * 60;
  const totalMinutes = end - start;
  if (totalMinutes === 0) {
    return { hoursWorked: 0, regularPay: 0, otPay: 0, totalPay: 0, isSunday: false, isHoliday: false };
  }
  const hoursWorked = totalMinutes / 60;

  const standardHours = parseFloat(config.regular_hours || "10");

  const d = new Date(date);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

  const standardRate = dailyWage / daysInMonth / standardHours;

  // OT rate: Salary ÷ 30 ÷ 10 (FIXED 30 days, 10 hours — consistent every month)
  const overtimeRate = dailyWage / 30 / 10;

  const sundayMultiplier = parseFloat(config.sunday_ot_multiplier || "1.5");
  const sundayHolidayRate = overtimeRate * sundayMultiplier;

  const isSunday = d.getDay() === 0;
  const isHoliday = (holidays || []).some((h) => h.date === date);

  let regularPay = 0;
  let otPay = 0;
  let totalPay = 0;

  if (isSunday || isHoliday) {
    // Sunday/Holiday: Normal daily salary + OT for all worked hours
    regularPay = standardHours * standardRate;
    otPay = hoursWorked * sundayHolidayRate;
    totalPay = regularPay + otPay;
  } else {
    regularPay = standardHours * standardRate;
    if (hoursWorked > standardHours) {
      otPay = (hoursWorked - standardHours) * overtimeRate;
    } else {
      otPay = 0;
    }
    totalPay = regularPay + otPay;
  }

  return {
    hoursWorked: Math.round(hoursWorked * 100) / 100,
    regularPay: Math.round(regularPay * 100) / 100,
    otPay: Math.round(otPay * 100) / 100,
    totalPay: Math.round(totalPay * 100) / 100,
    isSunday,
    isHoliday,
  };
}

/**
 * Calculate Sunday/Holiday auto-pay for days WITHOUT attendance.
 */
export function calculateSundayAutoPay(dailyWage, date, config) {
  const d = new Date(date);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const standardHours = parseFloat(config.regular_hours || "10");
  const standardRate = dailyWage / daysInMonth / standardHours;
  const basePay = standardHours * standardRate;
  return Math.round(basePay * 100) / 100;
}