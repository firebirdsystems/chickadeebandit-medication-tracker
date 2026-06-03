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
FROM medications m
WHERE m.household_id = current_setting('app.household_id', true)::uuid
  AND m.archived = 0
ORDER BY m.member_id, m.created_at
LIMIT 200
