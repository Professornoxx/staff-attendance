-- Projects
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE
);

-- Shifts (scoped to a project — each project can define multiple Day/Night schedules,
-- e.g. Project 1 Day Shift 8-5, 9-6, and 10-7 as separate rows, each with its own break limit)
CREATE TABLE IF NOT EXISTS shifts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  type TEXT NOT NULL CHECK(type IN ('day','night')),
  start_time TEXT NOT NULL,        -- '09:00'
  end_time TEXT NOT NULL,          -- '18:00'
  break_limit_minutes INTEGER NOT NULL -- independent per schedule
);

-- Staff
CREATE TABLE IF NOT EXISTS staff (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL UNIQUE,
  telegram_username TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending / active / disabled
  shift_id INTEGER REFERENCES shifts(id),
  project_id INTEGER REFERENCES projects(id),
  current_state TEXT NOT NULL DEFAULT 'logged_out', -- logged_out/logged_in/on_lunch/on_break
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Attendance (one row per staff per day)
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  date TEXT NOT NULL,               -- 'YYYY-MM-DD'
  login_time TEXT,
  logout_time TEXT,
  total_working_minutes INTEGER,
  total_break_minutes INTEGER NOT NULL DEFAULT 0,
  total_break_seconds INTEGER NOT NULL DEFAULT 0,
  break_count INTEGER NOT NULL DEFAULT 0,
  day_status TEXT,                  -- half_day / full_day
  late_fine INTEGER NOT NULL DEFAULT 0,
  break_fine INTEGER NOT NULL DEFAULT 0,
  manual_fine INTEGER NOT NULL DEFAULT 0,
  UNIQUE(staff_id, date)
);

-- Individual break records (lunch + short out/in)
CREATE TABLE IF NOT EXISTS breaks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attendance_id INTEGER NOT NULL REFERENCES attendance(id),
  break_type TEXT NOT NULL CHECK(break_type IN ('lunch','out')),
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_minutes INTEGER,
  duration_seconds INTEGER
);

-- Fine history (late / break_exceed / manual)
CREATE TABLE IF NOT EXISTS fines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id INTEGER NOT NULL REFERENCES staff(id),
  attendance_id INTEGER REFERENCES attendance(id),
  type TEXT NOT NULL CHECK(type IN ('late','break_exceed','manual')),
  amount INTEGER NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  removed_at TEXT -- set when an admin removes the fine; row is kept for reporting history
);

CREATE INDEX IF NOT EXISTS idx_attendance_staff_date ON attendance(staff_id, date);
CREATE INDEX IF NOT EXISTS idx_breaks_attendance ON breaks(attendance_id);
CREATE INDEX IF NOT EXISTS idx_fines_staff ON fines(staff_id);
