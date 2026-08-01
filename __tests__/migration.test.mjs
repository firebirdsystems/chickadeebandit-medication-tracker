import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function database() {
  const root = mkdtempSync(join(tmpdir(), "medication-migration-"));
  roots.push(root);
  return join(root, "medications.sqlite");
}

function sql(db, text) {
  return execFileSync("sqlite3", [db], { input: text, encoding: "utf8" });
}

function migration(name) {
  return readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
}

function rows(db, query) {
  const output = execFileSync("sqlite3", ["-json", db, query], { encoding: "utf8" });
  return output.trim() ? JSON.parse(output) : [];
}

describe("migration 003 schedule reminders", () => {
  it("upgrades existing rows without silently enabling delivery", () => {
    const db = database();
    sql(db, migration("001_init.sql"));
    sql(db, migration("002_indexes.sql"));
    sql(db, `
      INSERT INTO app_medication_tracker__medications
        (id, member_id, name, schedule_slots, archived, created_at)
      VALUES
        ('morning', 'm1', 'Morning med', '["morning","bedtime"]', 0, '2026-01-01'),
        ('archived', 'm1', 'Old med', '["afternoon"]', 1, '2025-01-01');
      INSERT INTO app_medication_tracker__doses
        (medication_id, dose_date, slot, taken_at, logged_by)
      VALUES ('morning', '2026-07-27', 'morning', '2026-07-27T08:00:00Z', 'm1');
    `);

    sql(db, migration("003_schedule_reminders.sql"));

    expect(rows(db, `SELECT id, reminder_times, reminders_on, buddy_member_ids
                       FROM app_medication_tracker__medications ORDER BY id`)).toEqual([
      { id: "archived", reminder_times: '["13:00"]', reminders_on: 0, buddy_member_ids: "[]" },
      { id: "morning", reminder_times: '["08:00","21:00"]', reminders_on: 0, buddy_member_ids: "[]" },
    ]);
    expect(rows(db, `SELECT slot, logged_by FROM app_medication_tracker__doses`))
      .toEqual([{ slot: "morning", logged_by: "m1" }]);
  });

  it("keeps reminders available by default for newly-created rows", () => {
    const db = database();
    sql(db, migration("001_init.sql"));
    sql(db, migration("002_indexes.sql"));
    sql(db, migration("003_schedule_reminders.sql"));
    sql(db, `
      INSERT INTO app_medication_tracker__medications
        (id, member_id, name, created_at)
      VALUES ('new', 'm1', 'New med', '2026-07-28');
    `);
    expect(rows(db, `SELECT reminders_on, buddy_member_ids
                       FROM app_medication_tracker__medications WHERE id = 'new'`))
      .toEqual([{ reminders_on: 1, buddy_member_ids: "[]" }]);
  });
});

// Dose history is the app's only time-driven growth: one row per medication
// per day per slot, forever. A household on three daily medications writes
// ~1,100 rows a year and nothing ever removed them. Retention is keyed on
// `dose_date` because 002 already indexes it (the hub requires an index
// leading on the timestamp column) and the runner truncates its cutoff to a
// date for `_date`-suffixed columns. `doses` has a composite primary key and
// no `id`, hence the documented "rowid" escape hatch; `override_key` lets an
// admin lengthen or shorten the window per household.
describe("dose retention", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../manifest.json", import.meta.url), "utf-8"),
  );

  it("expires dose history on an indexed, plaintext date column", () => {
    expect(manifest.row_policies.doses.retain_days).toEqual({
      default: 730,
      timestamp_column: "dose_date",
      id_column: "rowid",
      override_key: "dose_history",
    });
    const indexes = readFileSync(new URL("../migrations/002_indexes.sql", import.meta.url), "utf-8");
    expect(indexes).toMatch(/INDEX[^\n]*app_medication_tracker__doses \(dose_date\)/);
  });
});
