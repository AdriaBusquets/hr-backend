/********************************************************************
 *  server.js   – main Express bootstrap
 *******************************************************************/
const express = require('express');
const cors    = require('cors');
const os      = require('os');
const path    = require('path');

const app = express();

/*--------------------------------------------------------------- */
/*  1. helpers – network IP                                       */
/*--------------------------------------------------------------- */
const getLocalIP = () => {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const n of nets[name] || []) {
      if (n.family === 'IPv4' && !n.internal) return n.address;
    }
  }
  return 'localhost';
};

const localIP     = getLocalIP();            // e.g. 192.168.1.142
const FRONTEND_IP = `http://${localIP}:3000`;

/*--------------------------------------------------------------- */
/*  2. middleware                                                 */
/*--------------------------------------------------------------- */
app.use(
  cors({
    origin: ['http://localhost:3000', FRONTEND_IP, '*'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  })
);
app.options('*', cors());         // pre‑flight
app.use(express.json());          // for JSON payloads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/*--------------------------------------------------------------- */
/*  3. route modules                                              */
/*     — Minimal add‑worker FIRST                                 */
/*     — CRUD employees AFTERWARDS                                */
/*--------------------------------------------------------------- */
const addEmployees            = require('./routes/addEmployees');   // minimal
const employeesRoutes         = require('./routes/employees');      // full CRUD
const fitxatgeRoutes          = require('./routes/fitxatge');
const incidencesRoutes        = require('./routes/incidences');
const controlWorkers          = require('./routes/controlWorkers');
const infoRoutes              = require('./routes/info');
const alertsRouter            = require('./routes/alerts');
const fitxatgeEditorRoutes    = require('./routes/fitxatgeEditor');
const supervisorPasswordsRoute= require('./routes/supervisorpasswords');

/* ---------- Mount order matters! ---------- */
app.use('/api/employees',  addEmployees);    // <- FIRST (handles POST /api/employees)
app.use('/api/employees',  employeesRoutes); // <- SECOND (all other /api/employees)

app.use('/api/fitxatge',          fitxatgeRoutes);
app.use('/api/incidences',        incidencesRoutes);
app.use('/api/control-workers',   controlWorkers);
app.use('/api/info',              infoRoutes);
app.use('/api/alerts',            alertsRouter);
app.use('/api/fitxatgeEditor',    fitxatgeEditorRoutes);
app.use('/api/supervisorpasswords', supervisorPasswordsRoute);

/*--------------------------------------------------------------- */
/*  4. start server                                               */
/*--------------------------------------------------------------- */
const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('✅  Server running at:');
  console.log(`   • Local   → http://localhost:${PORT}`);
  console.log(`   • Network → http://${localIP}:${PORT}`);
});
