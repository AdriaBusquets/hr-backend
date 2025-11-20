// routes/employees.js  — Supabase version (ES modules)
import express from 'express';
const supabase = require('../supabase');


const router = express.Router();

/* --------------------------------------------------------------------- */
/* GET /api/employees  (optional ?name= filter)                          */
/* --------------------------------------------------------------------- */
router.get('/', async (req, res) => {
  const { name } = req.query;

  try {
    let query = supabase.from('Employees').select('*');

    if (name) {
      query = query.ilike('full_name', `%${name}%`);
    }

    query = query.order('full_name', { ascending: true });

    const { data, error } = await query;
    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({ error: 'Failed to fetch employees.' });
  }
});

/* --------------------------------------------------------------------- */
/* GET /api/employees/:id                                                */
/* --------------------------------------------------------------------- */
router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);

  const { data, error } = await supabase
    .from('Employees')
    .select('*')
    .eq('employee_id', id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching employee:', error);
    return res.status(500).json({ error: 'Failed to fetch employee.' });
  }

  if (!data) return res.status(404).json({ error: 'Employee not found.' });

  res.json(data);
});

/* --------------------------------------------------------------------- */
/* POST /api/employees  (create employee)                                */
/* --------------------------------------------------------------------- */
router.post('/', async (req, res) => {
  const { full_name, date_of_birth, gender, photo = '', pin_code } = req.body;

  if (!full_name || !date_of_birth || !gender || !pin_code) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const { data, error } = await supabase
    .from('Employees')
    .insert([
      { full_name, date_of_birth, gender, photo, pin_code }
    ])
    .select('employee_id')
    .maybeSingle();

  if (error) {
    console.error('Error inserting employee:', error);
    return res.status(500).json({ error: 'Failed to create employee.' });
  }

  res.json({ message: 'Employee created.', employee_id: data.employee_id });
});

/* --------------------------------------------------------------------- */
/* PUT /api/employees/:id  (update)                                      */
/* --------------------------------------------------------------------- */
router.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const { full_name, date_of_birth, gender, photo = '', pin_code } = req.body;

  if (!full_name || !date_of_birth || !gender || !pin_code) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const { error, data } = await supabase
    .from('Employees')
    .update({
      full_name,
      date_of_birth,
      gender,
      photo,
      pin_code
    })
    .eq('employee_id', id)
    .select();

  if (error) {
    console.error('Error updating employee:', error);
    return res.status(500).json({ error: 'Failed to update employee.' });
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: 'Employee not found or no changes made.' });
  }

  res.json({ message: 'Employee updated.' });
});

/* --------------------------------------------------------------------- */
/* DELETE /api/employees/:id                                             */
/* --------------------------------------------------------------------- */
router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);

  const { error, count } = await supabase
    .from('Employees')
    .delete()
    .eq('employee_id', id);

  if (error) {
    console.error('Error deleting employee:', error);
    return res.status(500).json({ error: 'Failed to delete employee.' });
  }

  res.json({ message: 'Employee deleted.' });
});

/* --------------------------------------------------------------------- */
/* GET /api/employees/hours/:employee_id                                 */
/* (uses RPC function get_employee_daily_hours)                           */
/* --------------------------------------------------------------------- */
router.get('/hours/:employee_id', async (req, res) => {
  const employee_id = Number(req.params.employee_id);

  if (Number.isNaN(employee_id)) {
    return res.status(400).json({ error: 'Invalid employee ID.' });
  }

  const { data, error } = await supabase.rpc(
    'get_employee_daily_hours',
    { emp_id: employee_id }
  );

  if (error) {
    console.error('Error fetching employee hours:', error);
    return res.status(500).json({ error: 'Failed to fetch employee hours.' });
  }

  res.json(data || []);
});

export default router;
