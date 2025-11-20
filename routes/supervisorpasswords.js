// routes/supervisorpasswords.js  (Supabase version)
const express = require('express');
const router = express.Router();
const supabase = require('../supabase');   // your Supabase client

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

  // Query:
  // employees → workdetails → jobdescription
  const { data, error } = await supabase
    .from('workdetails')
    .select(`
      Supervisor,
      Employees (
        full_name,
        pin_code
      ),
      JobDescription (
        department
      )
    `)
    .eq('Supervisor', true)
    .eq('JobDescription.department', department);

  if (error) {
    console.error('Supabase error fetching supervisors:', error);
    return res.status(500).json({ error: 'Failed to fetch supervisors' });
  }

  // Flatten & clean response
  const supervisors = (data || []).map(row => ({
    full_name: row.Employees.full_name,
    pin_code: row.Employees.pin_code,
    department: row.JobDescription.department
  }));

  res.json(supervisors);
});

module.exports = router;
