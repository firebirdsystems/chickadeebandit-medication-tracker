-- Refills, and who prescribes and fills a medication.
--
-- The thing a caregiver most often wants remembered is "Mom's lisinopril runs
-- out Thursday". `refill_on` is the day the next refill is due: the hub's
-- date_reminders lane emails the adults who can see the medication, and the
-- person it is for, ahead of that day and stamps `refill_reminded_at` when it
-- has. Both are compared in SQL, so both are plaintext: `refill_on` by
-- manifest.db_plaintext_columns, `refill_reminded_at` by its suffix. NULL or
-- '' means no refill is tracked. `refill_every_days` lets the Refilled button
-- set the next date itself; a number is never encrypted.
--
-- `prescriber` and `pharmacy` are free text, encrypted at rest like the name.
-- DEFAULT '' is the one default the codec leaves as it is.
ALTER TABLE app_medication_tracker__medications ADD COLUMN prescriber TEXT NOT NULL DEFAULT '';
ALTER TABLE app_medication_tracker__medications ADD COLUMN pharmacy TEXT NOT NULL DEFAULT '';
ALTER TABLE app_medication_tracker__medications ADD COLUMN refill_on TEXT;
ALTER TABLE app_medication_tracker__medications ADD COLUMN refill_every_days INTEGER;
ALTER TABLE app_medication_tracker__medications ADD COLUMN refill_reminded_at TEXT;
