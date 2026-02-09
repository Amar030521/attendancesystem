function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map((v) => parseInt(v, 10));
  return h * 60 + m;
}

// Payment calculation matching Excel formulas exactly:
//
// Standard Rate (G) = Total Salary ÷ Days in Month ÷ Standard Working Hours
// OT Rate (H)       = IF designation is "helper" → FIXED AED 3/hr, else FIXED AED 4/hr
// Sunday Rate (I)   = OT Rate × 1.5
//
// Regular Day (Note 2):
//   ≤ standard hours:  RegularPay = hours × StandardRate,  OTPay = 0
//   > standard hours:  RegularPay = stdHours × StandardRate,  OTPay = (hours - stdHours) × OTRate
//
// Sunday / Holiday (Note 3):
//   FixedPay = stdHours × StandardRate  (always paid, even if 0 hours worked)
//   OTPay    = workedHours × SundayRate
//   Total    = FixedPay + OTPay
//
function calculatePayment(dailyWage, startTime, endTime, date, holidays, config, designation) {
  const start = parseTimeToMinutes(startTime);
  let end = parseTimeToMinutes(endTime);
  // Night shift support: if end <= start, worker crossed midnight
  if (end <= start) end += 24 * 60;
  const totalMinutes = end - start;
  const hoursWorked = totalMinutes / 60;

  const standardHours = parseFloat(config.regular_hours || "10");

  const d = new Date(date);
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

  // Standard hourly rate: Salary ÷ Days in Month ÷ Standard Hours
  const standardRate = dailyWage / daysInMonth / standardHours;

  // OT rate: FIXED by designation (Excel: =IF(D4="helper",3,4))
  const isHelper = (designation || "").toLowerCase().trim() === "helper";
  const helperOtRate = parseFloat(config.helper_ot_rate || "3");
  const nonHelperOtRate = parseFloat(config.non_helper_ot_rate || "4");
  const overtimeRate = isHelper ? helperOtRate : nonHelperOtRate;

  // Sunday/Holiday rate: OT Rate × 1.5 (Excel: =H4*1.5)
  const sundayMultiplier = parseFloat(config.sunday_ot_multiplier || "1.5");
  const sundayHolidayRate = overtimeRate * sundayMultiplier;

  const isSunday = d.getDay() === 0;
  const isHoliday = (holidays || []).some((h) => h.date === date);

  let regularPay = 0;
  let otPay = 0;
  let totalPay = 0;

  if (isSunday || isHoliday) {
    // Note 3: Fixed 10h pay + all worked hours at Sunday rate
    const fixedPay = standardHours * standardRate;
    const overtimeComponent = hoursWorked * sundayHolidayRate;
    regularPay = fixedPay;
    otPay = overtimeComponent;
    totalPay = fixedPay + overtimeComponent;
  } else {
    // Note 2: Regular day
    if (hoursWorked <= standardHours) {
      regularPay = hoursWorked * standardRate;
      otPay = 0;
    } else {
      regularPay = standardHours * standardRate;
      otPay = (hoursWorked - standardHours) * overtimeRate;
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

module.exports = { calculatePayment };