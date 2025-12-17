// routes/controlWorkers.js  — Supabase + Supabase Storage version
// --------------------------------------------------------------
// • GET /api/control-workers                -> list employees (id + name)
// • GET /api/control-workers/job-descriptions -> list JobDescription
// • GET /api/control-workers/:id           -> full nested employee details
// • PUT /api/control-workers/:id           -> update employee + child tables
//      - accepts multipart/form-data with `jsonData` + file fields
//      - uploads files to Supabase Storage (bucket: employee-files)
// • DELETE /api/control-workers/:id        -> delete employee + related rows

import express from 'express';
import multer from 'multer';
import path from 'path';
import supabase from '../supabase.js';


const router = express.Router();
const STORAGE_BUCKET = 'employee-files';

// Convert empty string -> null
function orNull(value) {
  return value === '' || value === undefined ? null : value;
}

// Multer in-memory storage (we upload buffers to Supabase Storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB per file
});

/* ----------------------------------------------------------------
 * helper: upload file to Supabase Storage and return public URL
 * ---------------------------------------------------------------- */
async function uploadToStorage(employeeId, file) {
  const ext = path.extname(file.originalname) || '';
  const baseName = path
    .basename(file.originalname, ext)
    .replace(/\s+/g, '_')
    .toLowerCase();
  const uniqueName = `${Date.now()}-${baseName}${ext}`;
  const filePathInBucket = `employee_${employeeId}/${uniqueName}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(filePathInBucket, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (uploadError) {
    console.error('Supabase Storage upload error:', uploadError);
    throw uploadError;
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(filePathInBucket);

  return publicUrl;
}

/* ----------------------------------------------------------------
 * GET /api/control-workers
 * Returns (employee_id, full_name) for dropdown
 * ---------------------------------------------------------------- */
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('employees')
      .select('employee_id, full_name')
      .order('full_name', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (error) {
    console.error('Error fetching employees:', error);
    res
      .status(500)
      .json({ error: 'Database error while fetching employees.' });
  }
});

/* ----------------------------------------------------------------
 * GET /api/control-workers/job-descriptions
 * Returns all job descriptions for dropdowns and auto-fill
 * ---------------------------------------------------------------- */
router.get('/job-descriptions', async (_req, res) => {
  try {
    const { data, error } = await supabase
      .from('jobdescription')
      .select('*')
      .order('department', { ascending: true });

    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    console.error('Error fetching job descriptions:', err);
    res.status(500).json({ error: 'Failed to fetch job descriptions' });
  }
});

/* ----------------------------------------------------------------
 * GET /api/control-workers/:id
 * Returns a single employee's nested details
 * ---------------------------------------------------------------- */
router.get('/:id', async (req, res) => {
  const employeeId = Number(req.params.id);

  if (Number.isNaN(employeeId)) {
    return res.status(400).json({ error: 'Invalid employee id.' });
  }

  try {
    const [
      { data: employee, error: empErr },
      { data: administration, error: adminErr },
      { data: contact, error: contactErr },
      { data: compensation, error: compErr },
      { data: workdetails, error: workErr },
      { data: academics, error: acadErr },
      { data: fitxatge, error: fitxErr },
      { data: baixes, error: baixErr },
    ] = await Promise.all([
      supabase
        .from('employees')
        .select('*')
        .eq('employee_id', employeeId)
        .maybeSingle(),
      supabase
        .from('administration')
        .select('*')
        .eq('employee_id', employeeId)
        .maybeSingle(),
      supabase
        .from('contact')
        .select('*')
        .eq('employee_id', employeeId)
        .maybeSingle(),
      supabase
        .from('compensation')
        .select('*')
        .eq('employee_id', employeeId)
        .maybeSingle(),
      supabase
        .from('workdetails')
        .select('*')
        .eq('employee_id', employeeId)
        .maybeSingle(),
      supabase
        .from('academics')
        .select('*')
        .eq('employee_id', employeeId)
        .maybeSingle(),
      supabase
        .from('fitxatge')
        .select('*')
        .eq('employee_id', employeeId),
      supabase
        .from('baixes')
        .select('*')
        .eq('employee_id', employeeId),
    ]);

    if (empErr) throw empErr;
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found.' });
    }
    if (adminErr) console.error(adminErr);
    if (contactErr) console.error(contactErr);
    if (compErr) console.error(compErr);
    if (workErr) console.error(workErr);
    if (acadErr) console.error(acadErr);
    if (fitxErr) console.error(fitxErr);
    if (baixErr) console.error(baixErr);

    let jobDescription = null;
    if (workdetails && workdetails.job_id) {
      const { data: job, error: jobErr } = await supabase
        .from('jobdescription')
        .select('*')
        .eq('job_id', workdetails.job_id)
        .maybeSingle();
      if (jobErr) {
        console.error('Error fetching JobDescription:', jobErr);
      } else {
        jobDescription = job;
      }
    }

    res.json({
      employee,
      administration,
      contact,
      compensation,
      workdetails,
      academics,
      jobDescription,
      fitxatge: fitxatge || [],
      baixes: baixes || [],
    });
  } catch (error) {
    console.error('Error fetching employee details:', error);
    res
      .status(500)
      .json({ error: 'Database error while fetching employee details.' });
  }
});

/* ----------------------------------------------------------------
 * PUT /api/control-workers/:id
 * multipart/form-data with:
 *  - jsonData: stringified JSON payload
 *  - files: employee[photo], administration[dni_nie_document], ...
 * ---------------------------------------------------------------- */
router.put('/:id', upload.any(), async (req, res) => {
  const employeeId = Number(req.params.id);

  if (Number.isNaN(employeeId)) {
    return res.status(400).json({ error: 'Invalid employee id.' });
  }

  // 1) parse jsonData
  let bodyData = {};
  if (req.body.jsonData) {
    try {
      bodyData = JSON.parse(req.body.jsonData);
    } catch (parseErr) {
      console.error('Error parsing jsonData:', parseErr);
      return res.status(400).json({ error: 'Invalid JSON data.' });
    }
  }

  console.log('FILES RECEIVED:', req.files?.map(f => f.fieldname));
  console.log('PARSED JSON DATA keys:', Object.keys(bodyData));

  const {
    employee = {},
    administration = {},
    contact = {},
    compensation = {},
    workdetails = {},
    academics = {},
    jobDescription = {},
    fitxatge = [],
    baixes = [],
    fitxatge_deleted = [],
    baixes_deleted = [],
  } = bodyData;

  try {
    // 2) Upload files to Supabase Storage and map URLs into objects
    for (const file of req.files || []) {
      let url;
      try {
        url = await uploadToStorage(employeeId, file);
      } catch (e) {
        console.error('Upload error for field', file.fieldname, e);
        continue;
      }

      const fieldName = file.fieldname;
      if (fieldName === 'employee[photo]') {
        employee.photo = url;
      } else if (fieldName === 'administration[dni_nie_document]') {
        administration.dni_nie_document = url;
      } else if (fieldName === 'administration[bank_account_document]') {
        administration.bank_account_document = url;
      } else if (fieldName === 'administration[social_security_document]') {
        administration.social_security_document = url;
      } else if (fieldName === 'academics[cv_document]') {
        academics.cv_document = url;
      } else if (fieldName === 'academics[certifications_document]') {
        academics.certifications_document = url;
      }
    }

    // 3) Ensure child rows exist (Administration, Contact, etc.)
    const childTables = [
      'administration',
      'contact',
      'compensation',
      'workdetails',
      'academics',
    ];
    for (const table of childTables) {
      const { data: existing, error: existErr } = await supabase
        .from(table)
        .select('employee_id')
        .eq('employee_id', employeeId)
        .maybeSingle();

      if (existErr) {
        console.error(`Error checking child table ${table}:`, existErr);
      }
      if (!existing) {
        const { error: insertErr } = await supabase
          .from(table)
          .insert([{ employee_id: employeeId }]);
        if (insertErr) {
          console.error(`Error inserting child row in ${table}:`, insertErr);
        }
      }
    }

    // 4) Prepare transformed values
    const dateOfBirth = orNull(employee.date_of_birth);
    const jobId = orNull(workdetails.job_id);
    const annualSalary = orNull(compensation.annual_salary);
    const workHours = orNull(compensation.work_hours);

    const supervisorValue = !!workdetails.Supervisor;

    const empresaVal = orNull(workdetails.empresa);
    const situationVal = orNull(workdetails.situation);
    const wContractType = orNull(workdetails.contract_type);
    const academicStudies = orNull(academics.studies);

    // ============== Employees =================
    {
      const { error } = await supabase
        .from('employees')
        .update({
          full_name: employee.full_name || '',
          date_of_birth: dateOfBirth,
          gender: employee.gender || '',
          pin_code: employee.pin_code || '',
          photo: employee.photo || null,
        })
        .eq('employee_id', employeeId);
      if (error) {
        console.error('Employees update error:', error);
      }
    }

    // ============== Administration =================
    {
      const { error } = await supabase
        .from('administration')
        .update({
          employment_status: administration.employment_status || '',
          dni_nie_document: administration.dni_nie_document || '',
          bank_account_document: administration.bank_account_document || '',
          social_security_document:
            administration.social_security_document || '',
          dni_nie_number: administration.dni_nie_number || '',
          bank_account_number: administration.bank_account_number || '',
          social_security_number: administration.social_security_number || '',
        })
        .eq('employee_id', employeeId);
      if (error) {
        console.error('Administration update error:', error);
      }
    }

    // ============== Contact =================
    {
      const { error } = await supabase
        .from('contact')
        .update({
          address: contact.address || '',
          phone_number: contact.phone_number || '',
          email_personal: contact.email_personal || '',
          email_corporate: contact.email_corporate || '',
          emergency_contact_name: contact.emergency_contact_name || '',
        })
        .eq('employee_id', employeeId);
      if (error) {
        console.error('Contact update error:', error);
      }
    }

    // ============== Compensation =================
    {
      const { error } = await supabase
        .from('compensation')
        .update({
          annual_salary: annualSalary,
          work_hours: workHours,
        })
        .eq('employee_id', employeeId);
      if (error) {
        console.error('Compensation update error:', error);
      }
    }

    // ============== WorkDetails =================
    {
      const { error } = await supabase
        .from('workdetails')
        .update({
          job_id: jobId,
          date_joined: orNull(workdetails.date_joined),
          contract_start_date: orNull(workdetails.contract_start_date),
          contract_end_date: orNull(workdetails.contract_end_date),
          Supervisor: supervisorValue,
          empresa: empresaVal,
          situation: situationVal,
          contract_type: wContractType,
        })
        .eq('employee_id', employeeId);
      if (error) {
        console.error('Workdetails update error:', error);
      }
    }

    // ============== Academics =================
    {
      const { error } = await supabase
        .from('academics')
        .update({
          cv_document: academics.cv_document || '',
          certifications_document:
            academics.certifications_document || '',
          studies: academicStudies || '',
        })
        .eq('employee_id', employeeId);
      if (error) {
        console.error('Academics update error:', error);
      }
    }

    // ============== JobDescription (optional) =================
    if (jobId && jobDescription) {
      if (jobDescription.department || jobDescription.job_title) {
        const { error } = await supabase
          .from('jobdescription')
          .update({
            department:
              jobDescription.department ?? null,
            job_title:
              jobDescription.job_title ?? null,
          })
          .eq('job_id', jobId);
        if (error) {
          console.error('JobDescription update error:', error);
        }
      }
    }

    // 5) Fitxatge deletions & upserts
    if (Array.isArray(fitxatge_deleted) && fitxatge_deleted.length > 0) {
      const { error } = await supabase
        .from('fitxatge')
        .delete()
        .in('id', fitxatge_deleted);
      if (error) {
        console.error('Fitxatge delete error:', error);
      }
    }

    if (Array.isArray(fitxatge)) {
      for (const record of fitxatge) {
        const payload = {
          id: record.id ?? undefined,
          Dia: orNull(record.Dia),
          Hora: orNull(record.Hora),
          employee_id: employeeId,
          Working: !!record.Working,
          Active: !!record.Active,
          Vacances: record.Vacances ?? 0,
        };

        const { error } = await supabase
          .from('fitxatge')
          .upsert(payload);
        if (error) {
          console.error('Fitxatge upsert error:', error);
        }
      }
    }

    // 6) Baixes deletions & upserts
    if (Array.isArray(baixes_deleted) && baixes_deleted.length > 0) {
      const { error } = await supabase
        .from('baixes')
        .delete()
        .in('id', baixes_deleted);
      if (error) {
        console.error('Baixes delete error:', error);
      }
    }

    if (Array.isArray(baixes)) {
      for (const record of baixes) {
        const payload = {
          id: record.id ?? undefined,
          employee_id: employeeId,
          Dia_Inici: orNull(record.Dia_Inici),
          Num_dias: record.Num_dias ?? 0,
          Type: record.Type || '',
          Return_Date: orNull(record.Return_Date),
          Reason: record.Reason || '',
          Approved: !!record.Approved,
        };

        const { error } = await supabase
          .from('baixes')
          .upsert(payload);
        if (error) {
          console.error('Baixes upsert error:', error);
        }
      }
    }

    return res.json({
      message:
        'Worker updated successfully (data + files via Supabase Storage).',
    });
  } catch (error) {
    console.error('🔥 controlWorkers update error:', error);
    return res.status(500).json({
      error: error.message || 'Unknown DB error during update.',
    });
  }
});

/* ----------------------------------------------------------------
 * DELETE /api/control-workers/:id
 * ---------------------------------------------------------------- */
router.delete('/:id', async (req, res) => {
  const employeeId = Number(req.params.id);

  if (Number.isNaN(employeeId)) {
    return res.status(400).json({ error: 'Invalid employee id.' });
  }

  try {
    // Delete child rows explicitly to avoid FK issues
    const tablesToDelete = [
      'fitxatge',
      'baixes',
      'administration',
      'contact',
      'compensation',
      'workdetails',
      'academics',
      'activities',
    ];

    for (const table of tablesToDelete) {
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('employee_id', employeeId);
      if (error) {
        console.error(`Error deleting from ${table}:`, error);
      }
    }

    const { error: empErr } = await supabase
      .from('employees')
      .delete()
      .eq('employee_id', employeeId);
    if (empErr) {
      console.error('Error deleting employee:', empErr);
      return res
        .status(500)
        .json({ error: 'Database error while deleting worker.' });
    }

    res.json({ message: 'Worker deleted successfully.' });
  } catch (error) {
    console.error('Error deleting worker:', error);
    res
      .status(500)
      .json({ error: 'Database error while deleting worker.' });
  }
});

export default router;
