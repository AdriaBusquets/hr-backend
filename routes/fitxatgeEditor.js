// routes/fitxatgeEditor.js — Supabase version
import express from 'express';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek.js';
const supabase = require('../supabase');


dayjs.extend(isoWeek);

const router = express.Router();

// Helpers
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

/**
 * Recompute daily/weekly/monthly accumulations for a single employee.
 * Uses Supabase instead of SQLite.
 */
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
      console.error('Error fetching Fitxatge rows for recompute:', error);
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

      // Day change -> reset daily
      if (!currentDay || !rowDate.isSame(currentDay, 'day')) {
        runningDailySeconds = 0;
        currentDay = rowDate;
      }

      // Week change -> reset weekly (ISO week)
      const rowWeek = rowDate.isoWeek();
      if (!currentWeek || rowWeek !== currentWeek) {
        runningWeeklySeconds = 0;
        currentWeek = rowWeek;
      }

      // Month change -> reset monthly
      const rowMonthStr = rowDate.format('YYYY-MM');
      if (!currentMonth || rowMonthStr !== currentMonth) {
        runningMonthlySeconds = 0;
        currentMonth = rowMonthStr;
      }

      if (record.working === true) {
        // CHECK-IN
        lastCheckInTime = rowDateTime;

        const { error: updErr } = await supabase
          .from('fitxatge')
          .update({
            active: true,
            hores_diaries: '00:00:00',
            hores_setmanals: '00:00:00',
            hores_mensuals: '00:00:00',
          })
          .eq('id', record.id);

        if (updErr) {
          console.error(
            'Error updating check-in row during recompute:',
            updErr
          );
        }
      } else {
        // CHECK-OUT
        let diffInSeconds = 0;
        if (lastCheckInTime) {
          diffInSeconds = rowDateTime.diff(lastCheckInTime, 'second');
          if (diffInSeconds < 0) diffInSeconds = 0;
        }

        runningDailySeconds += diffInSeconds;
        runningWeeklySeconds += diffInSeconds;
        runningMonthlySeconds += diffInSeconds;

        const dailyStr = secondsToTime(runningDailySeconds);
        const weeklyStr = secondsToTime(runningWeeklySeconds);
        const monthlyStr = secondsToTime(runningMonthlySeconds);

        const { error: updErr } = await supabase
          .from('fitxatge')
          .update({
            active: false,
            hores_diaries: dailyStr,
            hores_setmanals: weeklyStr,
            hores_mensuals: monthlyStr,
          })
          .eq('id', record.id);

        if (updErr) {
          console.error(
            'Error updating check-out row during recompute:',
            updErr
          );
        }

        // After a check-out, clear last check-in
        lastCheckInTime = null;
      }
    }
  } catch (err) {
    console.error('recomputeHours unexpected error:', err);
  }
}

/* -------------------------------------------------- */
/*       REST Endpoints for Check-In/Out Editor       */
/* -------------------------------------------------- */

/**
 * GET /api/fitxatge-editor/editor/:employee_id
 * (exact base path depends on how you mount this router)
 */
router.get('/editor/:employee_id', async (req, res) => {
  const employeeId = Number(req.params.employee_id);
  if (Number.isNaN(employeeId)) {
    return res.status(400).json({ error: 'Invalid employee_id.' });
  }

  try {
    const { data, error } = await supabase
      .from('fitxatge')
      .select('*')
      .eq('employee_id', employeeId)
      .order('dia', { ascending: true })
      .order('hora', { ascending: true })
      .order('id', { ascending: true });

    if (error) {
      console.error('Error fetching Fitxatge for editor:', error);
      return res
        .status(500)
        .json({ error: 'Database error while fetching records.' });
    }

    res.json(data || []);
  } catch (err) {
    console.error('Error fetching Fitxatge for editor:', err);
    res
      .status(500)
      .json({ error: 'Database error while fetching records.' });
  }
});

/**
 * POST /api/fitxatge-editor/editor
 * Body: { employee_id, Dia, Hora, Working }
 */
router.post('/editor', async (req, res) => {
  const { employee_id, Dia, Hora, Working } = req.body;

  if (!employee_id || !Dia || !Hora || typeof Working === 'undefined') {
    return res
      .status(400)
      .json({ error: 'Missing required fields (employee_id, Dia, Hora, Working).' });
  }

  const employeeId = Number(employee_id);
  const working = !!Working;
  const activeValue = working;

  try {
    const { error: insertErr } = await supabase.from('fitxatge').insert([
      {
        dia: Dia,
        hora: Hora,
        employee_id: employeeId,
        working,
        active: activeValue,
        hores_diaries: '00:00:00',
        hores_setmanals: '00:00:00',
        hores_mensuals: '00:00:00',
        vacances: 0,
      },
    ]);

    if (insertErr) {
      console.error('Error inserting new Fitxatge:', insertErr);
      return res
        .status(500)
        .json({ error: 'Database error while inserting record.' });
    }

    await recomputeHours(employeeId);

    return res.json({ message: 'Record inserted successfully.' });
  } catch (err) {
    console.error('Error inserting new Fitxatge:', err);
    return res
      .status(500)
      .json({ error: 'Database error while inserting record.' });
  }
});

/**
 * PUT /api/fitxatge-editor/editor/:id
 * Body: { Dia, Hora, Working }
 */
router.put('/editor/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { Dia, Hora, Working } = req.body;

  if (!Dia || !Hora || typeof Working === 'undefined') {
    return res
      .status(400)
      .json({ error: 'Missing required fields (Dia, Hora, Working).' });
  }

  try {
    // find employee_id first
    const { data: row, error: findErr } = await supabase
      .from('fitxatge')
      .select('employee_id')
      .eq('id', id)
      .maybeSingle();

    if (findErr) {
      console.error('Error retrieving Fitxatge by ID:', findErr);
      return res
        .status(500)
        .json({ error: 'Database error while retrieving record.' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Record not found.' });
    }

    const employeeId = row.employee_id;
    const working = !!Working;

    const { error: updateErr } = await supabase
      .from('fitxatge')
      .update({
        dia: Dia,
        hora: Hora,
        working,
      })
      .eq('id', id);

    if (updateErr) {
      console.error('Error updating Fitxatge record:', updateErr);
      return res
        .status(500)
        .json({ error: 'Database error while updating record.' });
    }

    await recomputeHours(employeeId);

    return res.json({ message: 'Record updated successfully.' });
  } catch (err) {
    console.error('Error updating Fitxatge record:', err);
    return res
      .status(500)
      .json({ error: 'Database error while updating record.' });
  }
});

/**
 * DELETE /api/fitxatge-editor/editor/:id
 */
router.delete('/editor/:id', async (req, res) => {
  const id = Number(req.params.id);

  try {
    const { data: row, error: findErr } = await supabase
      .from('fitxatge')
      .select('employee_id')
      .eq('id', id)
      .maybeSingle();

    if (findErr) {
      console.error('Error retrieving Fitxatge for delete:', findErr);
      return res
        .status(500)
        .json({ error: 'Database error while retrieving record.' });
    }
    if (!row) {
      return res.status(404).json({ error: 'Record not found.' });
    }

    const employeeId = row.employee_id;

    const { error: deleteErr } = await supabase
      .from('fitxatge')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      console.error('Error deleting Fitxatge record:', deleteErr);
      return res
        .status(500)
        .json({ error: 'Database error while deleting record.' });
    }

    await recomputeHours(employeeId);

    return res.json({ message: 'Record deleted successfully.' });
  } catch (err) {
    console.error('Error deleting Fitxatge record:', err);
    return res
      .status(500)
      .json({ error: 'Database error while deleting record.' });
  }
});

export default router;
