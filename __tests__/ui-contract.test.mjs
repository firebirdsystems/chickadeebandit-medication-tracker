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
    expect(source).toContain('failureLine(error, { action: "mark the dose taken", thing: "dose" })');
    expect(source).toContain('failureLine(error, { action: "undo the dose", thing: "dose" })');
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

  it("re-reads medications when the tab is returned to, once for both return events", () => {
    // A list loaded once keeps showing a medication its owner has since made
    // private. focus and visibilitychange both fire on one return.
    expect(source).toContain('window.addEventListener("focus", () => { void refreshOnReturn(); });');
    expect(source).toContain("if (!document.hidden) void refreshOnReturn();");
    expect(source).toContain("refreshInFlight ??= rereadOnReturn().finally(() => { refreshInFlight = null; });");
    expect(source).toContain("await Promise.allSettled([fetchMedications(), fetchDoses(day)]);");
    // The demo has no hub to re-read from, and its loaders reset what was tried.
    expect(source).toContain("if (!DB) { await loadReminderStatus(); render(); return; }");
  });

  it("owes a re-read it could not make, and pays it when the form closes or the write settles", () => {
    // Skipping under an open form is only safe if cancelling that form re-reads.
    expect(source).toContain("if (!canRereadNow({ modalOpen: !!modalEl, writesInFlight })) { refreshOwed = true; return; }");
    expect(source).toContain("function closeModal() { modalEl?.remove(); modalEl = null; settleOwedRefresh(); }");
    expect(source).toContain("if (write) { writesInFlight--; settleOwedRefresh(); }");
  });

  it("drops a re-read a write overtook, and reads the doses for the day the page is on", () => {
    expect(source).toContain("if (write) { writeEpoch++; writesInFlight++; }");
    expect(source).toContain("if (!rereadStillCurrent({ epochAtStart, writeEpoch, modalOpen: !!modalEl, writesInFlight })) {");
    // Counted before the rollover's wait, or a dose ticked during it reads as seen.
    expect(source.indexOf("const epochAtStart = writeEpoch;"))
      .toBeLessThan(source.indexOf("await refreshLocalDay().catch(() => {});\n  const day = TODAY;"));
    expect(source.indexOf("const epochAtStart = writeEpoch;")).toBeGreaterThan(-1);
    expect(source).toContain('if (dosesForDay.status === "fulfilled" && day === TODAY) doses = dosesForDay.value;');
  });

  it("says so when the re-read fails, since the list may show what is no longer shared", () => {
    // The medication read decides it: a failed dose read alone neither keeps a
    // no-longer-shared medication on screen nor raises the note.
    expect(source).toContain('refreshFailed = meds.status === "rejected";');
    expect(source).toContain('if (meds.status === "fulfilled") {');
    // Any later full read of the list takes the note down again.
    expect(source).toMatch(/archivedMeds = fresh\.archived;\n  \/\/ Any full read[^\n]*\n  refreshFailed = false;/);
    expect(source).toContain('data-testid="refresh-error"');
    expect(source).toContain('case "refresh-now": void refreshOnReturn(); break;');
  });

  it("puts the recipient ticks back when a medication is shared again in the same form", () => {
    expect(source).toContain('box.dataset.wasChecked = box.checked ? "yes" : "no";');
    expect(source).toContain('box.checked = box.dataset.wasChecked === "yes";');
  });

  it("saves an untouched reminder list as the owner default and a private one's lists as the owner's alone", () => {
    expect(source).toContain('const remindMemberIds = reminderRecipientsValue(checked("f-remind-member"));');
    expect(source).toContain('const buddyMemberIds = normalizeMemberIds(checked("f-buddy-member"));');
    expect(source).toContain("visibility, memberId);");
  });

  it("never lets an empty reminder list switch a reminder off", () => {
    // The off switch is `reminders_on`. An empty list is what the hub's
    // prune_list leaves when the last named recipient is removed, so the lane
    // reads it as the owner; the escalation list keeps "empty means off",
    // which is the choice its form offers.
    expect(manifest.schedule_reminders.enabled_column).toBe("reminders_on");
    expect(manifest.schedule_reminders.nudge.empty_list).toBe("audience");
    expect(manifest.schedule_reminders.escalation.empty_list).toBeUndefined();
    expect(manifest.member_references.medications).toContainEqual({ column: "remind_member_ids", on_removed: "prune_list" });
  });

  it("names visibility in a write only for the person the medication is for", () => {
    // The hub guards the column to its adult owner; naming it in anyone
    // else's statement would change no row or refuse the insert.
    expect(manifest.row_policies.medications.column_write_acls.visibility).toEqual({ writable_by: ["adult_owner"] });
    expect(source).toContain('remind_member_ids=?, buddy_member_ids=?${choosesVisibility ? ", visibility=?" : ""}');
    expect(source).toContain('${choosesVisibility ? "visibility, " : ""}archived, created_at)');
    expect(source).not.toMatch(/buddy_member_ids=\?, visibility=\?/);
  });

  it("exposes recurrence, course dates, recipients, and escalation controls", () => {
    for (const id of [
      "f-started-on", "f-ends-on", "f-every-n-days",
      "f-remind-member", "f-buddy-member",
    ]) expect(source).toContain(id);
  });
});
