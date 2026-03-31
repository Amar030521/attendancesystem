function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map((v) => parseInt(v, 10));
  return h * 60 + m;
}

// Payment calculation:
//
// Standard Rate = Total Salary ÷ Days in Month ÷ Standard Working Hours
// OT Rate       = Total Salary ÷ 30 ÷ 10  (fixed 30 days, 10 hours)
// Sunday Rate   = OT Rate × 1.5
//
// Regular Day:
//   RegularPay = stdHours × StandardRate  (full day pay always)
//   If hours > stdHours: OTPay = (hours - stdHours) × OTRate
//
// Sunday / Holiday (WITH attendance):
//   RegularPay = stdHours × StandardRate  (base day pay)
//   OTPay      = workedHours × SundayRate  (ALL worked hours are OT)
//
// Sunday / Holiday (WITHOUT attendance - auto-pay):
//   RegularPay = stdHours × StandardRate  (base day pay)
//   OTPay      = 0
//
function calculatePayment(dailyWage, startTime, endTime, date, holidays, config, designation) {
  const start = parseTimeToMinutes(startTime);
  let end = parseTimeToMinutes(endTime);
  if (end <= start) end += 24 * 60;
  const totalMinutes = end - start;
  const hoursWorked = totalMinutes / 60;

  const standardHours = parseFloat(config.regular_hours || "10");

  const d = new Date(date);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

  const standardRate = dailyWage / daysInMonth / standardHours;

  // OT rate: Salary ÷ 30 ÷ 10 (fixed denominator)
  const overtimeRate = dailyWage / 30 / 10;

  const sundayMultiplier = parseFloat(config.sunday_ot_multiplier || "1.5");
  const sundayHolidayRate = overtimeRate * sundayMultiplier;

  const isSunday = d.getDay() === 0;
  const isHoliday = (holidays || []).some((h) => h.date === date);

  let regularPay = 0;
  let otPay = 0;
  let totalPay = 0;

  if (isSunday || isHoliday) {
    const fixedPay = standardHours * standardRate;
    const overtimeComponent = hoursWorked * sundayHolidayRate;
    regularPay = fixedPay;
    otPay = overtimeComponent;
    totalPay = fixedPay + overtimeComponent;
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
 * Returns base daily rate = salary ÷ days_in_month
 */
function calculateSundayAutoPay(dailyWage, date, config) {
  const d = new Date(date);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  const standardHours = parseFloat(config.regular_hours || "10");
  const standardRate = dailyWage / daysInMonth / standardHours;
  const basePay = standardHours * standardRate;
  return Math.round(basePay * 100) / 100;
}

module.exports = { calculatePayment, calculateSundayAutoPay };