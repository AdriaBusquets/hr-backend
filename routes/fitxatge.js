// routes/fitxatge.js – Supabase version
import express from 'express';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
const supabase = require('../supabase');


dayjs.extend(isoWeek);

const router = express.Router();

const MAX_SESSION_SECONDS = 12.5 * 3600;      // 12 h 30 min
const AUTO_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/* ------------------------------------------------------------- */
/* Helpers                                                       */
/* ------------------------------------------------------------- */

// "HH:MM:SS" → seconds
function timeToSeconds(timeStr = '00:00:00') {
  const [h = 0, m = 0, s = 0] = (timeStr || '00:00:00').split(':').map(Number);
  return h * 3600 + m * 60 + s;
}

// seconds → "HH:MM:SS"
function secondsToTime(totalSeconds = 0) {
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

// Sum Hores_Diaries for a given day
async function sumSecondsForDay(employeeId, dateStr) {
  const { data, error } = await supabase
    .from('Fitxatge')
    .select('hores_diaries')
    .eq('employee_id', employeeId)
    .eq('dia', dateStr);

  if (error) {
    console.error('sumSecondsForDay error:', error);
    return 0;
  }

  let total = 0;
  for (const row of data || []) {
    total += timeToSeconds(row.hores_diaries);
  }
  return total;
}

// Sum for the ISO week containing "now"
async function sumSecondsForWeek(employeeId, now) {
  const weekStart = now.startOf('week'); // close enough to original %W logic
  const weekEnd = now.endOf('week');

  const { data, error } = await supabase
    .from('Fitxatge')
    .select('hores_diaries, dia')
    .eq('employee_id', employeeId)
    .gte('dia', weekStart.format('YYYY-MM-DD'))
    .lte('dia', weekEnd.format('YYYY-MM-DD'));

  if (error) {
    console.error('sumSecondsForWeek error:', error);
    return 0;
  }

  let total = 0;
  for (const row of data || []) {
    total += timeToSeconds(row.hores_diaries);
  }
  return total;
}

// Sum for the month containing "now"
async function sumSecondsForMonth(employeeId, now) {
  const monthStart = now.startOf('month');
  const monthEnd = now.endOf('month');

  const { data, error } = await supabase
    .from('Fitxatge')
    .select('hores_diaries, dia')
    .eq('employee_id', employeeId)
    .gte('dia', monthStart.format('YYYY-MM-DD'))
    .lte('dia', monthEnd.format('YYYY-MM-DD'));

  if (error) {
    console.error('sumSecondsForMonth error:', error);
    return 0;
  }

  let total = 0;
  for (const row of data || []) {
    total += timeToSeconds(row.hores_diaries);
  }
  return total;
}

/********************************************************************
 *  POST /api/fitxatge/checkin-out
 *******************************************************************/
router.post('/checkin-out', async (req, res) => {
  try {
    const { pinCode } = req.body;
    if (!pinCode) {
      return res.status(400).json({ error: 'PIN code is required.' });
    }

    // 1) Look up employee
    const { data: employee, error: empErr } = await supabase
      .from('Employees')
      .select('employee_id')
      .eq('pin_code', pinCode)
      .maybeSingle();

    if (empErr) {
      console.error('Employee lookup error:', empErr);
      return res.status(500).json({ error: 'DB error (employee lookup).' });
    }
    if (!employee) {
      return res.status(404).json({ error: 'Invalid PIN code.' });
    }

    const employeeId = employee.employee_id;
    const now = dayjs();
    const today = now.format('YYYY-MM-DD');
    const nowTime = now.format('HH:mm:ss');

    // 2) Fetch latest Fitxatge row
    const { data: last, error: lastErr } = await supabase
      .from('Fitxatge')
      .select('*')
      .eq('employee_id', employeeId)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) {
      console.error('Fitxatge lookup error:', lastErr);
      return res
        .status(500)
        .json({ error: 'DB error (fitxatge lookup).' });
    }

    /******************** CHECK-IN *****************************/
    if (!last || last.working === false) {
      const { error: insertErr } = await supabase.from('Fitxatge').insert([
        {
          dia: today,
          hora: nowTime,
          employee_id: employeeId,
          working: true,
          active: true,
          hores_diaries: '00:00:00',
          hores_setmanals: '00:00:00',
          hores_mensuals: '00:00:00',
          vacances: 0,
        },
      ]);

      if (insertErr) {
        console.error('Check-in insert error:', insertErr);
        return res.status(500).json({ error: 'Error inserting check-in.' });
      }

      return res.json({ message: 'Check-in successful.' });
    }

    /******************** CHECK-OUT ****************************/
    const start = dayjs(`${last.dia} ${last.hora}`);
    let seconds = now.diff(start, 'second');
    let forced = false;

    if (seconds > MAX_SESSION_SECONDS) {
      seconds = MAX_SESSION_SECONDS;
      forced = true;
    }

    // Sum already-recorded time buckets
    const [dayS, weekS, monthS] = await Promise.all([
      sumSecondsForDay(employeeId, today),
      sumSecondsForWeek(employeeId, now),
      sumSecondsForMonth(employeeId, now),
    ]);

    const { error: insertOutErr } = await supabase.from('Fitxatge').insert([
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

    if (insertOutErr) {
      console.error('Check-out insert error:', insertOutErr);
      return res.status(500).json({ error: 'Error inserting check-out.' });
    }

    // If forced, log an incidence
    if (forced) {
      const { error: incErr } = await supabase.from('Incidences').insert([
        {
          worker_id: employeeId,
          incidence_type: 'Auto-checkout >12h30',
          // InstanceStatus will default to 'Open'
          date_created: today,
        },
      ]);
      if (incErr) {
        console.error('Incidence insert error:', incErr);
      }
    }

    return res.json({
      message: forced
        ? 'Check-out successful (auto-capped at 12 h 30 min).'
        : 'Check-out successful.',
    });
  } catch (e) {
    console.error('checkin-out error:', e);
    return res.status(500).json({ error: 'Unexpected server error.' });
  }
});

/********************************************************************
 *  GET /api/fitxatge/active-employees
 *******************************************************************/
router.get('/active-employees', async (_req, res) => {
  try {
    const { data, error } = await supabase.rpc('get_active_employees');

    if (error) {
      console.error('get_active_employees RPC error:', error);
      return res
        .status(500)
        .json({ error: 'Failed to fetch active employees.' });
    }
    res.json(data || []);
  } catch (e) {
    console.error('active-employees error:', e);
    res
      .status(500)
      .json({ error: 'Failed to fetch active employees.' });
  }
});

/********************************************************************
 *  GET /api/fitxatge/editor/:employee_id
 *******************************************************************/
router.get('/editor/:employee_id', async (req, res) => {
  const employeeId = Number(req.params.employee_id);

  if (Number.isNaN(employeeId)) {
    return res.status(400).json({ error: 'Invalid employee id.' });
  }

  try {
    const { data, error } = await supabase
      .from('Fitxatge')
      .select('*')
      .eq('employee_id', employeeId)
      .order('dia', { ascending: true })
      .order('hora', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('Fitxatge editor error:', error);
      return res
        .status(500)
        .json({ error: 'DB error while fetching records.' });
    }

    res.json(data || []);
  } catch (e) {
    console.error('editor route error:', e);
    res
      .status(500)
      .json({ error: 'DB error while fetching records.' });
  }
});

/********************************************************************
 *  BACKGROUND TASK – auto-checkout sessions > 12 h 30 min
 *  (still runs in Node, but uses Supabase DB)
 *******************************************************************/
async function forceLongSessions() {
  try {
    const { data: openSessions, error } = await supabase.rpc(
      'get_open_sessions'
    );

    if (error) {
      console.error('[auto-checkout] get_open_sessions error:', error);
      return;
    }

    const now = dayjs();
    const today = now.format('YYYY-MM-DD');
    const nowTime = now.format('HH:mm:ss');

    for (const r of openSessions || []) {
      const started = dayjs(`${r.dia} ${r.hora}`);
      const seconds = now.diff(started, 'second');

      if (seconds <= MAX_SESSION_SECONDS) continue;

      const [dayS, weekS, monthS] = await Promise.all([
        sumSecondsForDay(r.employee_id, today),
        sumSecondsForWeek(r.employee_id, now),
        sumSecondsForMonth(r.employee_id, now),
      ]);

      const { error: insertErr } = await supabase.from('Fitxatge').insert([
        {
          dia: today,
          hora: nowTime,
          employee_id: r.employee_id,
          working: false,
          active: false,
          hores_diaries: secondsToTime(dayS + MAX_SESSION_SECONDS),
          hores_setmanals: secondsToTime(weekS + MAX_SESSION_SECONDS),
          hores_mensuals: secondsToTime(monthS + MAX_SESSION_SECONDS),
          vacances: 0,
        },
      ]);

      if (insertErr) {
        console.error('[auto-checkout] insert error:', insertErr);
        continue;
      }

      const { error: incErr } = await supabase.from('Incidences').insert([
        {
          worker_id: r.employee_id,
          incidence_type: 'Auto-checkout >12h30',
          date_created: today,
        },
      ]);

      if (incErr) {
        console.error('[auto-checkout] incidence error:', incErr);
      }

      console.log(
        `[auto-checkout] forced checkout for employee ${r.employee_id}`
      );
    }
  } catch (e) {
    console.error('[auto-checkout] unexpected error:', e);
  }
}

// first run 10s after boot, then every 5 minutes
setTimeout(forceLongSessions, 10_000);
setInterval(forceLongSessions, AUTO_CHECK_INTERVAL_MS);

export default router;
