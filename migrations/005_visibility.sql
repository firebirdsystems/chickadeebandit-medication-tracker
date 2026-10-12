-- Who else may see a medication.
--
-- 'family': every adult in the household, or every adult who takes part in the
-- shared space, sees the medication and ticks its doses. This is what every
-- medication was before the column existed, so it is the default and the
-- backfill. 'private': the person it is for alone. Compared in SQL by the row
-- policy, so the column is plaintext (manifest.db_plaintext_columns).
ALTER TABLE app_medication_tracker__medications ADD COLUMN visibility TEXT NOT NULL DEFAULT 'family';
