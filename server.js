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
/*  CORS setup (Render + Vercel)                                  */
/*--------------------------------------------------------------- */

// ✅ Only list your stable origins here
const allowedOrigins = new Set([
  'http://localhost:3000',
  'https://hr-frontend-puce.vercel.app',
  // If you later add a custom domain, add it here:
  // 'https://your-domain.com',
]);

const corsOptions = {
  origin: (origin, cb) => {
    // Allow requests with no Origin (curl, server-to-server, health checks)
    if (!origin) return cb(null, true);

    // Allow stable origins
    if (allowedOrigins.has(origin)) return cb(null, true);

    // ✅ Allow ALL Vercel preview deployments
    // ex: https://hr-frontend-xxxxx-adria-busquets-projects.vercel.app
    if (origin.endsWith('.vercel.app')) return cb(null, true);

    // Block everything else WITHOUT throwing (prevents noisy 500s)
    return cb(null, false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false, // keep false unless you use cookies/sessions
};

// Apply CORS to all routes
app.use(cors(corsOptions));
// Preflight requests should use the SAME config
app.options('*', cors(corsOptions));

app.use(express.json());

// local uploads (optional)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/*--------------------------------------------------------------- */
/*  ENV DEBUG                                                     */
/*--------------------------------------------------------------- */
console.log('Loaded ENV Vars:', {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'OK' : 'MISSING',
});

/*--------------------------------------------------------------- */
/*  Import ESM Routes + DEBUG LOGS                                */
/*--------------------------------------------------------------- */
import addEmployees from './routes/addEmployees.js';
console.log('addEmployees =', typeof addEmployees);

import employeesRoutes from './routes/employees.js';
console.log('employeesRoutes =', typeof employeesRoutes);

import fitxatgeRoutes from './routes/fitxatge.js';
console.log('fitxatgeRoutes =', typeof fitxatgeRoutes);

import incidencesRoutes from './routes/incidences.js';
console.log('incidencesRoutes =', typeof incidencesRoutes);

import controlWorkers from './routes/controlWorkers.js';
console.log('controlWorkers =', typeof controlWorkers);

import infoRoutes from './routes/info.js';
console.log('infoRoutes =', typeof infoRoutes);

import alertsRouter from './routes/alerts.js';
console.log('alertsRouter =', typeof alertsRouter);

import fitxatgeEditorRoutes from './routes/fitxatgeEditor.js';
console.log('fitxatgeEditorRoutes =', typeof fitxatgeEditorRoutes);

import supervisorPasswordsRoute from './routes/supervisorpasswords.js';
console.log('supervisorPasswordsRoute =', typeof supervisorPasswordsRoute);

import reportsRoutes from './routes/reports.js';


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
app.use('/api/reports', reportsRoutes);

/*--------------------------------------------------------------- */
/*  ENVIRONMENT VARIABLES DEBUG ROUTE                             */
/*--------------------------------------------------------------- */
app.get('/api/env-test', (req, res) => {
  return res.json({
    SUPABASE_URL: process.env.SUPABASE_URL || 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'OK' : 'MISSING',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ? 'OK' : 'MISSING',
  });
});

/*--------------------------------------------------------------- */
/*  Global error handler                                          */
/*--------------------------------------------------------------- */
app.use((err, req, res, next) => {
  console.error('🔥 UNCAUGHT ERROR:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

/*--------------------------------------------------------------- */
/*  Start server                                                  */
/*--------------------------------------------------------------- */
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Server running on port ${PORT}`));
