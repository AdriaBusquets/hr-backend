import express from 'express';
import dayjs from 'dayjs';
import supabase from '../supabase.js';


const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ ok: true });
});


/* ------------------------------------------------------------------ */
/* Test route – quick ping                                            */
/* ------------------------------------------------------------------ */
router.get('/test', (_req, res) => {
  res.json({ message: 'API is working correctly!' });
});

/* ------------------------------------------------------------------ */
/* GET /api/alerts                                                    */
/* ------------------------------------------------------------------ */
router.get('/', async (_req, res) => {
  try {
    console.log("📢  /api/alerts called");

    const contract300    = await getContract300();
    const autoCheckouts  = await getAutoCheckouts();
    const over225days    = await getOver225Days();
    const incidences     = await getIncidencesData();

    res.json({ contract300, autoCheckouts, over225days, incidences });
  } catch (err) {
    console.error("❌ /api/alerts failed:", err);
    res.status(500).json({ error: "Failed to fetch alerts data." });
  }
});

/* ================================================================== */
/* 1️⃣  Contracts >= 300 days                                          */
/* ================================================================== */
async function getContract300() {
  const { data, error } = await supabase.rpc("get_contracts_300_days");
  if (error) {
    console.error("contract300 error:", error);
    return [];
  }
  return data;
}

/* ================================================================== */
/* 2️⃣  Employees who had an automatic checkout triggered (>10h)       */
/* ================================================================== */
async function getAutoCheckouts() {
  const { data: incidents, error } = await supabase
    .from("incidences")
    .select("worker_id, date_created")
    .eq("incidence_type", "Auto-checkout >10h (no manual checkout)")
    .order("date_created", { ascending: false })
    .limit(50);

  if (error) {
    console.error("autoCheckouts error:", error);
    return [];
  }

  if (!incidents || incidents.length === 0) return [];

  const workerIds = [...new Set(incidents.map((i) => i.worker_id))];
  const { data: employees } = await supabase
    .from("employees")
    .select("employee_id, full_name")
    .in("employee_id", workerIds);

  const empMap = {};
  (employees || []).forEach((e) => { empMap[e.employee_id] = e.full_name; });

  return incidents.map((r) => ({
    full_name: empMap[r.worker_id] || "Unknown",
    date: r.date_created,
  }));
}

/* ================================================================== */
/* 3️⃣ ≥ 225 distinct working days                                     */
/* ================================================================== */
async function getOver225Days() {
  const { data, error } = await supabase.rpc("get_over_225_days");
  if (error) {
    console.error("over225days error:", error);
    return [];
  }
  return data;
}

/* ================================================================== */
/* 4️⃣ Open incidences                                                 */
/* ================================================================== */
async function getIncidencesData() {

  // ❗ FIXED: this is the correct Supabase count syntax
  const { count, error: countErr } = await supabase
    .from("incidences")
    .select('incidence_id', { count: 'exact', head: true })
    .neq("InstanceStatus", "Completed");

  if (countErr) {
    console.error("totalOpen error:", countErr);
  }

  const { data: perWorkplace, error: perErr } = await supabase.rpc(
    "get_incidences_by_workplace"
  );

  if (perErr) {
    console.error("perWorkplace error:", perErr);
    return { totalOpen: 0, perWorkplace: [] };
  }

  return {
    totalOpen: count || 0,
    perWorkplace,
  };
}

export default router;
