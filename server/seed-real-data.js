/**
 * REAL DATA SEED - Deletes dummy data, inserts actual data
 * 
 * Place in: server/seed-real-data.js
 * Run:  cd server && node seed-real-data.js
 */

const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const { createClient } = require("@supabase/supabase-js");

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function seed() {
  console.log("🗑️  Clearing all dummy data...\n");

  // Delete in order (foreign key constraints)
  await supabase.from("attendance").delete().neq("id", 0);
  console.log("  ✓ Attendance cleared");
  await supabase.from("sites").delete().neq("id", 0);
  console.log("  ✓ Sites cleared");
  await supabase.from("clients").delete().neq("id", 0);
  console.log("  ✓ Clients cleared");
  await supabase.from("holidays").delete().neq("id", 0);
  console.log("  ✓ Holidays cleared");
  await supabase.from("users").delete().neq("id", 0);
  console.log("  ✓ Users cleared");

  console.log("\n🚀 Inserting real data...\n");

  // ===== 1. ADMIN =====
  console.log("👤 Admin...");
  const adminPin = await bcrypt.hash("9999", 10);
  const { error: ae } = await supabase.from("users").insert({
    id: 1, username: "admin", name: "System Admin", role: "admin",
    pin: adminPin, daily_wage: 0, status: "active",
  });
  if (ae) console.error("  ⚠", ae.message); else console.log("  ✓ Admin (username: admin, PIN: 9999)");

  // ===== 2. REAL EMPLOYEES =====
  console.log("\n👷 Employees...");
  const employees = [
    { name: "Vinod",               passport: "Y1855508", designation: "Helper",                     wage: 1200, doj: "2025-12-09", pin: "1111" },
    { name: "Ram Kewal Verma",     passport: "B6372562", designation: "Helper",                     wage: 1200, doj: "2025-12-14", pin: "2222" },
    { name: "Rajesh Kumar",        passport: "X5584656", designation: "Helper",                     wage: 1200, doj: "2025-12-14", pin: "3333" },
    { name: "Umesh Kumar Verma",   passport: "W2271728", designation: "Helper",                     wage: 1200, doj: "2025-12-14", pin: "4444" },
    { name: "Vishwa Nath Verma",   passport: "I0280893", designation: "Gypsum Carpenter",           wage: 1600, doj: "2025-12-14", pin: "5555" },
    { name: "Jitendra Ram",        passport: "S2068487", designation: "Block Mason & Steel Fixer",  wage: 1600, doj: "2026-01-02", pin: "6666" },
    { name: "Dinesh Kumar",        passport: "X5583073", designation: "Helper",                     wage: 1200, doj: "2025-12-18", pin: "7777" },
    { name: "Sahil",               passport: "C6080219", designation: "Helper",                     wage: 1200, doj: "2025-12-18", pin: "8888" },
    { name: "Suraj Kumar Yadav",   passport: "V0333958", designation: "Gypsum Carpenter",           wage: 1400, doj: "2025-12-14", pin: "1234" },
    { name: "Adya Yadav",          passport: "R1035823", designation: "Scaffolder & Painter",       wage: 1500, doj: "2025-12-20", pin: "5678" },
  ];

  let labourId = 1001;
  for (const emp of employees) {
    const hash = await bcrypt.hash(emp.pin, 10);
    const { error } = await supabase.from("users").insert({
      id: labourId, username: String(labourId), name: emp.name, role: "labour",
      pin: hash, daily_wage: emp.wage, status: "active",
      designation: emp.designation, passport_id: emp.passport, date_of_joining: emp.doj,
    });
    if (error) console.error(`  ⚠ ${emp.name}: ${error.message}`);
    else console.log(`  ✓ ${emp.name} (ID: ${labourId}, PIN: ${emp.pin}) — ${emp.designation}, ₹${emp.wage}`);
    labourId++;
  }

  // ===== 3. CLIENTS =====
  console.log("\n🏢 Clients...");
  const clientMap = {};
  const clients = ["Arctic Green", "Exterior", "Shades Interior"];
  for (const name of clients) {
    const { data, error } = await supabase.from("clients").insert({ name }).select().single();
    if (error) console.error(`  ⚠ ${name}: ${error.message}`);
    else { clientMap[name] = data.id; console.log(`  ✓ ${name} (ID: ${data.id})`); }
  }

  // ===== 4. SITES =====
  console.log("\n📍 Sites...");
  const sitesData = [
    { client: "Arctic Green", name: "Khajana" },
    { client: "Arctic Green", name: "ENBD" },
    { client: "Arctic Green", name: "MOL" },
    { client: "Arctic Green", name: "Store" },
    { client: "Exterior", name: "Abu Dhabi" },
    { client: "Exterior", name: "Dubai" },
    { client: "Shades Interior", name: "Sharjah" },
  ];

  for (const s of sitesData) {
    const cid = clientMap[s.client];
    if (!cid) { console.error(`  ⚠ No client: ${s.client}`); continue; }
    const { data, error } = await supabase.from("sites").insert({ client_id: cid, name: s.name }).select().single();
    if (error) console.error(`  ⚠ ${s.name}: ${error.message}`);
    else console.log(`  ✓ ${s.name} → ${s.client} (ID: ${data.id})`);
  }

  // ===== 5. UAE HOLIDAYS 2026 =====
  console.log("\n📅 UAE Holidays 2026...");
  const holidays = [
    { date: "2026-03-20", name: "Eid Al Fitr" },
    { date: "2026-03-21", name: "Eid Al Fitr" },
    { date: "2026-05-26", name: "Arafat Day" },
    { date: "2026-05-27", name: "Eid Al Adha" },
    { date: "2026-05-28", name: "Eid Al Adha" },
    { date: "2026-05-29", name: "Eid Al Adha" },
    { date: "2026-06-15", name: "Islamic New Year" },
    { date: "2026-08-24", name: "The Prophet Muhammad's Birthday" },
    { date: "2026-12-02", name: "National Day" },
    { date: "2026-12-03", name: "National Day" },
  ];

  for (const h of holidays) {
    const { error } = await supabase.from("holidays").insert({ date: h.date, name: h.name });
    if (error) console.error(`  ⚠ ${h.name}: ${error.message}`);
    else console.log(`  ✓ ${h.date} — ${h.name}`);
  }

  // ===== 6. CONFIG =====
  console.log("\n⚙️  Config...");
  const configs = [
    { key: "regular_hours", value: "10", description: "Standard working hours per day" },
    { key: "helper_ot_rate", value: "3", description: "Fixed overtime rate for Helper designation (AED/hr)" },
    { key: "non_helper_ot_rate", value: "4", description: "Fixed overtime rate for non-Helper designations (AED/hr)" },
    { key: "sunday_ot_multiplier", value: "1.5", description: "Sunday/Holiday rate = OT Rate × this multiplier" },
    { key: "cutoff_hour", value: "16", description: "Yesterday check-in cutoff hour (24h format)" },
    { key: "cutoff_minute", value: "30", description: "Yesterday check-in cutoff minute" },
  ];
  for (const c of configs) {
    const { error } = await supabase.from("config").upsert(c, { onConflict: "key" });
    if (error) console.error(`  ⚠ ${c.key}: ${error.message}`);
    else console.log(`  ✓ ${c.key} = ${c.value}`);
  }

  // ===== VERIFY =====
  console.log("\n🔍 Verification...");
  const { count: uc } = await supabase.from("users").select("*", { count: "exact", head: true });
  const { count: cc } = await supabase.from("clients").select("*", { count: "exact", head: true });
  const { count: sc } = await supabase.from("sites").select("*", { count: "exact", head: true });
  const { count: hc } = await supabase.from("holidays").select("*", { count: "exact", head: true });
  console.log(`  Users: ${uc}, Clients: ${cc}, Sites: ${sc}, Holidays: ${hc}`);

  console.log("\n✅ Done! All real data loaded.\n");
  console.log("📋 Login credentials:");
  console.log("  Admin:             username=admin  PIN=9999");
  console.log("  Vinod:             username=1001   PIN=1111");
  console.log("  Ram Kewal Verma:   username=1002   PIN=2222");
  console.log("  Rajesh Kumar:      username=1003   PIN=3333");
  console.log("  Umesh Kumar Verma: username=1004   PIN=4444");
  console.log("  Vishwa Nath Verma: username=1005   PIN=5555");
  console.log("  Jitendra Ram:      username=1006   PIN=6666");
  console.log("  Dinesh Kumar:      username=1007   PIN=7777");
  console.log("  Sahil:             username=1008   PIN=8888");
  console.log("  Suraj Kumar Yadav: username=1009   PIN=1234");
  console.log("  Adya Yadav:        username=1010   PIN=5678");

  process.exit(0);
}

seed().catch(err => { console.error("❌", err); process.exit(1); });