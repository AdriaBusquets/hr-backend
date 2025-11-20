// routes/info.js  (Supabase + ESM)
import express from 'express';
import supabase from '../supabase.js';

const router = express.Router();

/**************************************************************
 * 1) GET /api/info/tables
 * Supabase cannot list tables → we return a known list
 **************************************************************/
router.get('/tables', (_req, res) => {
  const tables = [
    'employees',
    'administration',
    'academics',
    'contact',
    'compensation',
    'workdetails',
    'fitxatge',
    'baixes',
    'incidences',
    'activities',
    'jobdescription'
  ];
  res.json(tables);
});

/**************************************************************
 * 2) GET /api/info/table/:tableName
 * Fetch all rows from a known table
 **************************************************************/
router.get('/table/:tableName', async (req, res) => {
  const { tableName } = req.params;

  const allowedTables = [
    'employees', 'administration', 'academics', 'contact', 'compensation',
    'workdetails', 'fitxatge', 'baixes', 'incidences',
    'activities', 'jobdescription'
  ];

  if (!allowedTables.includes(tableName)) {
    return res.status(400).json({ error: 'Invalid or unauthorized table name.' });
  }

  const { data, error } = await supabase
    .from(tableName)
    .select('*');

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load table data.' });
  }

  res.json(data);
});

/**************************************************************
 * 3) GET /api/info/employees
 * Return all employee names (full_name)
 **************************************************************/
router.get('/employees', async (_req, res) => {
  const { data, error } = await supabase
    .from('employees')
    .select('full_name')
    .order('full_name');

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load employee list.' });
  }

  res.json(data.map(e => e.full_name));
});

/**************************************************************
 * 4) GET /api/info/table/:tableName/:employeeName
 * Return table data filtered by employee name
 **************************************************************/
router.get('/table/:tableName/:employeeName', async (req, res) => {
  const { tableName, employeeName } = req.params;

  const allowedTables = [
    'administration', 'academics', 'contact', 'compensation',
    'workdetails', 'fitxatge', 'baixes', 'incidences', 'activities'
  ];

  if (!allowedTables.includes(tableName)) {
    return res.status(400).json({ error: 'Invalid or unauthorized table name.' });
  }

  // 1) find employee_id
  const { data: emp, error: empErr } = await supabase
    .from('employees')
    .select('employee_id')
    .eq('full_name', employeeName)
    .single();

  if (empErr || !emp) {
    return res.status(404).json({ error: 'Employee not found.' });
  }

  // 2) fetch filtered table data
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .eq('employee_id', emp.employee_id);

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load filtered data.' });
  }

  res.json(data);
});

export default router;
