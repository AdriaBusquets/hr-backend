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
import addEmployees from './routes/addEmployees.js';
import employeesRoutes from './routes/employees.js';
import fitxatgeRoutes from './routes/fitxatge.js';
import incidencesRoutes from './routes/incidences.js';
import controlWorkers from './routes/controlWorkers.js';
import infoRoutes from './routes/info.js';
import alertsRouter from './routes/alerts.js';
import fitxatgeEditorRoutes from './routes/fitxatgeEditor.js';
import supervisorPasswordsRoute from './routes/supervisorpasswords.js';

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
app.listen(PORT, '0.0.0.0', () =>
  console.log(`🚀 Server running on port ${PORT}`)
);
