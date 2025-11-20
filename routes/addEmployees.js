/**
 * routes/addEmployees.js  — Supabase Version
 * ------------------------------------------------------------
 * • inserts an employee
 * • generates a unique 4-digit PIN using Supabase
 * • uploads photo to local /uploads (same behavior as before)
 * • inserts empty rows in Administration, Contact, Compensation,
 *   WorkDetails, Academics
 */

import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { supabase } from '../supabase.js';

const router = express.Router();

/* ---------- Multer temp folder ------------------------------ */
const tmpDir = path.join(process.cwd(), 'backend', 'uploads', 'tmp');
fs.mkdirSync(tmpDir, { recursive: true });

const upload = multer({
  dest: tmpDir,
  limits: { fileSize: 10 * 1024 * 1024 }
});

/* ---------- helper: unique 4-digit PIN ----------------------- */
async function generateUniquePin() {
  while (true) {
    const pin = (1000 + Math.floor(Math.random() * 9000)).toString();

    const { data, error } = await supabase
      .from('Employees')
      .select('pin_code')
      .eq('pin_code', pin)
      .maybeSingle();

    if (error) {
      console.error('PIN check error:', error);
      throw error;
    }

    if (!data) return pin; // unique
  }
}

/* ---------- POST /api/employees ------------------------------ */
router.post(
  '/',
  upload.single('employee_photo'),
  async (req, res) => {
    try {
      /* 0. validate input -------------------------------------------- */
      const full_name     = req.body.employee_full_name?.trim();
      const date_of_birth = req.body.employee_date_of_birth;
      const gender        = req.body.employee_gender;

      if (!full_name || !date_of_birth || !gender) {
        return res.status(400).json({
          error: 'Required: employee_full_name, employee_date_of_birth, employee_gender.'
        });
      }

      /* 1. generate PIN --------------------------------------------- */
      const pin = await generateUniquePin();

      /* 2. Insert employee ------------------------------------------ */
      const { data: empData, error: empErr } = await supabase
        .from('Employees')
        .insert([
          {
            full_name,
            date_of_birth,
            gender,
            pin_code: pin,
            photo: null
          }
        ])
        .select();

      if (empErr) {
        console.error('Employee insert error:', empErr);
        return res.status(500).json({ error: 'Failed to create employee.' });
      }

      const employee_id = empData[0].employee_id;

      /* 3. Save photo locally (same logic as before) ---------------- */
      if (req.file) {
        const empDir = path.join(process.cwd(), 'backend', 'uploads', `employee_${employee_id}`);
        fs.mkdirSync(empDir, { recursive: true });

        const ext = path.extname(req.file.originalname) || '.jpg';
        const newPath = path.join(empDir, `photo${ext}`);

        fs.renameSync(req.file.path, newPath);

        const relativePath = `/uploads/employee_${employee_id}/photo${ext}`;

        /* Update Supabase ----------------------------------------- */
        const { error: photoErr } = await supabase
          .from('Employees')
          .update({ photo: relativePath })
          .eq('employee_id', employee_id);

        if (photoErr) {
          console.error('Photo update error:', photoErr);
        }
      }

      /* 4. Insert blank child rows ---------------------------------- */
      const inserts = [
        { table: 'Administration', payload: { employee_id, employment_status: '' } },
        { table: 'Contact',        payload: { employee_id } },
        { table: 'Compensation',   payload: { employee_id } },
        { table: 'WorkDetails',    payload: { employee_id, Supervisor: false } },
        { table: 'Academics',      payload: { employee_id } }
      ];

      for (const item of inserts) {
        const { error } = await supabase
          .from(item.table)
          .insert([item.payload]);

        if (error) {
          console.error(`Insert into ${item.table} failed:`, error);
        }
      }

      /* 5. respond -------------------------------------------------- */
      return res.status(201).json({
        message: 'Worker created',
        employee_id,
        pin_code: pin
      });
    } catch (err) {
      console.error('❌ addEmployees Supabase error:', err);
      return res.status(500).json({ error: 'Failed to add worker.' });
    }
  }
);

export default router;
