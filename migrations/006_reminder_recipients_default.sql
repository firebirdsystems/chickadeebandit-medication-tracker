-- An empty reminder-recipient list was never a choice the form offered.
--
-- `remind_member_ids` has two "nobody named" spellings and the hub reads them
-- differently: '' means the person the medication is for (the column default),
-- '[]' means the household picked nobody, so no reminder is created at all. The
-- editor saved '[]' whenever no recipient was ticked, under a label promising
-- the first meaning, so those medications sent nothing while their reminders
-- read as on. Put them back on the default. Reminders the household turned off
-- stay off: that switch is `reminders_on`, which this does not touch.
--
-- The manifest's reminder lane also declares `empty_list: "audience"`, so the
-- hub reads a '[]' written later (member removal prunes the list to that) as the
-- default too. This keeps the stored value saying what the form shows.
--
-- `buddy_member_ids` is left alone: '[]' there is the documented "no
-- missed-dose escalation". The column is plaintext (manifest.db_plaintext_columns),
-- so the literals compare as written.
UPDATE app_medication_tracker__medications
   SET remind_member_ids = ''
 WHERE remind_member_ids = '[]';
