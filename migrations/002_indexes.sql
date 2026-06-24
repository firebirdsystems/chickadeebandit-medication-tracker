CREATE INDEX IF NOT EXISTS idx_medications_member  ON app_medication_tracker__medications (member_id);
CREATE INDEX IF NOT EXISTS idx_medications_archived ON app_medication_tracker__medications (archived);
CREATE INDEX IF NOT EXISTS idx_doses_date           ON app_medication_tracker__doses (dose_date);
