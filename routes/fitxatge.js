// routes/fitxatge.js – Supabase versio
import express from "express";
import dayjs from "dayjs";
import isoWeek from "dayjs/plugin/isoWeek.js";
import supabase from "../supabase.js";

dayjs.extend(isoWeek);

const router = express.Router();

const MAX_SESSION_SECONDS = 10 * 3600; // Auto checkout after 10 hours
const AUTO_CHECK_INTERVAL_MS = 5 * 60 * 1000; // Check every 5 minutes

/* ------------------------------------------------------------- */
/* Helpers                                                       */
/* ------------------------------------------------------------- */

function timeToSeconds(timeStr = "00:00:00") {
  const [h = 0, m = 0, s = 0] = timeStr.split(":").map(Number);
  return h * 3600 + m * 60 + s;
}

function secondsToTime(totalSeconds = 0) {
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

async function sumSecondsForDay(employeeId, dateStr) {
  const { data, error } = await supabase
    .from("fitxatge")
    .select("hores_diaries")
    .eq("employee_id", employeeId)
    .eq("dia", dateStr);

  if (error) return 0;
  return data.reduce((t, r) => t + timeToSeconds(r.hores_diaries), 0);
}

async function sumSecondsForWeek(employeeId, now) {
  const start = now.startOf("week").format("YYYY-MM-DD");
  const end = now.endOf("week").format("YYYY-MM-DD");

  const { data, error } = await supabase
    .from("fitxatge")
    .select("hores_diaries")
    .eq("employee_id", employeeId)
    .gte("dia", start)
    .lte("dia", end);

  if (error) return 0;
  return data.reduce((t, r) => t + timeToSeconds(r.hores_diaries), 0);
}

async function sumSecondsForMonth(employeeId, now) {
  const start = now.startOf("month").format("YYYY-MM-DD");
  const end = now.endOf("month").format("YYYY-MM-DD");

  const { data, error } = await supabase
    .from("fitxatge")
    .select("hores_diaries")
    .eq("employee_id", employeeId)
    .gte("dia", start)
    .lte("dia", end);

  if (error) return 0;
  return data.reduce((t, r) => t + timeToSeconds(r.hores_diaries), 0);
}

/********************************************************************
 *  POST: /api/fitxatge/checkin-out
 *******************************************************************/
router.post("/checkin-out", async (req, res) => {
  try {
    const { pinCode } = req.body;
    if (!pinCode) return res.status(400).json({ error: "PIN code required." });

    // 1) Find employee
    const { data: employee, error: empErr } = await supabase
      .from("employees")
      .select("employee_id")
      .eq("pin_code", pinCode)
      .maybeSingle();

    if (!employee) return res.status(404).json({ error: "Invalid PIN code." });
    if (empErr) return res.status(500).json({ error: "Employee lookup failed." });

    const employeeId = employee.employee_id;
    const now = dayjs();
    const today = now.format("YYYY-MM-DD");
    const nowTime = now.format("HH:mm:ss");

    // 2) Latest fitxatge entry
    const { data: last } = await supabase
      .from("fitxatge")
      .select("*")
      .eq("employee_id", employeeId)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();

    /********** CHECK-IN **********/
    if (!last || last.working === false) {
      await supabase.from("fitxatge").insert([
        {
          dia: today,
          hora: nowTime,
          employee_id: employeeId,
          working: true,
          active: true,
          hores_diaries: "00:00:00",
          hores_setmanals: "00:00:00",
          hores_mensuals: "00:00:00",
          vacances: 0,
        },
      ]);
      return res.json({ message: "Check-in successful." });
    }

    /********** CHECK-OUT **********/
    const start = dayjs(`${last.dia} ${last.hora}`);
    let seconds = now.diff(start, "second");
    let forced = false;

    if (seconds > MAX_SESSION_SECONDS) {
      seconds = MAX_SESSION_SECONDS;
      forced = true;
    }

    const [dayS, weekS, monthS] = await Promise.all([
      sumSecondsForDay(employeeId, today),
      sumSecondsForWeek(employeeId, now),
      sumSecondsForMonth(employeeId, now),
    ]);

    await supabase.from("fitxatge").insert([
      {
        dia: today,
        hora: nowTime,
        employee_id: employeeId,
        working: false,
        active: false,
        hores_diaries: secondsToTime(dayS + seconds),
        hores_setmanals: secondsToTime(weekS + seconds),
        hores_mensuals: secondsToTime(monthS + seconds),
        vacances: last.vacances ?? 0,
      },
    ]);

    // If forced, log incidence
    if (forced) {
      await supabase.from("incidences").insert([
        {
          worker_id: employeeId,
          incidence_type: "Auto-checkout >10h (no manual checkout)",
          description: "Employee did not check out after 10 hours. Automatic checkout applied.",
          InstanceStatus: "Open",
          date_created: today,
        },
      ]);
    }

    return res.json({
      message: forced
        ? "Check-out successful (auto-capped at 10 hours)."
        : "Check-out successful.",
    });
  } catch (e) {
    console.error("checkin-out error:", e);
    return res.status(500).json({ error: "Unexpected server error." });
  }
});

/********************************************************************
 *  GET: /api/fitxatge/active-employees
 *  Optional query param: ?department=X
 *******************************************************************/
router.get("/active-employees", async (req, res) => {
  const { department } = req.query;

  try {
    // Get all active employees
    const { data, error } = await supabase.rpc("get_active_employees");
    if (error) throw error;

    let activeEmployees = data || [];

    // If department filter is provided, filter the results
    if (department) {
      activeEmployees = activeEmployees.filter(
        (emp) => emp.department === department
      );
    }

    res.json(activeEmployees);
  } catch (err) {
    console.error("Error fetching active employees:", err);
    return res.status(500).json({ error: "RPC get_active_employees failed." });
  }
});

/********************************************************************
 *  GET: /api/fitxatge/editor/:employee_id
 *******************************************************************/
router.get("/editor/:employee_id", async (req, res) => {
  const employeeId = Number(req.params.employee_id);
  if (Number.isNaN(employeeId)) return res.status(400).json({ error: "Invalid ID." });

  const { data, error } = await supabase
    .from("fitxatge")
    .select("*")
    .eq("employee_id", employeeId)
    .order("dia")
    .order("hora")
    .order("id");

  if (error) return res.status(500).json({ error: "Failed to load records." });
  res.json(data || []);
});

/********************************************************************
 *  BACKGROUND TASK — Auto checkout
 *******************************************************************/
async function forceLongSessions() {
  const { data: openSessions } = await supabase.rpc("get_open_sessions");
  if (!openSessions) return;

  const now = dayjs();
  const today = now.format("YYYY-MM-DD");
  const nowTime = now.format("HH:mm:ss");

  for (const r of openSessions) {
    const started = dayjs(`${r.dia} ${r.hora}`);
    const seconds = now.diff(started, "second");

    if (seconds <= MAX_SESSION_SECONDS) continue;

    console.log(`Auto-checkout: Employee ${r.employee_id} exceeded 10 hours. Checking out automatically...`);

    const [dayS, weekS, monthS] = await Promise.all([
      sumSecondsForDay(r.employee_id, today),
      sumSecondsForWeek(r.employee_id, now),
      sumSecondsForMonth(r.employee_id, now),
    ]);

    await supabase.from("fitxatge").insert([
      {
        dia: today,
        hora: nowTime,
        employee_id: r.employee_id,
        working: false,
        active: false,
        hores_diaries: secondsToTime(dayS + MAX_SESSION_SECONDS),
        hores_setmanals: secondsToTime(weekS + MAX_SESSION_SECONDS),
        hores_mensuals: secondsToTime(monthS + MAX_SESSION_SECONDS),
      },
    ]);

    await supabase.from("incidences").insert([
      {
        worker_id: r.employee_id,
        incidence_type: "Auto-checkout >10h (no manual checkout)",
        description: "Employee did not check out after 10 hours. Automatic checkout applied.",
        InstanceStatus: "Open",
        date_created: today,
      },
    ]);
  }
}

setTimeout(forceLongSessions, 10_000);
setInterval(forceLongSessions, AUTO_CHECK_INTERVAL_MS);

export default router;
