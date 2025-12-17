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

const allowedOrigins = new Set([
  'http://localhost:3000',
  'https://hr-frontend-puce.vercel.app', // your production domain
]);

function isAllowedVercelDeployment(origin) {
  // allow any deployment URL for YOUR project on vercel
  // e.g. https://hr-frontend-xxxxx-adria-busquets-projects.vercel.app
  try {
    const u = new URL(origin);
    return (
      u.protocol === 'https:' &&
      u.hostname.endsWith('.vercel.app') &&
      (
        u.hostname.startsWith('hr-frontend-') ||  // project deployments
        u.hostname === 'hr-frontend-puce.vercel.app' // prod (already allowed)
      )
    );
  } catch {
    return false;
  }
}

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl/server-to-server

      if (allowedOrigins.has(origin) || isAllowedVercelDeployment(origin)) {
        return cb(null, true);
      }

      // IMPORTANT: don't throw (throwing can create 500s)
      return cb(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
  })
);

// Preflight
app.options('*', cors());


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
