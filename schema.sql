-- DBAS Simulator Database Schema

CREATE TABLE IF NOT EXISTS students (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS scenario_runs (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  scenario VARCHAR(10) NOT NULL CHECK (scenario IN ('LEGO', 'SIEMENS', 'SPOTIFY')),
  decisions JSONB NOT NULL,
  results JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(student_id, scenario)
);

CREATE TABLE IF NOT EXISTS reflections (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE UNIQUE,
  q1_context TEXT,
  q2_negative TEXT,
  q3_tradeoff TEXT,
  q4_cycle TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_runs_student ON scenario_runs(student_id);
CREATE INDEX IF NOT EXISTS idx_runs_scenario ON scenario_runs(scenario);
