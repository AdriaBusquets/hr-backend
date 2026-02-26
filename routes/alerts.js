import express from 'express';
import dayjs from 'dayjs';
import supabase from '../supabase.js';

const router = express.Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true });
});

router.get('/test', (_req, res) => {
  res.json({ message: 'API is working correctly!' });
});

/* ------------------------------------------------------------------ */
/* GET /api/alerts                                                      */
/* ------------------------------------------------------------------ */
router.get('/', async (_req, res) => {
  try {
    console.log('📢  /api/alerts called');

    const [clockedInNow, sickToday, openIncidences, contractsExpiring, yesterdayAutoCheckouts] =
      await Promise.all([
        getClockedInNow(),
        getSickToday(),
        getOpenIncidences(),
        getContractsExpiring(),
        getYesterdayAutoCheckouts(),
      ]);

    res.json({ clockedInNow, sickToday, openIncidences, contractsExpiring, yesterdayAutoCheckouts });
  } catch (err) {
    console.error('❌ /api/alerts failed:', err);
    res.status(500).json({ error: 'Failed to fetch alerts data.' });
  }
});

/* ================================================================== */
/* 1️⃣  Employees currently clocked in                                */
/*     Uses the same get_active_employees RPC as ActiveEmployeesScreen*/
/* ================================================================== */
async function getClockedInNow() {
  const { data: active, error } = await supabase.rpc('get_active_employees');

  if (error) {
    console.error('clockedInNow error:', error);
    return [];
  }
  if (!active?.length) return [];

  const empIds = active.map((e) => e.employee_id);

  // Fetch the latest check-in row per employee to get dia + hora
  const { data: checkIns } = await supabase
    .from('fitxatge')
    .select('employee_id, dia, hora')
    .in('employee_id', empIds)
    .eq('working', true)
    .order('id', { ascending: false });

  // Keep only the first (most recent) check-in per employee
  const startMap = {};
  (checkIns || []).forEach((r) => {
    if (!startMap[r.employee_id]) {
      startMap[r.employee_id] = { dia: r.dia, start_time: r.hora };
    }
  });

  return active.map((e) => ({
    full_name: e.full_name,
    dia:        startMap[e.employee_id]?.dia        ?? null,
    start_time: startMap[e.employee_id]?.start_time ?? null,
  }));
}

/* ================================================================== */
/* 2️⃣  Employees on sick leave today                                  */
/* ================================================================== */
async function getSickToday() {
  const today = dayjs().format('YYYY-MM-DD');

  const { data: baixes, error } = await supabase
    .from('baixes')
    .select('employee_id, dia_inici, num_dias, type, return_date')
    .lte('dia_inici', today);

  if (error) {
    console.error('sickToday error:', error);
    return [];
  }
  if (!baixes?.length) return [];

  const d = dayjs(today);
  const activeBaixes = baixes.filter((b) => {
    const start = dayjs(b.dia_inici);
    const end = b.return_date
      ? dayjs(b.return_date).subtract(1, 'day')
      : start.add(Math.max((Number(b.num_dias) || 1) - 1, 0), 'day');
    return !d.isBefore(start) && !d.isAfter(end);
  });

  if (!activeBaixes.length) return [];

  const empIds = activeBaixes.map((b) => b.employee_id);
  const { data: employees } = await supabase
    .from('employees')
    .select('employee_id, full_name')
    .in('employee_id', empIds);

  const empMap = {};
  (employees || []).forEach((e) => { empMap[e.employee_id] = e.full_name; });

  return activeBaixes.map((b) => ({
    full_name: empMap[b.employee_id] || 'Unknown',
    type: b.type,
    dia_inici: b.dia_inici,
    return_date: b.return_date,
  }));
}

/* ================================================================== */
/* 3️⃣  Open incidences — count + breakdown by workplace              */
/* ================================================================== */
async function getOpenIncidences() {
  const { count, error: countErr } = await supabase
    .from('incidences')
    .select('incidence_id', { count: 'exact', head: true })
    .neq('instancestatus', 'Completed');

  if (countErr) {
    console.error('openIncidences count error:', countErr);
  }

  const { data: perWorkplace, error: perErr } = await supabase.rpc(
    'get_incidences_by_workplace'
  );

  if (perErr) {
    console.error('perWorkplace error:', perErr);
    return { totalOpen: count || 0, perWorkplace: [] };
  }

  return { totalOpen: count || 0, perWorkplace: perWorkplace || [] };
}

/* ================================================================== */
/* 4️⃣  Contracts expiring within 30 days                             */
/* ================================================================== */
async function getContractsExpiring() {
  const today = dayjs().format('YYYY-MM-DD');
  const in30  = dayjs().add(30, 'day').format('YYYY-MM-DD');

  const { data, error } = await supabase
    .from('workdetails')
    .select('employee_id, contract_end_date, job_title')
    .gte('contract_end_date', today)
    .lte('contract_end_date', in30);

  if (error) {
    console.error('contractsExpiring error:', error);
    return [];
  }
  if (!data?.length) return [];

  const empIds = data.map((d) => d.employee_id);
  const { data: employees } = await supabase
    .from('employees')
    .select('employee_id, full_name')
    .in('employee_id', empIds);

  const empMap = {};
  (employees || []).forEach((e) => { empMap[e.employee_id] = e.full_name; });

  return data.map((d) => ({
    full_name: empMap[d.employee_id] || 'Unknown',
    contract_end_date: d.contract_end_date,
    job_title: d.job_title,
  }));
}

/* ================================================================== */
/* 5️⃣  Auto-checkouts from yesterday (>10h, no manual checkout)      */
/* ================================================================== */
async function getYesterdayAutoCheckouts() {
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');

  const { data: incidents, error } = await supabase
    .from('incidences')
    .select('worker_id, date_created')
    .eq('incidence_type', 'Auto-checkout >10h (no manual checkout)')
    .gte('date_created', yesterday + 'T00:00:00')
    .lte('date_created', yesterday + 'T23:59:59')
    .order('date_created', { ascending: false });

  if (error) {
    console.error('yesterdayAutoCheckouts error:', error);
    return [];
  }
  if (!incidents?.length) return [];

  const workerIds = [...new Set(incidents.map((i) => i.worker_id))];
  const { data: employees } = await supabase
    .from('employees')
    .select('employee_id, full_name')
    .in('employee_id', workerIds);

  const empMap = {};
  (employees || []).forEach((e) => { empMap[e.employee_id] = e.full_name; });

  return incidents.map((r) => ({
    full_name: empMap[r.worker_id] || 'Unknown',
    date: r.date_created,
  }));
}

export default router;
