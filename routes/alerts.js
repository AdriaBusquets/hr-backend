import express from 'express';
import dayjs from 'dayjs';
import { supabase } from '../supabase.js';

const router = express.Router();

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

    const contract300 = await getContract300();
    const over12hDays = await getOver12HoursPerDay();
    const over225days = await getOver225Days();
    const incidences  = await getIncidencesData();

    res.json({ contract300, over12hDays, over225days, incidences });
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
/* 2️⃣  >12 h worked in a single calendar day                          */
/* ================================================================== */
async function getOver12HoursPerDay() {
  const { data, error } = await supabase.rpc("get_over_12_hours");
  if (error) {
    console.error("over12hDays error:", error);
    return [];
  }
  return data;
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
  const { data: totalOpenData, error: totalOpenErr } = await supabase
    .from("Incidences")
    .select("incidence_id", { count: "exact", head: true })
    .neq("InstanceStatus", "Completed");

  if (totalOpenErr) {
    console.error("totalOpen error:", totalOpenErr);
  }

  const { data: perWorkplace, error: perErr } = await supabase.rpc(
    "get_incidences_by_workplace"
  );

  if (perErr) {
    console.error("perWorkplace error:", perErr);
    return { totalOpen: 0, perWorkplace: [] };
  }

  return {
    totalOpen: totalOpenData || 0,
    perWorkplace,
  };
}

export default router;
