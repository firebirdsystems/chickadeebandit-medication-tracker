import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/index.html", import.meta.url), "utf8");

describe("medication UI safety contract", () => {
  it("loads and surfaces the hub's monitored-reminder status", () => {
    expect(source).toContain('const REMINDER_STATUS = "api/reminders-schedule-status"');
    expect(source).toContain("unmonitored_row_ids");
    expect(source).toContain("Reminder not monitored");
  });

  it("rejects unsuccessful DB responses and rolls optimistic dose state back", () => {
    expect(source).toContain("if (!res.ok || body?.error)");
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
