// routes/reports.js
import express from "express";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

/**
 * Supabase client (Service Role on backend ONLY)
 */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * ✅ Schema for the report builder (based on your exported tables/columns)
 * If you add new columns later, just add them here.
 */
const REPORT_SCHEMA = {
  baseTable: "employees",
  tables: {
    employees: {
      label: "Employees",
      pk: "employee_id",
      type: "base",
      columns: [
        "employee_id",
        "full_name",
        "date_of_birth",
        "gender",
        "pin_code",
        "photo",
      ],
    },

    contact: {
      label: "Contact",
      fk: "employee_id",
      type: "one",
      columns: [
        "address",
        "phone_number",
        "email_personal",
        "email_corporate",
        "emergency_contact_name",
      ],
    },

    administration: {
      label: "Administration",
      fk: "employee_id",
      type: "one",
      columns: [
        "employment_status",
        "dni_nie_document",
        "bank_account_document",
        "social_security_document",
        "dni_nie_number",
        "bank_account_number",
        "social_security_number",
      ],
    },

    academics: {
      label: "Academics",
      fk: "employee_id",
      type: "one",
      columns: ["cv_document", "certifications_document", "studies"],
    },

    compensation: {
      label: "Compensation",
      fk: "employee_id",
      type: "one",
      columns: ["annual_salary", "work_hours"],
    },

    workdetails: {
      label: "WorkDetails",
      fk: "employee_id",
      type: "one",
      columns: [
        "job_id",
        "date_joined",
        "contract_start_date",
        "contract_end_date",
        "supervisor",
        "empresa",
        "situation",
        "contract_type",
      ],
    },

    jobdescription: {
      label: "JobDescription",
      pk: "job_id",
      type: "lookup",
      columns: [
        "job_id",
        "job_title",
        "job_description",
        "job_requirements",
        "job_qualifications",
        "department",
      ],
    },

    // ✅ one-to-many (expandable)
    activities: {
      label: "Activities",
      fk: "employee_id",
      type: "many",
      columns: ["employment_history", "disciplinary_history"],
    },

    baixes: {
      label: "Baixes",
      fk: "employee_id",
      type: "many",
      columns: [
        "Dia_Inici",
        "Num_dias",
        "Return_Date",
        "Type",
        "Reason",
        "Approved",
      ],
    },

    incidences: {
      label: "Incidences",
      fk: "employee_id",
      type: "many",
      columns: [
        "instance_type",
        "instanceDate",
        "CurrentDate",
        "InstanceStatus",
        "job_id",
      ],
    },

    fitxatge: {
      label: "Fitxatge",
      fk: "employee_id",
      type: "many",
      columns: ["Dia", "Hora", "Working", "Active", "Vacances"],
    },
  },
};

/**
 * GET /api/reports/schema
 * Frontend uses this to display tables/columns dynamically.
 */
router.get("/schema", (req, res) => {
  res.json(REPORT_SCHEMA);
});

/**
 * Helpers
 */
function uniq(arr) {
  return [...new Set(arr)];
}

function buildSelectString(fieldsByTable) {
  // Always include employee_id in base fetch
  const baseCols = uniq(["employee_id", ...(fieldsByTable.employees || [])]);
  return baseCols.join(",");
}

/**
 * POST /api/reports/run
 * body:
 * {
 *   fields: [{ table:"employees", column:"full_name" }, { table:"administration", column:"dni_nie_number" }, ...],
 *   expandTable: "activities" | null
 * }
 *
 * Returns:
 * { columns: ["employees.full_name", "administration.dni_nie_number", "activities.employment_history"], rows: [...] }
 */
router.post("/run", async (req, res) => {
  try {
    const { fields, expandTable } = req.body || {};

    // ✅ Hard validation: must be an array with at least 1 item
    if (!Array.isArray(fields) || fields.length === 0) {
      return res
        .status(400)
        .json({ error: "You must select at least 1 field." });
    }

    // ✅ Normalize expandTable: treat "", undefined, null as null
    const normalizedExpand =
      typeof expandTable === "string" && expandTable.trim()
        ? expandTable.trim()
        : null;

    // Validate requested fields exist in schema + are well formed
    for (const f of fields) {
      if (!f || typeof f.table !== "string" || typeof f.column !== "string") {
        return res.status(400).json({ error: "Invalid field format." });
      }
      const t = REPORT_SCHEMA.tables[f.table];
      if (!t) return res.status(400).json({ error: `Unknown table: ${f.table}` });
      if (!t.columns.includes(f.column)) {
        return res
          .status(400)
          .json({ error: `Unknown column: ${f.table}.${f.column}` });
      }
    }

    // If expand provided, validate it exists and is type many
    if (normalizedExpand) {
      const t = REPORT_SCHEMA.tables[normalizedExpand];
      if (!t || t.type !== "many") {
        return res.status(400).json({
          error:
            "expandTable must be a one-to-many table (type 'many') or be blank.",
        });
      }
    }

    // Group selected columns by table
    const fieldsByTable = {};
    for (const f of fields) {
      if (!fieldsByTable[f.table]) fieldsByTable[f.table] = [];
      fieldsByTable[f.table].push(f.column);
    }

    // ✅ Safety: if expand is chosen but no fields from that expand table were selected,
    // return a clean 400 instead of crashing.
    if (normalizedExpand && !Array.isArray(fieldsByTable[normalizedExpand])) {
      return res.status(400).json({
        error: `You selected expandTable="${normalizedExpand}", but did not select any fields from that table.`,
      });
    }

    // 1) Fetch employees (base)
    const baseSelect = buildSelectString(fieldsByTable);
    const empRes = await supabase.from("employees").select(baseSelect);
    if (empRes.error) throw empRes.error;

    const employees = empRes.data || [];
    const employeeIds = employees.map((e) => e.employee_id);

    // If no employees, return empty
    if (employeeIds.length === 0) {
      const outColumns = fields.map((f) => `${f.table}.${f.column}`);
      return res.json({ columns: outColumns, rows: [] });
    }

    // 2) Fetch one-to-one tables
    const oneTables = Object.keys(fieldsByTable).filter((t) => {
      const meta = REPORT_SCHEMA.tables[t];
      return meta && meta.type === "one";
    });

    const oneDataMaps = {}; // table -> Map(employee_id -> row)
    for (const t of oneTables) {
      const cols = uniq(["employee_id", ...fieldsByTable[t]]);
      const r = await supabase
        .from(t)
        .select(cols.join(","))
        .in("employee_id", employeeIds);
      if (r.error) throw r.error;

      const m = new Map();
      (r.data || []).forEach((row) => m.set(row.employee_id, row));
      oneDataMaps[t] = m;
    }

    // 3) jobdescription lookup merge (only if jobdescription fields selected)
    let jobMap = null;

    if (Array.isArray(fieldsByTable.jobdescription) && fieldsByTable.jobdescription.length) {
      // Need job_ids from workdetails
      const wdRes = await supabase
        .from("workdetails")
        .select("employee_id,job_id")
        .in("employee_id", employeeIds);

      if (wdRes.error) throw wdRes.error;

      const jobIds = uniq((wdRes.data || []).map((x) => x.job_id).filter(Boolean));

      if (jobIds.length) {
        const cols = uniq(["job_id", ...fieldsByTable.jobdescription]);
        const jdRes = await supabase
          .from("jobdescription")
          .select(cols.join(","))
          .in("job_id", jobIds);

        if (jdRes.error) throw jdRes.error;

        jobMap = new Map();
        (jdRes.data || []).forEach((row) => jobMap.set(row.job_id, row));
      } else {
        jobMap = new Map();
      }

      // employee_id -> job_id
      oneDataMaps.__workdetails_job = new Map();
      (wdRes.data || []).forEach((row) =>
        oneDataMaps.__workdetails_job.set(row.employee_id, row.job_id)
      );
    }

    // 4) Fetch expand table (one-to-many) if requested
    let expandRowsByEmp = null;

    if (normalizedExpand) {
      const expandFields = fieldsByTable[normalizedExpand] || []; // ✅ safe
      const cols = uniq(["employee_id", ...expandFields]);

      const r = await supabase
        .from(normalizedExpand)
        .select(cols.join(","))
        .in("employee_id", employeeIds);

      if (r.error) throw r.error;

      expandRowsByEmp = new Map();
      for (const row of r.data || []) {
        const list = expandRowsByEmp.get(row.employee_id) || [];
        list.push(row);
        expandRowsByEmp.set(row.employee_id, list);
      }
    }

    // 5) Output columns in selection order
    const outColumns = fields.map((f) => `${f.table}.${f.column}`);

    // 6) Build rows
    const outRows = [];

    for (const emp of employees) {
      const baseRow = {};

      // employees.*
      for (const col of fieldsByTable.employees || []) {
        baseRow[`employees.${col}`] = emp?.[col] ?? null;
      }

      // one-to-one tables
      for (const t of oneTables) {
        const src = oneDataMaps[t]?.get(emp.employee_id) || null;
        for (const col of fieldsByTable[t] || []) {
          baseRow[`${t}.${col}`] = src?.[col] ?? null;
        }
      }

      // jobdescription lookup
      if (Array.isArray(fieldsByTable.jobdescription) && fieldsByTable.jobdescription.length) {
        const jobId =
          oneDataMaps.__workdetails_job?.get(emp.employee_id) || null;
        const jd = jobMap?.get(jobId) || null;
        for (const col of fieldsByTable.jobdescription || []) {
          baseRow[`jobdescription.${col}`] = jd?.[col] ?? null;
        }
      }

      // expand table
      if (normalizedExpand) {
        const expandFields = fieldsByTable[normalizedExpand] || []; // ✅ safe
        const list = expandRowsByEmp?.get(emp.employee_id) || [];

        if (list.length === 0) {
          // still one row with null child cols
          const row = { ...baseRow };
          for (const col of expandFields) {
            row[`${normalizedExpand}.${col}`] = null;
          }
          outRows.push(row);
        } else {
          // one row per child record
          for (const child of list) {
            const row = { ...baseRow };
            for (const col of expandFields) {
              row[`${normalizedExpand}.${col}`] = child?.[col] ?? null;
            }
            outRows.push(row);
          }
        }
      } else {
        // no expand → one row per employee
        outRows.push(baseRow);
      }
    }

    // Ensure each row has all requested columns
    const normalizedRows = outRows.map((r) => {
      const obj = {};
      outColumns.forEach((c) => (obj[c] = r[c] ?? null));
      return obj;
    });

    return res.json({ columns: outColumns, rows: normalizedRows });
  } catch (err) {
    console.error("❌ /api/reports/run error:", err);
    // ✅ If supabase throws structured error, surface it cleanly
    return res.status(500).json({
      error: "Report generation failed",
      details: err?.message || String(err),
    });
  }
});

/**
 * POST /api/reports/nocturnal-hours
 * Returns rows where employees worked past 22:00.
 * Each row: day, employee name, hours worked after 22:00.
 * body: { startDate?, endDate? }
 */
router.post("/nocturnal-hours", async (req, res) => {
  try {
    const { startDate, endDate } = req.body || {};

    // Fetch all fitxatge records ordered by employee, date, time
    let query = supabase
      .from("fitxatge")
      .select("id, dia, hora, working, employee_id")
      .order("employee_id", { ascending: true })
      .order("dia", { ascending: true })
      .order("hora", { ascending: true })
      .order("id", { ascending: true });

    if (startDate) query = query.gte("dia", startDate);
    if (endDate) query = query.lte("dia", endDate);

    const { data: records, error: fitError } = await query;
    if (fitError) throw fitError;

    // Fetch employee names
    const empIds = [...new Set((records || []).map((r) => r.employee_id))];
    if (empIds.length === 0) {
      return res.json({ columns: ["Día", "Empleado", "Horas Nocturnas"], rows: [] });
    }

    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select("employee_id, full_name")
      .in("employee_id", empIds);
    if (empError) throw empError;

    const empMap = new Map();
    (employees || []).forEach((e) => empMap.set(e.employee_id, e.full_name));

    // Pair check-ins with check-outs and calculate nocturnal hours
    const NIGHT_START_SECONDS = 22 * 3600; // 22:00 in seconds
    const rows = [];

    // Group records by employee_id + dia
    const grouped = new Map();
    for (const rec of records || []) {
      const key = `${rec.employee_id}_${rec.dia}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(rec);
    }

    for (const [, dayRecords] of grouped) {
      let lastCheckIn = null;
      let nocturnalSeconds = 0;
      const empId = dayRecords[0].employee_id;
      const dia = dayRecords[0].dia;

      for (const rec of dayRecords) {
        if (rec.working === true) {
          lastCheckIn = rec.hora;
        } else if (rec.working === false && lastCheckIn) {
          // Calculate nocturnal overlap
          const inSec = timeToSec(lastCheckIn);
          const outSec = timeToSec(rec.hora);

          if (outSec > NIGHT_START_SECONDS) {
            const nocturnalStart = Math.max(inSec, NIGHT_START_SECONDS);
            nocturnalSeconds += outSec - nocturnalStart;
          }

          lastCheckIn = null;
        }
      }

      if (nocturnalSeconds > 0) {
        const hh = String(Math.floor(nocturnalSeconds / 3600)).padStart(2, "0");
        const mm = String(Math.floor((nocturnalSeconds % 3600) / 60)).padStart(2, "0");
        rows.push({
          "Día": dia,
          "Empleado": empMap.get(empId) || `ID ${empId}`,
          "Horas Nocturnas": `${hh}:${mm}`,
        });
      }
    }

    return res.json({
      columns: ["Día", "Empleado", "Horas Nocturnas"],
      rows,
    });
  } catch (err) {
    console.error("❌ /api/reports/nocturnal-hours error:", err);
    return res.status(500).json({ error: "Report generation failed", details: err?.message || String(err) });
  }
});

/**
 * POST /api/reports/over-8h30
 * Returns rows where employees worked more than 8:30 in a single day.
 * Each row: day, employee name, total hours worked.
 * body: { startDate?, endDate? }
 */
router.post("/over-8h30", async (req, res) => {
  try {
    const { startDate, endDate } = req.body || {};
    const THRESHOLD_SECONDS = 8 * 3600 + 30 * 60; // 8h30m

    // Fetch all fitxatge records
    let query = supabase
      .from("fitxatge")
      .select("id, dia, hora, working, employee_id")
      .order("employee_id", { ascending: true })
      .order("dia", { ascending: true })
      .order("hora", { ascending: true })
      .order("id", { ascending: true });

    if (startDate) query = query.gte("dia", startDate);
    if (endDate) query = query.lte("dia", endDate);

    const { data: records, error: fitError } = await query;
    if (fitError) throw fitError;

    // Fetch employee names
    const empIds = [...new Set((records || []).map((r) => r.employee_id))];
    if (empIds.length === 0) {
      return res.json({ columns: ["Día", "Empleado", "Horas Trabajadas"], rows: [] });
    }

    const { data: employees, error: empError } = await supabase
      .from("employees")
      .select("employee_id, full_name")
      .in("employee_id", empIds);
    if (empError) throw empError;

    const empMap = new Map();
    (employees || []).forEach((e) => empMap.set(e.employee_id, e.full_name));

    // Group records by employee_id + dia
    const grouped = new Map();
    for (const rec of records || []) {
      const key = `${rec.employee_id}_${rec.dia}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(rec);
    }

    const rows = [];

    for (const [, dayRecords] of grouped) {
      let lastCheckIn = null;
      let totalSeconds = 0;
      const empId = dayRecords[0].employee_id;
      const dia = dayRecords[0].dia;

      for (const rec of dayRecords) {
        if (rec.working === true) {
          lastCheckIn = rec.hora;
        } else if (rec.working === false && lastCheckIn) {
          const inSec = timeToSec(lastCheckIn);
          const outSec = timeToSec(rec.hora);
          const diff = outSec - inSec;
          if (diff > 0) totalSeconds += diff;
          lastCheckIn = null;
        }
      }

      if (totalSeconds > THRESHOLD_SECONDS) {
        const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
        const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
        rows.push({
          "Día": dia,
          "Empleado": empMap.get(empId) || `ID ${empId}`,
          "Horas Trabajadas": `${hh}:${mm}`,
        });
      }
    }

    return res.json({
      columns: ["Día", "Empleado", "Horas Trabajadas"],
      rows,
    });
  } catch (err) {
    console.error("❌ /api/reports/over-8h30 error:", err);
    return res.status(500).json({ error: "Report generation failed", details: err?.message || String(err) });
  }
});

/** Helper: convert "HH:mm:ss" or "HH:mm" to total seconds */
function timeToSec(timeStr) {
  if (!timeStr) return 0;
  const parts = timeStr.split(":").map(Number);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

export default router;
