/********************************************************************
 * server.js – ESM version (required for Render + Supabase)
 *******************************************************************/
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/*--------------------------------------------------------------- */
/*  CORS setup                                                    */
/*--------------------------------------------------------------- */
app.use(
  cors({
    origin: ['http://localhost:3000', '*'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);

app.options('*', cors());
app.use(express.json());

// local uploads (optional)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/*--------------------------------------------------------------- */
/*  Import ESM Routes                                             */
/*--------------------------------------------------------------- */
/*--------------------------------------------------------------- */
/*  Import ESM Routes + DEBUG LOGS                                */
/*--------------------------------------------------------------- */
import addEmployees from './routes/addEmployees.js';
console.log("addEmployees =", typeof addEmployees);

import employeesRoutes from './routes/employees.js';
console.log("employeesRoutes =", typeof employeesRoutes);

import fitxatgeRoutes from './routes/fitxatge.js';
console.log("fitxatgeRoutes =", typeof fitxatgeRoutes);

import incidencesRoutes from './routes/incidences.js';
console.log("incidencesRoutes =", typeof incidencesRoutes);

import controlWorkers from './routes/controlWorkers.js';
console.log("controlWorkers =", typeof controlWorkers);

import infoRoutes from './routes/info.js';
console.log("infoRoutes =", typeof infoRoutes);

import alertsRouter from './routes/alerts.js';
console.log("alertsRouter =", typeof alertsRouter);

import fitxatgeEditorRoutes from './routes/fitxatgeEditor.js';
console.log("fitxatgeEditorRoutes =", typeof fitxatgeEditorRoutes);

import supervisorPasswordsRoute from './routes/supervisorpasswords.js';
console.log("supervisorPasswordsRoute =", typeof supervisorPasswordsRoute);


/*--------------------------------------------------------------- */
/*  Mount routes                                                  */
/*--------------------------------------------------------------- */
app.use('/api/employees', addEmployees);
app.use('/api/employees', employeesRoutes);
app.use('/api/fitxatge', fitxatgeRoutes);
app.use('/api/incidences', incidencesRoutes);
app.use('/api/control-workers', controlWorkers);
app.use('/api/info', infoRoutes);
app.use('/api/alerts', alertsRouter);
app.use('/api/fitxatgeEditor', fitxatgeEditorRoutes);
app.use('/api/supervisorpasswords', supervisorPasswordsRoute);

/*--------------------------------------------------------------- */
/*  Start server                                                  */
/*--------------------------------------------------------------- */
const PORT = process.env.PORT || 5000;

// Global error handler
app.use((err, req, res, next) => {
  console.error("🔥 UNCAUGHT ERROR:", err);
  res.status(500).json({ error: "Internal server error", details: err.message });
});


app.listen(PORT, '0.0.0.0', () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
