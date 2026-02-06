// routes/incidences.js  (Supabase + ESM version)
import express from 'express';
import dayjs from 'dayjs';
import supabase from '../supabase.js';

const router = express.Router();

/********************************************************************
 * POST /api/incidences
 * Create a new incidence for an employee using their PIN code
 *******************************************************************/
router.post('/', async (req, res) => {
  const { pinCode, incidenceType, description } = req.body;

  if (!pinCode || !incidenceType) {
    return res.status(400).json({ error: 'Missing pinCode or incidenceType.' });
  }

  // 1) Find employee by pin_code
  const { data: employee, error: empErr } = await supabase
    .from('employees')
    .select('employee_id')
    .eq('pin_code', pinCode)
    .single();

  if (empErr || !employee) {
    return res.status(404).json({ error: 'Invalid PIN code.' });
  }

  // 2) Insert new incidence
  const today = dayjs().format('YYYY-MM-DD');

  const { error: insertErr } = await supabase
    .from('incidences')
    .insert({
      worker_id: employee.employee_id,
      incidence_type: incidenceType,
      description: description || null,
      InstanceStatus: 'Open',
      date_created: today,
      date_resolved: null
    });

  if (insertErr) {
    console.error('Insert incidence error:', insertErr);
    return res.status(500).json({ error: 'Failed to create incidence.' });
  }

  res.json({ message: 'Incidence recorded successfully.' });
});

/********************************************************************
 * GET /api/incidences  (optional filter: job_id or department)
 *******************************************************************/
router.get('/', async (req, res) => {
  const { job_id, department } = req.query;

  let query = supabase
    .from('incidences')
    .select(`
      incidence_id,
      incidence_type,
      description,
      InstanceStatus,
      date_created,
      date_resolved,
      employees!worker_id (
        employee_id,
        full_name,
        workdetails (
          job_id,
          jobdescription (
            job_title,
            department
          )
        )
      )
    `)
    .neq('InstanceStatus', 'Completed');

  if (job_id) {
    query = query.eq('employees.workdetails.job_id', job_id);
  }

  const { data, error } = await query.order('date_created', { ascending: false });

  if (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to fetch incidences.' });
  }

  let cleaned = data.map(i => ({
    incidence_id: i.incidence_id,
    incidence_type: i.incidence_type,
    InstanceStatus: i.InstanceStatus,
    description: i.description,
    date_created: i.date_created,
    date_resolved: i.date_resolved,
    full_name: i.employees.full_name,
    job_title: i.employees.workdetails?.jobdescription?.job_title || null,
    job_id: i.employees.workdetails?.job_id || null,
    department: i.employees.workdetails?.jobdescription?.department || null
  }));

  // If department filter is provided, filter incidences by department
  if (department) {
    cleaned = cleaned.filter(i => i.department === department);
  }

  res.json(cleaned);
});

/********************************************************************
 * GET /api/incidences/job-ids
 *******************************************************************/
router.get('/job-ids', async (_req, res) => {
  const { data, error } = await supabase
    .from('jobdescription')
    .select('job_id, job_title')
    .order('job_id');

  if (error) {
    return res.status(500).json({ error: 'Failed to load job list.' });
  }

  res.json(data);
});

/********************************************************************
 * PUT /api/incidences/complete/:id
 *******************************************************************/
router.put('/complete/:id', async (req, res) => {
  const { id } = req.params;

  const today = dayjs().format('YYYY-MM-DD');

  const { error } = await supabase
    .from('incidences')
    .update({
      InstanceStatus: 'Completed',
      date_resolved: today
    })
    .eq('incidence_id', id);

  if (error) {
    console.error('Complete incidence error:', error);
    return res.status(500).json({ error: 'Failed to mark as completed.' });
  }

  res.json({ message: `Incidence ${id} marked as completed.` });
});

export default router;
