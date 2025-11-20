// routes/fitxatgeEditor.js — FINAL Supabase + ESM version
import express from 'express';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
import supabase from '../supabase.js';

dayjs.extend(isoWeek);

const router = express.Router();

/* --------------------------------------------------------------- */
/* Helpers                                                         */
/* --------------------------------------------------------------- */
function timeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const [hh, mm, ss] = timeStr.split(':').map(Number);
  return hh * 3600 + mm * 60 + ss;
}

function secondsToTime(totalSeconds) {
  const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const ss = String(totalSeconds % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/* --------------------------------------------------------------- */
/* Recompute hours for one employee                               */
/* --------------------------------------------------------------- */
async function recomputeHours(employeeId) {
  try {
    const { data: rows, error } = await supabase
      .from('fitxatge')
      .select('*')
      .eq('employee_id', employeeId)
      .order('dia', { ascending: true })
      .order('hora', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('Recompute fetch error:', error);
      return;
    }

    let runningDailySeconds = 0;
    let runningWeeklySeconds = 0;
    let runningMonthlySeconds = 0;

    let currentDay = null;
    let currentWeek = null;
    let currentMonth = null;

    let lastCheckInTime = null;

    for (const record of rows || []) {
      const rowDate = dayjs(record.dia);
      const rowDateTime = dayjs(`${record.dia} ${record.hora}`);

      // Day change
      if (!currentDay || !rowDate.isSame(currentDay, 'day')) {
        runningDailySeconds = 0;
        currentDay = rowDate;
      }

      // Week change (ISO week)
      const rowWeek = rowDate.isoWeek();
      if (currentWeek !== rowWeek) {
        runningWeeklySeconds = 0;
        currentWeek = rowWeek;
      }

      // Month change
      const rowMonth = rowDate.format('YYYY-MM');
      if (currentMonth !== rowMonth) {
        runningMonthlySeconds = 0;
        currentMonth = rowMonth;
      }

      if (record.working === true) {
        // CHECK-IN
        lastCheckInTime = rowDateTime;

        await supabase
          .from('fitxatge')
          .update({
            active: true,
            hores_diaries: '00:00:00',
            hores_setmanals: '00:00:00',
            hores_mensuals: '00:00:00',
          })
          .eq('id', record.id);
      } else {
        // CHECK-OUT
        let diffInSeconds = lastCheckInTime
          ? rowDateTime.diff(lastCheckInTime, 'second')
          : 0;

        if (diffInSeconds < 0) diffInSeconds = 0;

        runningDailySeconds += diffInSeconds;
        runningWeeklySeconds += diffInSeconds;
        runningMonthlySeconds += diffInSeconds;

        await supabase
          .from('fitxatge')
          .update({
            active: false,
            hores_diaries: secondsToTime(runningDailySeconds),
            hores_setmanals: secondsToTime(runningWeeklySeconds),
            hores_mensuals: secondsToTime(runningMonthlySeconds),
          })
          .eq('id', record.id);

        lastCheckInTime = null;
      }
    }
  } catch (err) {
    console.error('Recompute fatal error:', err);
  }
}

/* --------------------------------------------------------------- */
/* GET all rows for an employee                                    */
/* --------------------------------------------------------------- */
router.get('/editor/:employee_id', async (req, res) => {
  const employeeId = Number(req.params.employee_id);
  if (Number.isNaN(employeeId))
    return res.status(400).json({ error: 'Invalid employee_id.' });

  const { data, error } = await supabase
    .from('fitxatge')
    .select('*')
    .eq('employee_id', employeeId)
    .order('dia', { ascending: true })
    .order('hora', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error fetching Fitxatge.' });
  }

  res.json(data || []);
});

/* --------------------------------------------------------------- */
/* INSERT new record                                               */
/* --------------------------------------------------------------- */
router.post('/editor', async (req, res) => {
  const { employee_id, Dia, Hora, Working } = req.body;

  if (!employee_id || !Dia || !Hora || typeof Working === 'undefined') {
    return res.status(400).json({
      error: 'Missing required fields (employee_id, Dia, Hora, Working)',
    });
  }

  const { error } = await supabase.from('fitxatge').insert({
    dia: Dia,
    hora: Hora,
    employee_id: employee_id,
    working: !!Working,
    active: !!Working,
    hores_diaries: '00:00:00',
    hores_setmanals: '00:00:00',
    hores_mensuals: '00:00:00',
    vacances: 0,
  });

  if (error) {
    console.error('Insert error:', error);
    return res.status(500).json({ error: 'Insert failed.' });
  }

  await recomputeHours(employee_id);
  res.json({ message: 'Record inserted.' });
});

/* --------------------------------------------------------------- */
/* UPDATE record                                                   */
/* --------------------------------------------------------------- */
router.put('/editor/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { Dia, Hora, Working } = req.body;

  if (!Dia || !Hora || typeof Working === 'undefined') {
    return res.status(400).json({
      error: 'Missing required fields (Dia, Hora, Working)',
    });
  }

  const { data, error: findErr } = await supabase
    .from('fitxatge')
    .select('employee_id')
    .eq('id', id)
    .maybeSingle();

  if (findErr) {
    console.error(findErr);
    return res.status(500).json({ error: 'Find error.' });
  }

  if (!data) return res.status(404).json({ error: 'Record not found.' });

  const employeeId = data.employee_id;

  const { error: updErr } = await supabase
    .from('fitxatge')
    .update({
      dia: Dia,
      hora: Hora,
      working: !!Working,
    })
    .eq('id', id);

  if (updErr) {
    console.error(updErr);
    return res.status(500).json({ error: 'Update failed.' });
  }

  await recomputeHours(employeeId);
  res.json({ message: 'Record updated.' });
});

/* --------------------------------------------------------------- */
/* DELETE record                                                   */
/* --------------------------------------------------------------- */
router.delete('/editor/:id', async (req, res) => {
  const id = Number(req.params.id);

  const { data, error: findErr } = await supabase
    .from('fitxatge')
    .select('employee_id')
    .eq('id', id)
    .maybeSingle();

  if (findErr) {
    console.error(findErr);
    return res.status(500).json({ error: 'Find error.' });
  }

  if (!data) return res.status(404).json({ error: 'Record not found.' });

  const employeeId = data.employee_id;

  const { error: deleteErr } = await supabase
    .from('fitxatge')
    .delete()
    .eq('id', id);

  if (deleteErr) {
    console.error(deleteErr);
    return res.status(500).json({ error: 'Delete failed.' });
  }

  await recomputeHours(employeeId);
  res.json({ message: 'Record deleted.' });
});

export default router;
