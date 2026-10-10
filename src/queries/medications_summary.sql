SELECT
  m.id,
  m.member_id,
  m.name,
  m.dosage,
  m.notes,
  m.reminder_times,
  m.reminders_on,
  m.days_mask,
  m.every_n_days,
  m.started_on,
  m.ends_on,
  m.archived,
  m.created_at
FROM app_medication_tracker__medications m
WHERE m.archived = 0
ORDER BY m.member_id, m.created_at
LIMIT 200
