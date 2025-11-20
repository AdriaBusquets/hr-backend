// routes/supervisorpasswords.js  (Supabase + ESM)
import express from 'express';
import supabase from '../supabase.js';

const router = express.Router();

/**
 * GET /api/control-workers/supervisors?department=Bar
 *
 * Returns:
 * [
 *   { full_name, pin_code, department }
 * ]
 */
router.get('/supervisors', async (req, res) => {
  const { department } = req.query;

  if (!department) {
    return res.status(400).json({ error: 'Missing department' });
  }

  // Query structure:
  // workdetails → employees → jobdescription
  const { data, error } = await supabase
    .from('workdetails')
    .select(`
      Supervisor,
      employees:Employees (
        full_name,
        pin_code
      ),
      job:JobDescription (
        department
      )
    `)
    .eq('Supervisor', true)
    .eq('job.department', department);

  if (error) {
    console.error('Supabase error fetching supervisors:', error);
    return res.status(500).json({ error: 'Failed to fetch supervisors' });
  }

  // Flatten the nested structure from Supabase
  const supervisors = (data || []).map(row => ({
    full_name: row.employees?.full_name,
    pin_code: row.employees?.pin_code,
    department: row.job?.department
  }));

  res.json(supervisors);
});

export default router;
