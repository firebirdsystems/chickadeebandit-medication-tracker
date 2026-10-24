-- A care team: the hub member group whose members see every medication marked
-- "care" (visibility = 'care') and tick its doses, without seeing the adults'
-- own medications. A nanny who signs in as a guest, or a grandparent.
--
-- key/value settings, one key so far: care_team_group_id. Written only by the
-- admin-gated /api/admin-config endpoint (row policy app_config), never by
-- app SQL: if any adult could point it at a group, any adult could grant
-- themselves what the care team sees. The row policy on medications reads it
-- (privileged_groups). The same shape as Guest Log's settings table.
CREATE TABLE IF NOT EXISTS app_medication_tracker__settings (
  key    TEXT NOT NULL,
  value  TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (key)
);

-- Doses whose medication no longer exists are removed. Nothing can show them,
-- and left in place they could be adopted: a new medication INSERTed under the
-- old one's id, owned by a child, would take the stale history with it. The
-- delete_cascades on medications keep this from happening again. Idempotent:
-- a replay finds no orphan.
DELETE FROM app_medication_tracker__doses
 WHERE NOT EXISTS (SELECT 1 FROM app_medication_tracker__medications m WHERE m.id = medication_id);
