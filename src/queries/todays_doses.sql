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
WHERE d.dose_date = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
ORDER BY d.taken_at DESC
LIMIT 200
