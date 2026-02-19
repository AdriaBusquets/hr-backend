// routes/employees.js — Supabase ES module version
import express from "express";
import supabase from "../supabase.js";

const router = express.Router();

/* --------------------------------------------------------------------- */
/* GET /api/employees  (optional ?name= or ?department= filter)          */
/* --------------------------------------------------------------------- */
router.get("/", async (req, res) => {
  const { name, department } = req.query;

  try {
    let query = supabase
      .from("employees")
      .select(`
        *,
        workdetails (
          job_id,
          jobdescription (
            department
          )
        )
      `);

    if (name) {
      query = query.ilike("full_name", `%${name}%`);
    }

    query = query.order("full_name", { ascending: true });

    const { data, error } = await query;

    if (error) throw error;

    let employees = data || [];

    // If department filter is provided, filter employees by department
    // workdetails is an array (one-to-many), so check with .some()
    if (department) {
      employees = employees.filter((emp) => {
        const wds = Array.isArray(emp.workdetails) ? emp.workdetails : [];
        return wds.some((wd) => wd.jobdescription?.department === department);
      });
    }

    res.json(employees);
  } catch (err) {
    console.error("Error fetching employees:", err);
    res.status(500).json({ error: "Failed to fetch employees." });
  }
});

/* --------------------------------------------------------------------- */
/* ✅ GET /api/employees/hours/:employee_id                               */
/* (requires RPC: get_employee_daily_hours)                              */
/* IMPORTANT: Must be defined BEFORE '/:id'                              */
/* --------------------------------------------------------------------- */
router.get("/hours/:employee_id", async (req, res) => {
  const employee_id = Number(req.params.employee_id);

  if (Number.isNaN(employee_id)) {
    return res.status(400).json({ error: "Invalid employee ID." });
  }

  const { data, error } = await supabase.rpc("get_employee_daily_hours", {
    emp_id: employee_id,
  });

  if (error) {
    console.error("RPC get_employee_daily_hours error:", error);
    return res.status(500).json({
      error: "Failed to fetch employee hours.",
      details: error.message,
    });
  }

  res.json(data || []);
});

/* --------------------------------------------------------------------- */
/* GET /api/employees/:id                                                */
/* --------------------------------------------------------------------- */
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);

  // ✅ avoid NaN causing Supabase errors
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid employee ID." });
  }

  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .eq("employee_id", id)
    .maybeSingle();

  if (error) {
    console.error("Error fetching employee:", error);
    return res.status(500).json({ error: "Failed to fetch employee." });
  }

  if (!data) return res.status(404).json({ error: "Employee not found." });

  res.json(data);
});

/* --------------------------------------------------------------------- */
/* POST /api/employees  (create employee)                                */
/* --------------------------------------------------------------------- */
router.post("/", async (req, res) => {
  const { full_name, date_of_birth, gender, photo = "", pin_code } = req.body;

  if (!full_name || !date_of_birth || !gender || !pin_code) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  const { data, error } = await supabase
    .from("employees")
    .insert([{ full_name, date_of_birth, gender, photo, pin_code }])
    .select("employee_id")
    .maybeSingle();

  if (error) {
    console.error("Error inserting employee:", error);
    return res.status(500).json({ error: "Failed to create employee." });
  }

  res.json({ message: "Employee created.", employee_id: data.employee_id });
});

/* --------------------------------------------------------------------- */
/* PUT /api/employees/:id  (update employee)                             */
/* --------------------------------------------------------------------- */
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { full_name, date_of_birth, gender, photo = "", pin_code } = req.body;

  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid employee ID." });
  }

  if (!full_name || !date_of_birth || !gender || !pin_code) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  const { data, error } = await supabase
    .from("employees")
    .update({ full_name, date_of_birth, gender, photo, pin_code })
    .eq("employee_id", id)
    .select();

  if (error) {
    console.error("Error updating employee:", error);
    return res.status(500).json({ error: "Failed to update employee." });
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: "Employee not found." });
  }

  res.json({ message: "Employee updated." });
});

/* --------------------------------------------------------------------- */
/* DELETE /api/employees/:id                                             */
/* --------------------------------------------------------------------- */
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid employee ID." });
  }

  const { error } = await supabase.from("employees").delete().eq("employee_id", id);

  if (error) {
    console.error("Error deleting employee:", error);
    return res.status(500).json({ error: "Failed to delete employee." });
  }

  res.json({ message: "Employee deleted." });
});

export default router;
