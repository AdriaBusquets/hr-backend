import express from 'express';
import supabase from '../supabase.js';

const router = express.Router();

/* ------------------------------------------------------------------ */
/* GET /api/departments - Get all unique departments                 */
/* ------------------------------------------------------------------ */
router.get('/', async (_req, res) => {
  try {
    console.log("📢 GET /api/departments called");

    // Query distinct department names from JobDescription table
    const { data, error } = await supabase
      .from('JobDescription')
      .select('department')
      .not('department', 'is', null)
      .order('department', { ascending: true });

    if (error) {
      console.error("❌ Error fetching departments:", error);
      return res.status(500).json({ error: "Failed to fetch departments." });
    }

    // Extract unique department names
    const uniqueDepartments = [...new Set(data.map(d => d.department))].filter(d => d && d.trim() !== '');

    res.json({ departments: uniqueDepartments });
  } catch (err) {
    console.error("❌ /api/departments failed:", err);
    res.status(500).json({ error: "Failed to fetch departments." });
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/departments - Add a new department                      */
/* ------------------------------------------------------------------ */
router.post('/', async (req, res) => {
  try {
    const { departmentName } = req.body;

    if (!departmentName || departmentName.trim() === '') {
      return res.status(400).json({ error: "Department name is required." });
    }

    console.log(`📢 POST /api/departments - Adding: ${departmentName}`);

    // Check if department already exists
    const { data: existingDepts, error: checkError } = await supabase
      .from('JobDescription')
      .select('department')
      .eq('department', departmentName.trim())
      .limit(1);

    if (checkError) {
      console.error("❌ Error checking department:", checkError);
      return res.status(500).json({ error: "Failed to check department." });
    }

    if (existingDepts && existingDepts.length > 0) {
      return res.status(400).json({ error: "Department already exists." });
    }

    // Create a placeholder job description entry for the new department
    const { data: newDept, error: insertError } = await supabase
      .from('JobDescription')
      .insert([{
        job_title: `General - ${departmentName.trim()}`,
        department: departmentName.trim(),
        job_description: '',
        job_requirements: '',
        job_qualifications: ''
      }])
      .select();

    if (insertError) {
      console.error("❌ Error creating department:", insertError);
      return res.status(500).json({ error: "Failed to create department." });
    }

    res.status(201).json({
      message: "Department created successfully.",
      department: departmentName.trim()
    });
  } catch (err) {
    console.error("❌ POST /api/departments failed:", err);
    res.status(500).json({ error: "Failed to create department." });
  }
});

/* ------------------------------------------------------------------ */
/* PUT /api/departments/:oldName - Rename a department               */
/* ------------------------------------------------------------------ */
router.put('/:oldName', async (req, res) => {
  try {
    const { oldName } = req.params;
    const { newName } = req.body;

    if (!newName || newName.trim() === '') {
      return res.status(400).json({ error: "New department name is required." });
    }

    console.log(`📢 PUT /api/departments - Renaming: ${oldName} → ${newName}`);

    // Update all job descriptions with this department
    const { data, error } = await supabase
      .from('JobDescription')
      .update({ department: newName.trim() })
      .eq('department', oldName);

    if (error) {
      console.error("❌ Error renaming department:", error);
      return res.status(500).json({ error: "Failed to rename department." });
    }

    res.json({
      message: "Department renamed successfully.",
      oldName,
      newName: newName.trim()
    });
  } catch (err) {
    console.error("❌ PUT /api/departments failed:", err);
    res.status(500).json({ error: "Failed to rename department." });
  }
});

/* ------------------------------------------------------------------ */
/* DELETE /api/departments/:name - Delete a department               */
/* ------------------------------------------------------------------ */
router.delete('/:name', async (req, res) => {
  try {
    const { name } = req.params;

    console.log(`📢 DELETE /api/departments - Deleting: ${name}`);

    // Check if any employees are assigned to this department
    const { data: workDetails, error: checkError } = await supabase
      .from('WorkDetails')
      .select('work_id, job_id, JobDescription!inner(department)')
      .eq('JobDescription.department', name)
      .limit(1);

    if (checkError) {
      console.error("❌ Error checking department usage:", checkError);
      return res.status(500).json({ error: "Failed to check department usage." });
    }

    if (workDetails && workDetails.length > 0) {
      return res.status(400).json({
        error: "Cannot delete department with assigned employees. Please reassign employees first."
      });
    }

    // Delete all job descriptions with this department
    const { error: deleteError } = await supabase
      .from('JobDescription')
      .delete()
      .eq('department', name);

    if (deleteError) {
      console.error("❌ Error deleting department:", deleteError);
      return res.status(500).json({ error: "Failed to delete department." });
    }

    res.json({ message: "Department deleted successfully." });
  } catch (err) {
    console.error("❌ DELETE /api/departments failed:", err);
    res.status(500).json({ error: "Failed to delete department." });
  }
});

export default router;
