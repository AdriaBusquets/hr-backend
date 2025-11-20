/********************************************************************
 *  server.js   – main Express bootstrap (Render + Supabase ready)
 *******************************************************************/
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

/*--------------------------------------------------------------- */
/*  1. CORS (cloud friendly)
 *     - Allow localhost during development
 *     - Allow all origins for Render (temporary)
 *--------------------------------------------------------------- */
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

// If you still keep uploads for local development (optional)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

/*--------------------------------------------------------------- */
/*  2. Import Routes                                               */
/*--------------------------------------------------------------- */
const addEmployees = require('./routes/addEmployees');
const employeesRoutes = require('./routes/employees');
const fitxatgeRoutes = require('./routes/fitxatge');
const incidencesRoutes = require('./routes/incidences');
const controlWorkers = require('./routes/controlWorkers');
const infoRoutes = require('./routes/info');
const alertsRouter = require('./routes/alerts');
const fitxatgeEditorRoutes = require('./routes/fitxatgeEditor');
const supervisorPasswordsRoute = require('./routes/supervisorpasswords');

/*--------------------------------------------------------------- */
/*  3. Mount routes (order matters)                                */
/*--------------------------------------------------------------- */
app.use('/api/employees', addEmployees);     // POST first
app.use('/api/employees', employeesRoutes);  // other CRUD

app.use('/api/fitxatge', fitxatgeRoutes);
app.use('/api/incidences', incidencesRoutes);
app.use('/api/control-workers', controlWorkers);
app.use('/api/info', infoRoutes);
app.use('/api/alerts', alertsRouter);
app.use('/api/fitxatgeEditor', fitxatgeEditorRoutes);
app.use('/api/supervisorpasswords', supervisorPasswordsRoute);

/*--------------------------------------------------------------- */
/*  4. Start Server (Render compatible)
 *     - Render injects PORT dynamically
 *     - Fallback to 5000 for local development
 *--------------------------------------------------------------- */
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Server running:');
  console.log(`   • Port → ${PORT}`);
});
