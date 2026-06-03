SELECT
  d.medication_id,
  d.dose_date,
  d.slot,
  d.taken_at,
  d.logged_by,
  m.name   AS medication_name,
  m.dosage AS medication_dosage,
  m.member_id
FROM doses d
JOIN medications m
  ON m.id = d.medication_id
  AND m.household_id = d.household_id
WHERE d.household_id = current_setting('app.household_id', true)::uuid
  AND d.dose_date = to_char(NOW() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
ORDER BY d.taken_at DESC
LIMIT 200
