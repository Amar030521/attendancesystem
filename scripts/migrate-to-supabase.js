/**
 * MIGRATION SCRIPT: SQLite → Supabase
 * 
 * Run this on your local machine (where SQLite DB exists):
 * 
 *   cd server
 *   npm install @supabase/supabase-js
 *   node scripts/migrate-to-supabase.js
 * 
 * Make sure .env has:
 *   SUPABASE_URL=https://your-project.supabase.co
 *   SUPABASE_SERVICE_KEY=your-service-role-key
 */

const path = require("path");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const sqlite3 = require("sqlite3").verbose();
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Set SUPABASE_URL and SUPABASE_SERVICE_KEY in server/.env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, "..", "..", "database", "labour.db");
const db = new sqlite3.Database(dbPath);

function sqlAll(query) {
  return new Promise((resolve, reject) => {
    db.all(query, (err, rows) => { if (err) reject(err); else resolve(rows); });
  });
}

async function migrate() {
  console.log("🚀 Starting SQLite → Supabase migration...\n");

  // 1. USERS
  console.log("📦 Migrating users...");
  const users = await sqlAll("SELECT * FROM users");
  for (const u of users) {
    const { error } = await supabase.from("users").upsert({
      id: u.id, username: u.username, name: u.name, role: u.role, pin: u.pin,
      daily_wage: u.daily_wage, phone: u.phone || null,
      designation: null, // New column, no data yet
      passport_id: u.passport_id || null, date_of_joining: u.date_of_joining || null,
      status: u.status || "active",
    }, { onConflict: "id" });
    if (error) console.error(`  ⚠ User ${u.id}: ${error.message}`);
  }
  console.log(`  ✓ ${users.length} users migrated`);

  // 2. CLIENTS
  console.log("📦 Migrating clients...");
  const clients = await sqlAll("SELECT * FROM clients");
  for (const c of clients) {
    const { error } = await supabase.from("clients").upsert({ id: c.id, name: c.name }, { onConflict: "id" });
    if (error) console.error(`  ⚠ Client ${c.id}: ${error.message}`);
  }
  console.log(`  ✓ ${clients.length} clients migrated`);

  // Reset clients sequence
  if (clients.length > 0) {
    const maxClientId = Math.max(...clients.map(c => c.id));
    await supabase.rpc("setval_clients", { val: maxClientId }).catch(() => {});
    // Fallback: run in SQL editor: SELECT setval('clients_id_seq', (SELECT MAX(id) FROM clients));
  }

  // 3. SITES
  console.log("📦 Migrating sites...");
  const sites = await sqlAll("SELECT * FROM sites");
  for (const s of sites) {
    const { error } = await supabase.from("sites").upsert({ id: s.id, client_id: s.client_id, name: s.name }, { onConflict: "id" });
    if (error) console.error(`  ⚠ Site ${s.id}: ${error.message}`);
  }
  console.log(`  ✓ ${sites.length} sites migrated`);

  // 4. HOLIDAYS
  console.log("📦 Migrating holidays...");
  const holidays = await sqlAll("SELECT * FROM holidays");
  for (const h of holidays) {
    const { error } = await supabase.from("holidays").upsert({ id: h.id, date: h.date, name: h.name }, { onConflict: "id" });
    if (error) console.error(`  ⚠ Holiday ${h.id}: ${error.message}`);
  }
  console.log(`  ✓ ${holidays.length} holidays migrated`);

  // 5. CONFIG
  console.log("📦 Migrating config...");
  const config = await sqlAll("SELECT * FROM config");
  for (const c of config) {
    const { error } = await supabase.from("config").upsert({ key: c.key, value: c.value, description: c.description }, { onConflict: "key" });
    if (error) console.error(`  ⚠ Config ${c.key}: ${error.message}`);
  }
  console.log(`  ✓ ${config.length} config rows migrated`);

  // 6. ATTENDANCE
  console.log("📦 Migrating attendance...");
  const attendance = await sqlAll("SELECT * FROM attendance");
  // Batch in groups of 50
  for (let i = 0; i < attendance.length; i += 50) {
    const batch = attendance.slice(i, i + 50).map(a => ({
      id: a.id, labour_id: a.labour_id, date: a.date, client_id: a.client_id, site_id: a.site_id,
      start_time: a.start_time, end_time: a.end_time, hours_worked: a.hours_worked,
      regular_pay: a.regular_pay, ot_pay: a.ot_pay || 0, total_pay: a.total_pay,
      is_sunday: !!a.is_sunday, is_holiday: !!a.is_holiday,
      client_verified: !!a.client_verified, admin_verified: !!a.admin_verified,
      verified_at: a.verified_at || null, verified_by: a.verified_by || null,
      notes: a.notes || null,
    }));
    const { error } = await supabase.from("attendance").upsert(batch, { onConflict: "id" });
    if (error) console.error(`  ⚠ Attendance batch ${i}: ${error.message}`);
  }
  console.log(`  ✓ ${attendance.length} attendance records migrated`);

  // 7. Fix sequences
  console.log("\n🔧 Fixing auto-increment sequences...");
  console.log("   Run these in Supabase SQL Editor:");
  console.log("   SELECT setval('clients_id_seq', (SELECT COALESCE(MAX(id),0) FROM clients));");
  console.log("   SELECT setval('sites_id_seq', (SELECT COALESCE(MAX(id),0) FROM sites));");
  console.log("   SELECT setval('holidays_id_seq', (SELECT COALESCE(MAX(id),0) FROM holidays));");
  console.log("   SELECT setval('attendance_id_seq', (SELECT COALESCE(MAX(id),0) FROM attendance));");

  console.log("\n✅ Migration complete!");
  db.close();
  process.exit(0);
}

migrate().catch(err => { console.error("❌ Migration failed:", err); process.exit(1); });