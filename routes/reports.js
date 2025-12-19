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

export default router;
