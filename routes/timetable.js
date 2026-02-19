// routes/timetable.js
// --------------------------------------------------------------
// • GET  /api/timetable/active            -> get active (max week_id) timetable
// • GET  /api/timetable/dept/:department  -> get active timetable for a department
// • GET  /api/timetable/week/:week_id     -> get timetable for specific week
// • POST /api/timetable/upload            -> parse & save pasted Excel timetable
// --------------------------------------------------------------

import express from 'express';
import supabase from '../supabase.js';

const router = express.Router();

/* ----------------------------------------------------------------
 * GET /api/timetable/active
 * Returns the timetable rows for the highest week_id
 * ---------------------------------------------------------------- */
router.get('/active', async (_req, res) => {
  try {
    const { data: maxData, error: maxErr } = await supabase
      .from('timetable')
      .select('week_id')
      .order('week_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxErr) throw maxErr;
    if (!maxData) return res.json({ week_id: null, rows: [] });

    const { data, error } = await supabase
      .from('timetable')
      .select(`
        timetable_id,
        week_id,
        day_of_week,
        shift,
        hours,
        employee_id,
        employees (full_name)
      `)
      .eq('week_id', maxData.week_id)
      .order('employee_id')
      .order('day_of_week')
      .order('shift');

    if (error) throw error;
    res.json({ week_id: maxData.week_id, rows: data || [] });
  } catch (err) {
    console.error('Error fetching active timetable:', err);
    res.status(500).json({ error: 'Failed to fetch active timetable.' });
  }
});

/* ----------------------------------------------------------------
 * GET /api/timetable/dept/:department
 * Returns the active (max week_id) timetable for a specific department
 * NOTE: Must be defined BEFORE /week/:week_id to avoid route conflicts
 * ---------------------------------------------------------------- */
router.get('/dept/:department', async (req, res) => {
  const department = decodeURIComponent(req.params.department);

  try {
    // 1) Find all employees in this department via jobdescription -> workdetails -> employees
    const { data: jobData, error: jobErr } = await supabase
      .from('jobdescription')
      .select('job_id')
      .ilike('department', department);

    if (jobErr) throw jobErr;
    if (!jobData || jobData.length === 0) {
      return res.status(404).json({ error: `Department "${department}" not found.` });
    }

    const jobIds = jobData.map(j => j.job_id);

    const { data: workData, error: workErr } = await supabase
      .from('workdetails')
      .select('employee_id')
      .in('job_id', jobIds);

    if (workErr) throw workErr;
    if (!workData || workData.length === 0) {
      return res.json({ week_id: null, employee_count: 0, rows: [] });
    }

    const employeeIds = workData.map(w => w.employee_id);

    // 2) Get max week_id for these employees
    const { data: maxData, error: maxErr } = await supabase
      .from('timetable')
      .select('week_id')
      .in('employee_id', employeeIds)
      .order('week_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxErr) throw maxErr;
    if (!maxData) {
      return res.json({ week_id: null, employee_count: employeeIds.length, rows: [] });
    }

    // 3) Fetch all timetable rows for these employees at the active week_id
    const { data: rows, error: rowsErr } = await supabase
      .from('timetable')
      .select(`
        timetable_id,
        week_id,
        day_of_week,
        shift,
        hours,
        employee_id,
        employees (full_name)
      `)
      .in('employee_id', employeeIds)
      .eq('week_id', maxData.week_id)
      .order('employee_id')
      .order('day_of_week')
      .order('shift');

    if (rowsErr) throw rowsErr;

    return res.json({
      week_id: maxData.week_id,
      employee_count: employeeIds.length,
      rows: rows || [],
    });
  } catch (err) {
    console.error('Error fetching department timetable:', err);
    res.status(500).json({ error: 'Failed to fetch department timetable.' });
  }
});

/* ----------------------------------------------------------------
 * GET /api/timetable/week/:week_id
 * Returns timetable rows for a specific week_id
 * ---------------------------------------------------------------- */
router.get('/week/:week_id', async (req, res) => {
  const weekId = Number(req.params.week_id);
  if (Number.isNaN(weekId)) return res.status(400).json({ error: 'Invalid week_id.' });

  try {
    const { data, error } = await supabase
      .from('timetable')
      .select(`
        timetable_id,
        week_id,
        day_of_week,
        shift,
        hours,
        employee_id,
        employees (full_name)
      `)
      .eq('week_id', weekId)
      .order('employee_id')
      .order('day_of_week')
      .order('shift');

    if (error) throw error;
    res.json({ week_id: weekId, rows: data || [] });
  } catch (err) {
    console.error('Error fetching timetable by week:', err);
    res.status(500).json({ error: 'Failed to fetch timetable.' });
  }
});

/* ----------------------------------------------------------------
 * POST /api/timetable/upload
 * Body: { pastedText: string, newWeek: boolean }
 *
 * pastedText: raw tab-separated text pasted from Excel
 * newWeek: if true, creates a new week_id (max + 1); otherwise overwrites max
 *
 * Validation rules:
 *  - Department name (top-left cell) must match a jobdescription.department (case-insensitive)
 *  - Each employee name must match an employees.full_name (case-insensitive)
 *  - Both must pass or the whole upload is rejected
 * ---------------------------------------------------------------- */
router.post('/upload', async (req, res) => {
  const { pastedText, newWeek = false } = req.body;

  if (!pastedText || typeof pastedText !== 'string') {
    return res.status(400).json({ error: 'pastedText is required.' });
  }

  function normalizeHours(value) {
    if (!value || value.trim() === '') return null;
    if (value.trim().toUpperCase() === 'F') return 'LIBRE';
    return value.trim();
  }

  try {
    const lines = pastedText
      .split('\n')
      .map(line => line.split('\t').map(cell => cell.trim()));

    if (lines.length < 2) {
      return res.status(400).json({ error: 'Not enough rows in pasted data.' });
    }

    // First row: department name is in cell [0][0], days start from col 3
    const headerRow = lines[0];
    const departmentRaw = headerRow[0] || '';
    const departmentNorm = departmentRaw.toLowerCase().trim();

    const days = [];
    for (let col = 3; col < headerRow.length; col++) {
      if (headerRow[col]) days.push({ col, name: headerRow[col].toUpperCase().trim() });
    }

    if (days.length === 0) {
      return res.status(400).json({ error: 'Could not detect day columns. Check the pasted format.' });
    }

    // ---- 2) Validate department ----
    const { data: deptData, error: deptErr } = await supabase
      .from('jobdescription')
      .select('department')
      .ilike('department', `%${departmentNorm}%`);

    if (deptErr) throw deptErr;

    const deptMatch = (deptData || []).find(d =>
      d.department.toLowerCase().includes(departmentNorm) ||
      departmentNorm.includes(d.department.toLowerCase())
    );

    if (!deptMatch) {
      return res.status(422).json({
        error: `Department "${departmentRaw}" not found in the database. Check spelling.`,
        field: 'department',
      });
    }

    // ---- 3) Parse employee rows ----
    const parsedEmployees = [];
    let i = 1;

    while (i < lines.length) {
      const row = lines[i];
      const nextRow = lines[i + 1];

      const nameCellCurrent = (row[0] || '').trim();
      const shiftCurrent = (row[2] || '').trim().toUpperCase();

      if (!nameCellCurrent && !shiftCurrent) { i++; continue; }
      if (!nameCellCurrent) { i++; continue; }

      const mañanaHours = {};
      if (shiftCurrent === 'MAÑANA' || shiftCurrent === 'MANANA') {
        days.forEach(({ col, name }) => { mañanaHours[name] = row[col] || ''; });
      }

      const tardeHours = {};
      if (nextRow) {
        const shiftNext = (nextRow[2] || '').trim().toUpperCase();
        if (shiftNext === 'TARDE') {
          days.forEach(({ col, name }) => { tardeHours[name] = nextRow[col] || ''; });
          i += 2;
        } else {
          i++;
        }
      } else {
        i++;
      }

      parsedEmployees.push({ name: nameCellCurrent, mañanaHours, tardeHours });
    }

    if (parsedEmployees.length === 0) {
      return res.status(422).json({ error: 'No employee rows detected in the pasted data.' });
    }

    // ---- 4) Validate all employee names against DB ----
    const { data: allEmployees, error: empErr } = await supabase
      .from('employees')
      .select('employee_id, full_name');

    if (empErr) throw empErr;

    const notFound = [];
    const resolved = [];

    for (const emp of parsedEmployees) {
      const nameNorm = emp.name.toLowerCase().trim();
      const match = (allEmployees || []).find(
        e => e.full_name.toLowerCase().trim() === nameNorm
      );
      if (!match) {
        notFound.push(emp.name);
      } else {
        resolved.push({ ...emp, employee_id: match.employee_id });
      }
    }

    if (notFound.length > 0) {
      return res.status(422).json({
        error: `The following employee names were not found in the database: ${notFound.join(', ')}. Names must match exactly (case-insensitive).`,
        field: 'employees',
        notFound,
      });
    }

    // ---- 5) Determine week_id ----
    const { data: maxWeekData, error: maxWeekErr } = await supabase
      .from('timetable')
      .select('week_id')
      .order('week_id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxWeekErr) throw maxWeekErr;

    const currentMaxWeekId = maxWeekData?.week_id ?? 0;
    const targetWeekId = newWeek ? currentMaxWeekId + 1 : (currentMaxWeekId || 1);

    if (!newWeek && currentMaxWeekId > 0) {
      const { error: delErr } = await supabase
        .from('timetable')
        .delete()
        .eq('week_id', targetWeekId);
      if (delErr) throw delErr;
    }

    // ---- 6) Build and insert rows ----
    const rowsToInsert = [];

    for (const emp of resolved) {
      for (const { name: dayName } of days) {
        rowsToInsert.push({
          employee_id: emp.employee_id,
          week_id: targetWeekId,
          day_of_week: dayName,
          shift: 'MAÑANA',
          hours: normalizeHours(emp.mañanaHours[dayName]),
        });
        rowsToInsert.push({
          employee_id: emp.employee_id,
          week_id: targetWeekId,
          day_of_week: dayName,
          shift: 'TARDE',
          hours: normalizeHours(emp.tardeHours[dayName]),
        });
      }
    }

    const { error: insertErr } = await supabase
      .from('timetable')
      .insert(rowsToInsert);

    if (insertErr) throw insertErr;

    return res.json({
      message: `Timetable saved successfully as week ${targetWeekId}.`,
      week_id: targetWeekId,
      employees_saved: resolved.length,
      rows_inserted: rowsToInsert.length,
    });
  } catch (err) {
    console.error('Timetable upload error:', err);
    return res.status(500).json({ error: 'Failed to save timetable to database.' });
  }
});

export default router;