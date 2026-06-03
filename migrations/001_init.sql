CREATE TABLE IF NOT EXISTS medications (
  household_id   UUID NOT NULL DEFAULT current_setting('app.household_id', true)::uuid,
  id             TEXT NOT NULL,
  member_id      TEXT NOT NULL,
  name           TEXT NOT NULL,
  dosage         TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  schedule_slots TEXT NOT NULL DEFAULT '["morning"]',
  shared_with    TEXT NOT NULL DEFAULT '[]',
  archived       INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL,
  PRIMARY KEY (household_id, id)
);

-- Natural PK: one dose record per (medication, date, slot) per household.
-- Upsert on (medication_id, dose_date, slot) to toggle doses idempotently.
CREATE TABLE IF NOT EXISTS doses (
  household_id  UUID NOT NULL DEFAULT current_setting('app.household_id', true)::uuid,
  medication_id TEXT NOT NULL,
  dose_date     TEXT NOT NULL,
  slot          TEXT NOT NULL,
  taken_at      TEXT NOT NULL,
  logged_by     TEXT NOT NULL,
  PRIMARY KEY (household_id, medication_id, dose_date, slot)
);
