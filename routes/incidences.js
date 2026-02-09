// routes/incidences.js  (Supabase + ESM version)
import express from 'express';
import dayjs from 'dayjs';
import supabase from '../supabase.js';

const router = express.Router();

/**
 * FIX APPLIED:
 * Your Postgres column is `instancestatus` (lowercase), NOT `InstanceStatus`.
 * We:
 * - write to `instancestatus` on INSERT/UPDATE
 * - read `instancestatus` in SELECT / filters
 * - still return `InstanceStatus` in the response JSON for frontend compatibility
 */

/********************************************************************
 * POST /api/incidences
 * Create a new incidence for an employee using their PIN code
 *******************************************************************/
router.post('/', async (req, res) => {
  try {
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

    const { error: insertErr } = await supabase.from('incidences').insert({
      worker_id: employee.employee_id,
      incidence_type: incidenceType,
      description: description || null,
      instancestatus: 'Open', // ✅ FIX
      date_created: today,
      date_resolved: null,
    });

    if (insertErr) {
      console.error('Insert incidence error:', insertErr);
      return res.status(500).json({ error: 'Failed to create incidence.' });
    }

    return res.json({ message: 'Incidence recorded successfully.' });
  } catch (err) {
    console.error('POST /api/incidences failed:', err);
    return res.status(500).json({ error: 'Failed to create incidence.' });
  }
});

/********************************************************************
 * GET /api/incidences  (optional filter: job_id or department)
 *******************************************************************/
router.get('/', async (req, res) => {
  try {
    const { job_id, department } = req.query;

    const { data, error } = await supabase
      .from('incidences')
      .select(
        `
        incidence_id,
        incidence_type,
        description,
        instancestatus,
        date_created,
        date_resolved,
        employees!incidences_worker_fk (
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
      `
      )
      .neq('instancestatus', 'Completed') // ✅ FIX
      .order('date_created', { ascending: false });

    if (error) {
      console.error('GET /api/incidences supabase error:', error);
      return res.status(500).json({ error: 'Failed to fetch incidences.' });
    }

    let cleaned = (data || []).map((i) => {
      const emp = i.employees || null;
      const wd = emp?.workdetails || null;

      // workdetails can be object or array depending on relationship; normalize to first row
      const wdRow = Array.isArray(wd) ? wd[0] : wd;

      const jd = wdRow?.jobdescription || null;
      const jdRow = Array.isArray(jd) ? jd[0] : jd;

      return {
        incidence_id: i.incidence_id,
        incidence_type: i.incidence_type,
        // ✅ Keep frontend compatibility (it expects InstanceStatus)
        InstanceStatus: i.instancestatus,
        description: i.description,
        date_created: i.date_created,
        date_resolved: i.date_resolved,
        full_name: emp?.full_name ?? null,
        job_title: jdRow?.job_title ?? null,
        job_id: wdRow?.job_id ?? null,
        department: jdRow?.department ?? null,
      };
    });

    // Optional filters (done in JS for reliability)
    if (job_id) {
      cleaned = cleaned.filter((i) => String(i.job_id ?? '') === String(job_id));
    }
    if (department) {
      cleaned = cleaned.filter((i) => i.department === department);
    }

    return res.json(cleaned);
  } catch (err) {
    console.error('GET /api/incidences failed:', err);
    return res.status(500).json({ error: 'Failed to fetch incidences.' });
  }
});

/********************************************************************
 * GET /api/incidences/job-ids
 *******************************************************************/
router.get('/job-ids', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('jobdescription')
      .select('job_id, job_title')
      .order('job_id');

    if (error) {
      console.error('GET /api/incidences/job-ids error:', error);
      return res.status(500).json({ error: 'Failed to load job list.' });
    }

    return res.json(data || []);
  } catch (err) {
    console.error('GET /api/incidences/job-ids failed:', err);
    return res.status(500).json({ error: 'Failed to load job list.' });
  }
});

/********************************************************************
 * PUT /api/incidences/complete/:id
 *******************************************************************/
router.put('/complete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const today = dayjs().format('YYYY-MM-DD');

    const { error } = await supabase
      .from('incidences')
      .update({
        instancestatus: 'Completed', // ✅ FIX
        date_resolved: today,
      })
      .eq('incidence_id', id);

    if (error) {
      console.error('Complete incidence error:', error);
      return res.status(500).json({ error: 'Failed to mark as completed.' });
    }

    return res.json({ message: `Incidence ${id} marked as completed.` });
  } catch (err) {
    console.error('PUT /api/incidences/complete failed:', err);
    return res.status(500).json({ error: 'Failed to mark as completed.' });
  }
});

export default router;
