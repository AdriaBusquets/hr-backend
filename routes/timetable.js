// routes/timetable.js
// --------------------------------------------------------------
// • GET  /api/timetable/active          -> get active (max week_id) timetable
// • POST /api/timetable/upload          -> parse & save pasted Excel timetable
// • GET  /api/timetable/week/:week_id   -> get timetable for specific week
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
    // Get max week_id
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

  // ---- 1) Parse the pasted Excel text ----
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

  // Days are columns 3..9 (LUNES, MARTES, MIERCOLES, JUEVES, VIERNES, SABADO, DOMINGO)
  // but we read them from the header row dynamically
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

  // Try to find a match where the department name contains the pasted dept or vice versa
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
  // Structure: each employee occupies 2 consecutive rows (MAÑANA + TARDE)
  // Row pattern: [NAME, PHONE, MAÑANA/TARDE, col3..colN]
  // Name is only in the first of the 2 rows
  const parsedEmployees = [];
  let i = 1; // skip header row

  while (i < lines.length) {
    const row = lines[i];
    const nextRow = lines[i + 1];

    const nameCellCurrent = (row[0] || '').trim();
    const shiftCurrent = (row[2] || '').trim().toUpperCase();

    // Skip empty rows
    if (!nameCellCurrent && !shiftCurrent) { i++; continue; }

    // Employee name can be in current row or previous context
    const employeeName = nameCellCurrent;
    if (!employeeName) { i++; continue; }

    // MAÑANA row
    const mañanaHours = {};
    if (shiftCurrent === 'MAÑANA' || shiftCurrent === 'MANANA') {
      days.forEach(({ col, name }) => {
        mañanaHours[name] = row[col] || '';
      });
    }

    // TARDE row (next row, no name)
    const tardeHours = {};
    if (nextRow) {
      const shiftNext = (nextRow[2] || '').trim().toUpperCase();
      if (shiftNext === 'TARDE') {
        days.forEach(({ col, name }) => {
          tardeHours[name] = nextRow[col] || '';
        });
        i += 2; // consumed both rows
      } else {
        i++;
      }
    } else {
      i++;
    }

    parsedEmployees.push({ name: employeeName, mañanaHours, tardeHours });
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

  // If overwriting current week, delete existing rows first
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
      // MAÑANA
      rowsToInsert.push({
        employee_id: emp.employee_id,
        week_id: targetWeekId,
        day_of_week: dayName,
        shift: 'MAÑANA',
        hours: emp.mañanaHours[dayName] || null,
      });
      // TARDE
      rowsToInsert.push({
        employee_id: emp.employee_id,
        week_id: targetWeekId,
        day_of_week: dayName,
        shift: 'TARDE',
        hours: emp.tardeHours[dayName] || null,
      });
    }
  }

  const { error: insertErr } = await supabase
    .from('timetable')
    .insert(rowsToInsert);

  if (insertErr) {
    console.error('Timetable insert error:', insertErr);
    return res.status(500).json({ error: 'Failed to save timetable to database.' });
  }

  return res.json({
    message: `Timetable saved successfully as week ${targetWeekId}.`,
    week_id: targetWeekId,
    employees_saved: resolved.length,
    rows_inserted: rowsToInsert.length,
  });
});

export default router;