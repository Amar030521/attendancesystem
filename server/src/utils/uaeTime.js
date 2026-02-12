/**
 * UAE Timezone Utility
 * All date/time operations use Asia/Dubai (UTC+4)
 * Critical for: cutoff enforcement, today/yesterday calculation, date strings
 */

const UAE_TZ = "Asia/Dubai";

/**
 * Get current date/time in UAE timezone
 * Returns a plain object with year, month, day, hours, minutes
 */
function uaeNow() {
  const now = new Date();
  // Format in UAE timezone to extract components
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: UAE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const obj = {};
  parts.forEach(p => { obj[p.type] = p.value; });

  return {
    year: parseInt(obj.year),
    month: parseInt(obj.month),
    day: parseInt(obj.day),
    hours: parseInt(obj.hour),
    minutes: parseInt(obj.minute),
  };
}

/**
 * Get today's date string in UAE timezone (YYYY-MM-DD)
 */
function uaeToday() {
  const n = uaeNow();
  return `${n.year}-${String(n.month).padStart(2, "0")}-${String(n.day).padStart(2, "0")}`;
}

/**
 * Get yesterday's date string in UAE timezone (YYYY-MM-DD)
 */
function uaeYesterday() {
  const now = new Date();
  // Subtract 1 day in UTC, then format in UAE
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: UAE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(yesterday);

  const obj = {};
  parts.forEach(p => { obj[p.type] = p.value; });
  return `${obj.year}-${obj.month}-${obj.day}`;
}

/**
 * Convert any Date to YYYY-MM-DD string in UAE timezone
 */
function uaeDateStr(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: UAE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const obj = {};
  parts.forEach(p => { obj[p.type] = p.value; });
  return `${obj.year}-${obj.month}-${obj.day}`;
}

module.exports = { uaeNow, uaeToday, uaeYesterday, uaeDateStr, UAE_TZ };