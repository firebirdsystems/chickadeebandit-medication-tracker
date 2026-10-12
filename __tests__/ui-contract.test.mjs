import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");

const manifest = JSON.parse(readFileSync(new URL("../manifest.json", import.meta.url), "utf8"));

describe("printed lists", () => {
  it("offers exactly the documents the manifest declares", () => {
    // A button for a view the manifest does not declare opens a 404 in a new
    // tab; a declared view with no button is a document nobody can reach.
    const offered = [...source.matchAll(/row\("([a-z_]+)", "/g)].map((m) => m[1]).sort();
    expect(offered).toEqual(manifest.reports.views.map((v) => v.id).sort());
  });

  it("dates every list on the household's calendar", () => {
    // Both views take a range, so a list opened with none would be open-ended:
    // every course ever entered, under a button that says "today".
    const ranged = manifest.reports.views.filter((v) => /:range_start/.test(v.source.query) && /:range_end/.test(v.source.query)).map((v) => v.id);
    expect(ranged.sort()).toEqual(["current_medications", "doses_taken"]);
    expect(source).toContain("reportRange(id, hubToday(), PRINT_DAYS)");
  });

  it("copies the dosage onto the tick, so the history does not follow later edits", () => {
    expect(source).toContain("(medication_id, dose_date, slot, taken_at, logged_by, dosage)");
    expect(source).toContain('medications.find(m => m.id === medId)?.dosage ?? ""');
    expect(manifest.reports.views.find((v) => v.id === "doses_taken").source.query).toContain("COALESCE(d.dosage, m.dosage) AS dose");
  });
});

describe("medication UI safety contract", () => {
  it("loads and surfaces the hub's monitored-reminder status", () => {
    expect(source).toContain('const REMINDER_STATUS = "api/reminders-schedule-status"');
    expect(source).toContain("unmonitored_row_ids");
    expect(source).toContain("Reminder not monitored");
  });

  it("rejects unsuccessful DB responses and rolls optimistic dose state back", () => {
    expect(source).toContain('if (!res.ok || !body || typeof body !== "object" || body.error)');
    expect(source).toContain("Could not mark this dose taken");
    expect(source).toContain("Could not undo this dose");
  });

  it("deletes the actual stored legacy slot and lets row policy govern ownership", () => {
    expect(source).toContain("slotFromDoseKey(storedKey, TODAY)");
    expect(source).toContain("WHERE medication_id = ? AND dose_date = ? AND slot = ?");
    expect(source).not.toContain("AND logged_by = ?");
  });

  it("refreshes a long-lived tab on focus, visibility changes, and a timer", () => {
    expect(source).toContain('window.addEventListener("focus"');
    expect(source).toContain('document.addEventListener("visibilitychange"');
    expect(source).toContain("refreshLocalDay");
    expect(source).toContain("setInterval");
  });

  it("exposes recurrence, course dates, recipients, and escalation controls", () => {
    for (const id of [
      "f-started-on", "f-ends-on", "f-every-n-days",
      "f-remind-member", "f-buddy-member",
    ]) expect(source).toContain(id);
  });
});
