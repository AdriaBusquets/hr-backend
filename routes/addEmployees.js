/**
 * routes/addEmployees.js  — Supabase + ES Modules Version
 * ------------------------------------------------------------
 * • Creates employee
 * • Generates unique 4-digit PIN
 * • Saves photo locally in /uploads (same as before)
 * • Creates blank rows in child tables
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import supabase from '../supabase.js';

const router = express.Router();

/* ------------------------------------------------------------ */
/*  Multer Temporary Upload Folder                               */
/* ------------------------------------------------------------ */
const uploadsRoot = path.join(process.cwd(), 'backend', 'uploads');
fs.mkdirSync(uploadsRoot, { recursive: true });

const tmpDir = path.join(uploadsRoot, 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });

const upload = multer({
  dest: tmpDir,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB photo limit
});

/* ------------------------------------------------------------ */
/*  Generate unique 4-digit PIN                                  */
/* ------------------------------------------------------------ */
async function generateUniquePin() {
  while (true) {
    const pin = (1000 + Math.floor(Math.random() * 9000)).toString();

    const { data, error } = await supabase
      .from('Employees')
      .select('pin_code')
      .eq('pin_code', pin)
      .maybeSingle();

    if (error) {
      console.error('PIN lookup error:', error);
      throw error;
    }

    if (!data) return pin; // unique!
  }
}

/* ------------------------------------------------------------ */
/*  POST /api/employees                                          */
/* ------------------------------------------------------------ */
router.post(
  '/',
  upload.single('employee_photo'),
  async (req, res) => {
    try {
      /* 0. Validate Request --------------------------------------- */
      const full_name     = req.body.employee_full_name?.trim();
      const date_of_birth = req.body.employee_date_of_birth;
      const gender        = req.body.employee_gender;

      if (!full_name || !date_of_birth || !gender) {
        return res.status(400).json({
          error: 'Required fields: employee_full_name, employee_date_of_birth, employee_gender.'
        });
      }

      /* 1. Generate PIN ------------------------------------------- */
      const pin = await generateUniquePin();

      /* 2. Insert Employee ---------------------------------------- */
      const { data: empData, error: empErr } = await supabase
        .from('Employees')
        .insert([
          {
            full_name,
            date_of_birth,
            gender,
            pin_code: pin,
            photo: null,
          }
        ])
        .select();

      if (empErr) {
        console.error('Employee insert error:', empErr);
        return res.status(500).json({ error: 'Failed to create employee.' });
      }

      const employee_id = empData[0].employee_id;

      /* 3. Save Photo Locally ------------------------------------- */
      if (req.file) {
        const empFolder = path.join(uploadsRoot, `employee_${employee_id}`);
        fs.mkdirSync(empFolder, { recursive: true });

        const ext = path.extname(req.file.originalname) || '.jpg';
        const finalPath = path.join(empFolder, `photo${ext}`);

        fs.renameSync(req.file.path, finalPath);

        const relativePath = `/uploads/employee_${employee_id}/photo${ext}`;

        // Save in DB
        const { error: photoErr } = await supabase
          .from('Employees')
          .update({ photo: relativePath })
          .eq('employee_id', employee_id);

        if (photoErr) {
          console.error('Photo update error:', photoErr);
        }
      }

      /* 4. Insert Blank Child Rows -------------------------------- */
      const childTables = [
        { table: 'Administration', payload: { employee_id, employment_status: '' } },
        { table: 'Contact',        payload: { employee_id } },
        { table: 'Compensation',   payload: { employee_id } },
        { table: 'WorkDetails',    payload: { employee_id, Supervisor: false } },
        { table: 'Academics',      payload: { employee_id } },
      ];

      for (const entry of childTables) {
        const { error } = await supabase.from(entry.table).insert([entry.payload]);
        if (error) {
          console.error(`Insert error in ${entry.table}:`, error);
        }
      }

      /* 5. Success ------------------------------------------------ */
      return res.status(201).json({
        message: 'Worker created successfully',
        employee_id,
        pin_code: pin,
      });

    } catch (err) {
      console.error('❌ addEmployees error:', err);
      return res.status(500).json({ error: 'Failed to add worker.' });
    }
  }
);

export default router;
