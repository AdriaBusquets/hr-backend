import express from 'express';
import supabase from '../supabase.js';

const router = express.Router();

/**
 * IMPORTANT:
 * Your Supabase tables are lowercase (Postgres default unless quoted).
 * Fixes applied:
 * - JobDescription  -> jobdescription
 * - WorkDetails     -> workdetails
 * - Relationship/embedding names updated accordingly
 * - DELETE check uses jobdescription relation via job_id (more reliable than nested filter)
 */

/* ------------------------------------------------------------------ */
/* GET /api/departments - Get all unique departments                 */
/* ------------------------------------------------------------------ */
router.get('/', async (_req, res) => {
  try {
    console.log('📢 GET /api/departments called');

    const { data, error } = await supabase
      .from('jobdescription')
      .select('department')
      .not('department', 'is', null)
      .order('department', { ascending: true });

    if (error) {
      console.error('❌ Error fetching departments:', error);
      return res.status(500).json({ error: 'Failed to fetch departments.' });
    }

    const uniqueDepartments = [
      ...new Set((data || []).map((d) => (d?.department ?? '').trim())),
    ].filter((d) => d !== '');

    return res.json({ departments: uniqueDepartments });
  } catch (err) {
    console.error('❌ /api/departments failed:', err);
    return res.status(500).json({ error: 'Failed to fetch departments.' });
  }
});

/* ------------------------------------------------------------------ */
/* POST /api/departments - Add a new department                      */
/* ------------------------------------------------------------------ */
router.post('/', async (req, res) => {
  try {
    const { departmentName } = req.body;

    if (!departmentName || String(departmentName).trim() === '') {
      return res.status(400).json({ error: 'Department name is required.' });
    }

    const dept = String(departmentName).trim();
    console.log(`📢 POST /api/departments - Adding: ${dept}`);

    // Check if department already exists
    const { data: existingDepts, error: checkError } = await supabase
      .from('jobdescription')
      .select('department')
      .eq('department', dept)
      .limit(1);

    if (checkError) {
      console.error('❌ Error checking department:', checkError);
      return res.status(500).json({ error: 'Failed to check department.' });
    }

    if (existingDepts && existingDepts.length > 0) {
      return res.status(400).json({ error: 'Department already exists.' });
    }

    // Create a placeholder job description entry for the new department
    const { data: newDept, error: insertError } = await supabase
      .from('jobdescription')
      .insert([
        {
          job_title: `General - ${dept}`,
          department: dept,
          job_description: '',
          job_requirements: '',
          job_qualifications: '',
        },
      ])
      .select();

    if (insertError) {
      console.error('❌ Error creating department:', insertError);
      return res.status(500).json({ error: 'Failed to create department.' });
    }

    return res.status(201).json({
      message: 'Department created successfully.',
      department: dept,
      // optional: return created row for debugging
      created: newDept?.[0] ?? null,
    });
  } catch (err) {
    console.error('❌ POST /api/departments failed:', err);
    return res.status(500).json({ error: 'Failed to create department.' });
  }
});

/* ------------------------------------------------------------------ */
/* PUT /api/departments/:oldName - Rename a department               */
/* ------------------------------------------------------------------ */
router.put('/:oldName', async (req, res) => {
  try {
    const { oldName } = req.params;
    const { newName } = req.body;

    if (!newName || String(newName).trim() === '') {
      return res.status(400).json({ error: 'New department name is required.' });
    }

    const oldDept = String(oldName || '').trim();
    const newDept = String(newName).trim();

    console.log(`📢 PUT /api/departments - Renaming: ${oldDept} → ${newDept}`);

    // Prevent renaming into an existing department name
    const { data: exists, error: existsError } = await supabase
      .from('jobdescription')
      .select('department')
      .eq('department', newDept)
      .limit(1);

    if (existsError) {
      console.error('❌ Error checking new department name:', existsError);
      return res.status(500).json({ error: 'Failed to validate new department name.' });
    }
    if (exists && exists.length > 0) {
      return res.status(400).json({ error: 'A department with the new name already exists.' });
    }

    // Update all job descriptions with this department
    const { data, error } = await supabase
      .from('jobdescription')
      .update({ department: newDept })
      .eq('department', oldDept)
      .select();

    if (error) {
      console.error('❌ Error renaming department:', error);
      return res.status(500).json({ error: 'Failed to rename department.' });
    }

    return res.json({
      message: 'Department renamed successfully.',
      oldName: oldDept,
      newName: newDept,
      updatedRows: (data || []).length,
    });
  } catch (err) {
    console.error('❌ PUT /api/departments failed:', err);
    return res.status(500).json({ error: 'Failed to rename department.' });
  }
});

/* ------------------------------------------------------------------ */
/* DELETE /api/departments/:name - Delete a department               */
/* ------------------------------------------------------------------ */
router.delete('/:name', async (req, res) => {
  try {
    const dept = String(req.params.name || '').trim();

    console.log(`📢 DELETE /api/departments - Deleting: ${dept}`);

    if (!dept) {
      return res.status(400).json({ error: 'Department name is required.' });
    }

    // 1) Find a job_id that belongs to this department
    const { data: jobs, error: jobsError } = await supabase
      .from('jobdescription')
      .select('job_id')
      .eq('department', dept)
      .limit(1);

    if (jobsError) {
      console.error('❌ Error loading department job ids:', jobsError);
      return res.status(500).json({ error: 'Failed to check department usage.' });
    }

    const sampleJobId = jobs?.[0]?.job_id ?? null;

    // If the department has no jobdescription rows, it's safe to delete (nothing to delete)
    if (!sampleJobId) {
      return res.json({ message: 'Department deleted successfully (no rows existed).' });
    }

    // 2) Check if any workers are assigned to any job in this department
    //    We do a safe check:
    //    - Pull all job_ids for this department (limited) and see if any workdetails row matches.
    const { data: jobIds, error: jobIdsError } = await supabase
      .from('jobdescription')
      .select('job_id')
      .eq('department', dept);

    if (jobIdsError) {
      console.error('❌ Error loading department job ids (all):', jobIdsError);
      return res.status(500).json({ error: 'Failed to check department usage.' });
    }

    const ids = (jobIds || []).map((j) => j.job_id).filter((x) => x !== null && x !== undefined);

    if (ids.length > 0) {
      const { data: assigned, error: assignedError } = await supabase
        .from('workdetails')
        .select('work_id, job_id')
        .in('job_id', ids)
        .limit(1);

      if (assignedError) {
        console.error('❌ Error checking department usage in workdetails:', assignedError);
        return res.status(500).json({ error: 'Failed to check department usage.' });
      }

      if (assigned && assigned.length > 0) {
        return res.status(400).json({
          error:
            'Cannot delete department with assigned employees. Please reassign employees first.',
        });
      }
    }

    // 3) Delete all jobdescription rows for that department
    const { error: deleteError } = await supabase
      .from('jobdescription')
      .delete()
      .eq('department', dept);

    if (deleteError) {
      console.error('❌ Error deleting department:', deleteError);
      return res.status(500).json({ error: 'Failed to delete department.' });
    }

    return res.json({ message: 'Department deleted successfully.' });
  } catch (err) {
    console.error('❌ DELETE /api/departments failed:', err);
    return res.status(500).json({ error: 'Failed to delete department.' });
  }
});

export default router;
