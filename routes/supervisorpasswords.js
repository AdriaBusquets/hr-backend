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

  // Query structure: workdetails → employees + jobdescription
  const { data, error } = await supabase
    .from('workdetails')
    .select(`
      supervisor,
      employees (
        full_name,
        pin_code
      ),
      jobdescription (
        department
      )
    `)
    .eq('supervisor', true);

  if (error) {
    console.error('Supabase error fetching supervisors:', error);
    return res.status(500).json({ error: 'Failed to fetch supervisors' });
  }

  // Flatten and filter by the requested department in JS (avoids alias-based PostgREST filter issues)
  const supervisors = (data || [])
    .filter(row => row.jobdescription?.department === department)
    .map(row => ({
      full_name: row.employees?.full_name,
      pin_code: row.employees?.pin_code,
      department: row.jobdescription?.department,
    }))
    .filter(s => s.full_name && s.pin_code);

  res.json(supervisors);
});

export default router;
