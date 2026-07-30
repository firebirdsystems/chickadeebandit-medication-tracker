-- Schedule-reminders support (hub `schedule_reminders` protocol).
--
-- The canonical schedule becomes a list of wall-clock times rather than four
-- named slots: that is what lets the hub nudge "8:00 AM — did you take it?" and
-- escalate a missed dose, and it lifts the old limit of one dose per named slot
-- per day. `schedule_slots` is left in place (unused by the UI from 1.1.0) so
-- the change is reversible and no history is destroyed.
--
-- NOTE: dose rows written before 1.1.0 carry named slots ("morning"). They are
-- deliberately not rewritten — they are historical ticks for past dates, and
-- their `slot` values are encrypted at rest so SQL cannot map them anyway.

ALTER TABLE app_medication_tracker__medications ADD COLUMN reminder_times TEXT NOT NULL DEFAULT '[]';
-- Per-row off switch: reminders can be silenced without archiving the med.
ALTER TABLE app_medication_tracker__medications ADD COLUMN reminders_on INTEGER NOT NULL DEFAULT 1;
-- Recurrence filters (rung 3 + 4). CSV of ISO weekdays "1,3,5"; every-N-days is
-- anchored on started_on and ignored without it.
ALTER TABLE app_medication_tracker__medications ADD COLUMN days_mask TEXT NOT NULL DEFAULT '';
ALTER TABLE app_medication_tracker__medications ADD COLUMN every_n_days INTEGER;
ALTER TABLE app_medication_tracker__medications ADD COLUMN started_on TEXT;
ALTER TABLE app_medication_tracker__medications ADD COLUMN ends_on TEXT;
-- Audience overrides (§11.1). A young child's medication is OWNED by a child
-- who may have no device, so the nudge must be re-addressable; the buddy list
-- is the "medfriend" who hears about a missed dose.
ALTER TABLE app_medication_tracker__medications ADD COLUMN remind_member_ids TEXT NOT NULL DEFAULT '';
-- JSON [] explicitly disables escalation until a caregiver chooses recipients.
ALTER TABLE app_medication_tracker__medications ADD COLUMN buddy_member_ids TEXT NOT NULL DEFAULT '[]';

-- Installing an update must not silently opt existing private health records
-- into push delivery. Their times are backfilled below for a painless opt-in,
-- but a caregiver must explicitly enable each reminder in the editor.
UPDATE app_medication_tracker__medications
   SET reminders_on = 0
 WHERE 1 = 1;

-- Backfill clock times from the named slots so existing medications keep a
-- working schedule without anyone re-entering them.
UPDATE app_medication_tracker__medications
   SET reminder_times = TRIM(
         (CASE WHEN schedule_slots LIKE '%morning%'   THEN '"08:00",' ELSE '' END) ||
         (CASE WHEN schedule_slots LIKE '%afternoon%' THEN '"13:00",' ELSE '' END) ||
         (CASE WHEN schedule_slots LIKE '%evening%'   THEN '"18:00",' ELSE '' END) ||
         (CASE WHEN schedule_slots LIKE '%bedtime%'   THEN '"21:00",' ELSE '' END)
       , ',')
 WHERE reminder_times = '[]';

UPDATE app_medication_tracker__medications
   SET reminder_times = '[' || reminder_times || ']'
 WHERE reminder_times <> '[]' AND reminder_times NOT LIKE '[%';

UPDATE app_medication_tracker__medications
   SET reminder_times = '["08:00"]'
 WHERE reminder_times = '[]' OR reminder_times = '';
