SELECT
  d.medication_id,
  d.dose_date,
  d.slot,
  d.taken_at,
  d.logged_by,
  m.name   AS medication_name,
  m.dosage AS medication_dosage,
  m.member_id
FROM app_medication_tracker__doses d
JOIN app_medication_tracker__medications m
  ON m.id = d.medication_id
-- `dose_date` is the household's LOCAL calendar date (the app derives it from
-- the member's own clock). SQLite's date('now') is UTC, which names a different
-- day for part of every day outside UTC, so this must use the :today token the
-- hub binds to the household-local date.
WHERE d.dose_date = :today
ORDER BY d.taken_at DESC
LIMIT 200
