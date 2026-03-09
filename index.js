require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database tables on startup
async function initDB() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  try {
    await pool.query(schema);
    console.log('Database tables initialized');
  } catch (err) {
    console.error('Error initializing database:', err.message);
  }
}

// ─── ROUTES ──────────────────────────────────────────────

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'DBAS Simulator API' });
});

// Register or retrieve a student (first name + browser session ID only)
app.post('/api/students', async (req, res) => {
  const { name, session_id } = req.body;
  if (!name || !session_id) {
    return res.status(400).json({ error: 'Name and session_id are required' });
  }
  try {
    // Upsert: if session_id exists, return existing student; otherwise create new
    const result = await pool.query(
      `INSERT INTO students (name, session_id)
       VALUES ($1, $2)
       ON CONFLICT (session_id) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, name, session_id, created_at`,
      [name.trim(), session_id.trim()]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error creating student:', err.message);
    res.status(500).json({ error: 'Failed to register student' });
  }
});

// Save a scenario run (upsert: updates if same student+scenario exists)
app.post('/api/runs', async (req, res) => {
  const { student_id, scenario, decisions, results } = req.body;
  if (!student_id || !scenario || !decisions || !results) {
    return res.status(400).json({ error: 'student_id, scenario, decisions, and results are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO scenario_runs (student_id, scenario, decisions, results)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (student_id, scenario)
       DO UPDATE SET decisions = EXCLUDED.decisions,
                     results = EXCLUDED.results,
                     updated_at = NOW()
       RETURNING id, scenario, created_at`,
      [student_id, scenario, JSON.stringify(decisions), JSON.stringify(results)]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error saving run:', err.message);
    res.status(500).json({ error: 'Failed to save scenario run' });
  }
});

// Save reflections (upsert)
app.post('/api/reflections', async (req, res) => {
  const { student_id, q1, q2, q3, q4 } = req.body;
  if (!student_id) {
    return res.status(400).json({ error: 'student_id is required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO reflections (student_id, q1_context, q2_negative, q3_tradeoff, q4_cycle)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (student_id)
       DO UPDATE SET q1_context = EXCLUDED.q1_context,
                     q2_negative = EXCLUDED.q2_negative,
                     q3_tradeoff = EXCLUDED.q3_tradeoff,
                     q4_cycle = EXCLUDED.q4_cycle,
                     submitted_at = NOW()
       RETURNING id, submitted_at`,
      [student_id, q1 || '', q2 || '', q3 || '', q4 || '']
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error saving reflections:', err.message);
    res.status(500).json({ error: 'Failed to save reflections' });
  }
});

// ─── INSTRUCTOR ENDPOINTS ────────────────────────────────

// List all students
app.get('/api/students', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.*,
              COUNT(DISTINCT r.scenario) AS scenarios_completed,
              CASE WHEN ref.id IS NOT NULL THEN true ELSE false END AS reflections_submitted
       FROM students s
       LEFT JOIN scenario_runs r ON s.id = r.student_id
       LEFT JOIN reflections ref ON s.id = ref.student_id
       GROUP BY s.id, ref.id
       ORDER BY s.created_at DESC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing students:', err.message);
    res.status(500).json({ error: 'Failed to list students' });
  }
});

// List all runs (with student name)
app.get('/api/runs', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.*, s.name, s.session_id
       FROM scenario_runs r
       JOIN students s ON r.student_id = s.id
       ORDER BY s.name, r.scenario`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error listing runs:', err.message);
    res.status(500).json({ error: 'Failed to list runs' });
  }
});

// Export all data as single JSON (for analysis)
app.get('/api/export', async (req, res) => {
  try {
    const students = await pool.query('SELECT * FROM students ORDER BY id');
    const runs = await pool.query(
      `SELECT r.*, s.name, s.session_id
       FROM scenario_runs r JOIN students s ON r.student_id = s.id
       ORDER BY s.id, r.scenario`
    );
    const reflections = await pool.query(
      `SELECT ref.*, s.name, s.session_id
       FROM reflections ref JOIN students s ON ref.student_id = s.id
       ORDER BY s.id`
    );
    res.json({
      exported_at: new Date().toISOString(),
      counts: {
        students: students.rows.length,
        runs: runs.rows.length,
        reflections: reflections.rows.length
      },
      students: students.rows,
      runs: runs.rows,
      reflections: reflections.rows
    });
  } catch (err) {
    console.error('Error exporting:', err.message);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

// ─── START ───────────────────────────────────────────────

initDB().then(() => {
  app.listen(port, () => {
    console.log(`DBAS API running on port ${port}`);
  });
});
