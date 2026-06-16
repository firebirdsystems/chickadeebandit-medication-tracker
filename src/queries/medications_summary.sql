SELECT
  m.id,
  m.member_id,
  m.name,
  m.dosage,
  m.notes,
  m.schedule_slots,
  m.shared_with,
  m.archived,
  m.created_at
FROM app_medication_tracker__medications m
WHERE m.archived = 0
ORDER BY m.member_id, m.created_at
LIMIT 200
