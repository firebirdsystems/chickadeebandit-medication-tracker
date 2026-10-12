import { describe, it, expect } from "vitest";
import {
  initial, memberColor, AVATAR_COLORS,
  SLOT_LABELS, ALL_SLOTS,
  parseJsonArray,
  canViewMedication, canManageMedications, canEditMedication,
  managesMedications, canAddMedication,
  isDoseTaken, existingDoseKey, slotFromDoseKey, nextTodayKey,
  allDosesComplete, groupByMember,
  isClockTime, formatTime, normalizeTimes, normalizeDaysMask, normalizeMemberIds,
  medicationTimes, remindersEnabled, MAX_TIMES,
  withArchivedState, searchableFields,
  isDueOn, showsToday,
  daysBefore, reportRange, reportUrl,
} from "../src/logic.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────
const MEMBERS = [
  { id: "adult-1", name: "Alex",   role: "adult" },
  { id: "adult-2", name: "Sam",    role: "adult" },
  { id: "kid-1",   name: "Jordan", role: "child" },
  { id: "kid-2",   name: "Casey",  role: "child" },
];

function med(overrides = {}) {
  return {
    id: "m1",
    member_id: "kid-1",
    name: "Allergy Tablet",
    dosage: "10mg",
    notes: "",
    schedule_slots: '["morning","evening"]',
    archived: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ── initial() ─────────────────────────────────────────────────────────────────
describe("initial", () => {
  it("returns first char uppercased", () => {
    expect(initial("alex")).toBe("A");
    expect(initial("Sam")).toBe("S");
  });

  it("returns ? for falsy input", () => {
    expect(initial("")).toBe("?");
    expect(initial(null)).toBe("?");
  });
});

// ── memberColor() ─────────────────────────────────────────────────────────────
describe("memberColor", () => {
  it("returns a color from the palette", () => {
    expect(AVATAR_COLORS).toContain(memberColor("adult-1"));
  });

  it("is deterministic", () => {
    expect(memberColor("kid-1")).toBe(memberColor("kid-1"));
  });
});

// todayDate() was retired: it built the day from the VIEWER DEVICE's clock,
// while every dose row and every server-side surface is on the HOUSEHOLD's
// calendar. index.html now takes the day from the SDK's hubToday().
describe("nextTodayKey takes a day string, never a Date", () => {
  it("does not accept a Date — that is how the device clock crept back in", () => {
    const d = new Date("2026-06-02T00:01:00");
    // A Date would compare unequal to the stored string forever, so the app
    // would think the day rolled over on every tick.
    expect(nextTodayKey("2026-06-02", d).today).not.toBe("2026-06-02");
    expect(nextTodayKey("2026-06-02", "2026-06-02").changed).toBe(false);
  });
});

// ── parseJsonArray() ──────────────────────────────────────────────────────────
describe("parseJsonArray", () => {
  it("parses a JSON string", () => {
    expect(parseJsonArray('["morning","evening"]')).toEqual(["morning", "evening"]);
  });

  it("returns a plain array as-is", () => {
    expect(parseJsonArray(["morning"])).toEqual(["morning"]);
  });

  it("returns [] on invalid JSON", () => {
    expect(parseJsonArray("not-json")).toEqual([]);
  });

  it("returns [] for null/undefined", () => {
    expect(parseJsonArray(null)).toEqual([]);
    expect(parseJsonArray(undefined)).toEqual([]);
  });
});

// ── canViewMedication() ───────────────────────────────────────────────────────
describe("canViewMedication", () => {
  it("owner can always view their own medication", () => {
    const m = med({ member_id: "kid-1" });
    expect(canViewMedication(m, MEMBERS[2], MEMBERS)).toBe(true); // kid-1
    expect(canViewMedication(m, MEMBERS[0], MEMBERS)).toBe(true); // adult-1 is adult
  });

  it("adult can view any child's medication", () => {
    const m = med({ member_id: "kid-1" });
    expect(canViewMedication(m, MEMBERS[0], MEMBERS)).toBe(true); // adult-1
    expect(canViewMedication(m, MEMBERS[1], MEMBERS)).toBe(true); // adult-2
  });

  it("child cannot view another child's medication", () => {
    const m = med({ member_id: "kid-1" });
    expect(canViewMedication(m, MEMBERS[3], MEMBERS)).toBe(false); // kid-2
  });

  it("adult can view another adult's medication", () => {
    const m = med({ member_id: "adult-1" });
    expect(canViewMedication(m, MEMBERS[1], MEMBERS)).toBe(true); // adult-2
  });

  it("returns false when me is null", () => {
    const m = med();
    expect(canViewMedication(m, null, MEMBERS)).toBe(false);
  });
});

// ── canManageMedications() ────────────────────────────────────────────────────
describe("canManageMedications", () => {
  it("returns true for adults", () => {
    expect(canManageMedications(MEMBERS[0])).toBe(true);
    expect(canManageMedications({ id: "a", name: "Admin", role: "admin" })).toBe(true);
  });

  it("returns false for children", () => {
    expect(canManageMedications(MEMBERS[2])).toBe(false);
  });

  it("returns false when me is null", () => {
    expect(canManageMedications(null)).toBe(false);
  });
});

// ── canEditMedication() ───────────────────────────────────────────────────────
describe("canEditMedication", () => {
  it("adult can edit their own medication", () => {
    const m = med({ member_id: "adult-1" });
    expect(canEditMedication(m, MEMBERS[0], MEMBERS)).toBe(true);
  });

  it("adult can edit a child's medication", () => {
    const m = med({ member_id: "kid-1" });
    expect(canEditMedication(m, MEMBERS[0], MEMBERS)).toBe(true);
  });

  it("adult cannot edit another adult's medication", () => {
    const m = med({ member_id: "adult-2" });
    expect(canEditMedication(m, MEMBERS[0], MEMBERS)).toBe(false);
  });

  it("child cannot edit any medication", () => {
    const m = med({ member_id: "kid-1" });
    expect(canEditMedication(m, MEMBERS[2], MEMBERS)).toBe(false);
  });

  it("a shared space's steward can edit another adult's medication; a participant cannot", () => {
    const m = med({ member_id: "adult-2" });
    expect(canEditMedication(m, MEMBERS[0], MEMBERS, { tenantKind: "shared_space", spaceKind: "roster", isAdmin: true })).toBe(true);
    expect(canEditMedication(m, MEMBERS[0], MEMBERS, { tenantKind: "shared_space", spaceKind: "general", isAdmin: false })).toBe(false);
  });
});

// ── isDoseTaken() ─────────────────────────────────────────────────────────────
describe("isDoseTaken", () => {
  it("returns false when doses is empty", () => {
    expect(isDoseTaken({}, "m1", "morning", "2026-06-01")).toBe(false);
  });

  it("returns true when the dose key exists", () => {
    const doses = { "m1__2026-06-01__morning": true };
    expect(isDoseTaken(doses, "m1", "morning", "2026-06-01")).toBe(true);
  });

  it("returns false for a different slot", () => {
    const doses = { "m1__2026-06-01__morning": true };
    expect(isDoseTaken(doses, "m1", "evening", "2026-06-01")).toBe(false);
  });

  it("returns false for a different date", () => {
    const doses = { "m1__2026-06-01__morning": true };
    expect(isDoseTaken(doses, "m1", "morning", "2026-06-02")).toBe(false);
  });
});

// ── allDosesComplete() ────────────────────────────────────────────────────────
describe("allDosesComplete", () => {
  it("returns false when no slots are taken", () => {
    const m = med({ schedule_slots: '["morning","evening"]' });
    expect(allDosesComplete(m, {}, "2026-06-01")).toBe(false);
  });

  it("returns false when only some slots are taken", () => {
    const m = med({ schedule_slots: '["morning","evening"]' });
    const doses = { "m1__2026-06-01__morning": true };
    expect(allDosesComplete(m, doses, "2026-06-01")).toBe(false);
  });

  it("returns true when all slots are taken", () => {
    const m = med({ schedule_slots: '["morning","evening"]' });
    const doses = {
      "m1__2026-06-01__morning": true,
      "m1__2026-06-01__evening": true,
    };
    expect(allDosesComplete(m, doses, "2026-06-01")).toBe(true);
  });

  it("returns false for empty schedule_slots", () => {
    const m = med({ schedule_slots: "[]" });
    expect(allDosesComplete(m, {}, "2026-06-01")).toBe(false);
  });
});

// ── groupByMember() ───────────────────────────────────────────────────────────
describe("groupByMember", () => {
  it("groups medications by member_id", () => {
    const meds = [
      med({ id: "m1", member_id: "kid-1" }),
      med({ id: "m2", member_id: "kid-1" }),
      med({ id: "m3", member_id: "adult-1" }),
    ];
    const result = groupByMember(meds);
    expect(result.get("kid-1")).toHaveLength(2);
    expect(result.get("adult-1")).toHaveLength(1);
  });

  it("returns an empty Map for an empty array", () => {
    expect(groupByMember([]).size).toBe(0);
  });
});

// ── SLOT_LABELS / ALL_SLOTS ───────────────────────────────────────────────────
describe("SLOT_LABELS", () => {
  it("has a label for every slot in ALL_SLOTS", () => {
    for (const s of ALL_SLOTS) {
      expect(SLOT_LABELS[s]).toBeTruthy();
    }
  });
});

// ── 1.1.0: clock-time schedules ───────────────────────────────────────────────

describe("clock-time schedule", () => {
  it("validates clock times", () => {
    expect(isClockTime("08:00")).toBe(true);
    expect(isClockTime("23:59")).toBe(true);
    expect(isClockTime("8:00")).toBe(false);   // must be zero-padded
    expect(isClockTime("24:00")).toBe(false);
    expect(isClockTime("08:60")).toBe(false);
    expect(isClockTime(800)).toBe(false);
  });

  it("formats times for display", () => {
    expect(formatTime("08:00")).toBe("8:00 AM");
    expect(formatTime("00:30")).toBe("12:30 AM");
    expect(formatTime("12:00")).toBe("12:00 PM");
    expect(formatTime("21:05")).toBe("9:05 PM");
  });

  it("normalizes times: valid only, de-duplicated, sorted, bounded", () => {
    expect(normalizeTimes(["20:00", "08:00", "08:00", "nope"])).toEqual(["08:00", "20:00"]);
    expect(normalizeTimes(null)).toEqual([]);
    expect(normalizeTimes(Array.from({ length: 40 }, (_, i) =>
      `${String(i % 24).padStart(2, "0")}:00`)).length).toBeLessThanOrEqual(MAX_TIMES);
  });

  it("reads reminder_times when present", () => {
    expect(medicationTimes({ reminder_times: '["08:00","20:00"]' })).toEqual(["08:00", "20:00"]);
  });

  it("falls back to legacy schedule_slots so pre-migration rows still work", () => {
    // A row that predates migration 003 must not look like it has no schedule.
    expect(medicationTimes({ schedule_slots: '["morning","evening"]' })).toEqual(["08:00", "18:00"]);
  });

  it("prefers reminder_times over legacy slots", () => {
    expect(medicationTimes({
      reminder_times: '["09:30"]', schedule_slots: '["morning","evening"]',
    })).toEqual(["09:30"]);
  });

  it("counts a legacy named-slot dose as taken for its mapped time", () => {
    // Upgrading mid-day must not silently un-tick what was already taken.
    const doses = { "m1__2026-06-01__morning": true };
    expect(isDoseTaken(doses, "m1", "08:00", "2026-06-01")).toBe(true);
    expect(isDoseTaken(doses, "m1", "20:00", "2026-06-01")).toBe(false);
  });

  it("returns the real legacy key so undo deletes the stored completion", () => {
    const doses = { "m1__2026-06-01__morning": { loggedBy: "adult-1" } };
    const key = existingDoseKey(doses, "m1", "08:00", "2026-06-01");
    expect(key).toBe("m1__2026-06-01__morning");
    expect(slotFromDoseKey(key, "2026-06-01")).toBe("morning");
  });

  it("prefers a new clock-time completion when both encodings exist", () => {
    const doses = {
      "m1__2026-06-01__morning": true,
      "m1__2026-06-01__08:00": true,
    };
    expect(existingDoseKey(doses, "m1", "08:00", "2026-06-01"))
      .toBe("m1__2026-06-01__08:00");
  });

  it("detects local-midnight rollover for a long-lived tab", () => {
    expect(nextTodayKey("2026-06-01", "2026-06-02"))
      .toEqual({ today: "2026-06-02", changed: true });
    expect(nextTodayKey("2026-06-02", "2026-06-02").changed).toBe(false);
  });

  it("normalizes recurrence days and explicit member recipients", () => {
    expect(normalizeDaysMask(["5", "1", "5", "9", "nope"])).toBe("1,5");
    expect(normalizeMemberIds([" member-2 ", "member-1", "member-2", ""]))
      .toBe('["member-1","member-2"]');
    expect(normalizeMemberIds([])).toBe("[]");
  });

  it("treats allDosesComplete over clock times", () => {
    const med = { id: "m1", reminder_times: '["08:00","20:00"]' };
    const partial = { "m1__2026-06-01__08:00": true };
    expect(allDosesComplete(med, partial, "2026-06-01")).toBe(false);
    expect(allDosesComplete(med, { ...partial, "m1__2026-06-01__20:00": true }, "2026-06-01")).toBe(true);
  });

  it("reads the per-row reminder off switch", () => {
    expect(remindersEnabled({ reminders_on: 1 })).toBe(true);
    expect(remindersEnabled({ reminders_on: 0 })).toBe(false);
    expect(remindersEnabled({})).toBe(true); // absent column defaults to on
  });

  it("keeps reminders off across archive and restore", () => {
    const archived = withArchivedState({ id: "m1", reminders_on: 1 }, true);
    expect(archived).toMatchObject({ archived: 1, reminders_on: 0 });
    expect(withArchivedState(archived, false))
      .toMatchObject({ archived: 0, reminders_on: 0 });
  });
});

describe("searchableFields", () => {
  it("matches on dosage and notes, not just the medication name", () => {
    const fields = searchableFields({ name: "Amoxicillin", dosage: "5mg", notes: "with food" });
    expect(fields).toContain("5mg");
    expect(fields).toContain("with food");
  });
});

// ── tenant-aware gates ────────────────────────────────────────────────────────
describe("managesMedications", () => {
  const adult = MEMBERS[0], child = MEMBERS[2];
  const space = { tenantKind: "shared_space", spaceKind: "general" };

  it("is any adult in a household, the default tenant", () => {
    expect(managesMedications(adult)).toBe(true);
    expect(managesMedications(adult, { tenantKind: "household" })).toBe(true);
    expect(managesMedications(child)).toBe(false);
    expect(managesMedications(null)).toBe(false);
  });
  it("is not an adult who takes part in a shared space", () => {
    expect(managesMedications(adult, { ...space, isAdmin: false })).toBe(false);
    expect(managesMedications(adult, { tenantKind: "shared_space", spaceKind: "roster", isAdmin: false })).toBe(false);
  });
  it("is the steward of a general, roster or co-parenting space", () => {
    for (const spaceKind of ["general", "roster", "coparenting"]) {
      expect(managesMedications(adult, { tenantKind: "shared_space", spaceKind, isAdmin: true })).toBe(true);
    }
  });
});

describe("canAddMedication", () => {
  const adult = MEMBERS[0], child = MEMBERS[2];

  it("follows managing at home: adults add, children do not", () => {
    expect(canAddMedication(adult)).toBe(true);
    expect(canAddMedication(child)).toBe(false);
    expect(canAddMedication(null)).toBe(false);
  });
  it("lets an adult who takes part in a general or co-parenting space add their own", () => {
    expect(canAddMedication(adult, { tenantKind: "shared_space", spaceKind: "general", isAdmin: false })).toBe(true);
    expect(canAddMedication(adult, { tenantKind: "shared_space", spaceKind: "coparenting", isAdmin: false })).toBe(true);
  });
  it("refuses a child in a space", () => {
    expect(canAddMedication(child, { tenantKind: "shared_space", spaceKind: "general", isAdmin: false })).toBe(false);
  });
  it("is the steward alone in a roster", () => {
    expect(canAddMedication(adult, { tenantKind: "shared_space", spaceKind: "roster", isAdmin: false })).toBe(false);
    expect(canAddMedication(adult, { tenantKind: "shared_space", spaceKind: "roster", isAdmin: true })).toBe(true);
  });
});

describe("medication gates in a shared space", () => {
  const adult = MEMBERS[0];
  const participant = { tenantKind: "shared_space", spaceKind: "general", isAdmin: false };
  const steward = { tenantKind: "shared_space", spaceKind: "general", isAdmin: true };

  it("a participant sees only their own medications and edits none", () => {
    expect(canViewMedication(med({ member_id: "adult-1" }), adult, MEMBERS, participant)).toBe(true);
    expect(canViewMedication(med({ member_id: "kid-1" }), adult, MEMBERS, participant)).toBe(false);
    expect(canManageMedications(adult, participant)).toBe(false);
    expect(canEditMedication(med({ member_id: "adult-1" }), adult, MEMBERS, participant)).toBe(false);
    expect(canEditMedication(med({ member_id: "kid-1" }), adult, MEMBERS, participant)).toBe(false);
  });
  it("the steward sees and edits every medication, another adult's included", () => {
    expect(canViewMedication(med({ member_id: "adult-2" }), adult, MEMBERS, steward)).toBe(true);
    expect(canManageMedications(adult, steward)).toBe(true);
    expect(canEditMedication(med({ member_id: "adult-1" }), adult, MEMBERS, steward)).toBe(true);
    expect(canEditMedication(med({ member_id: "kid-1" }), adult, MEMBERS, steward)).toBe(true);
    expect(canEditMedication(med({ member_id: "adult-2" }), adult, MEMBERS, steward)).toBe(true);
  });
});

describe("isDueOn", () => {
  // 2026-10-12 is a Monday.
  it("treats a medication with no schedule limits as due every day", () => {
    expect(isDueOn({ days_mask: "", every_n_days: 1, started_on: "", ends_on: "" }, "2026-10-12")).toBe(true);
    expect(isDueOn({ days_mask: "", every_n_days: null, started_on: null, ends_on: null }, "2026-10-12")).toBe(true);
    expect(isDueOn({}, "2026-10-12")).toBe(true);
  });

  it("honours the chosen weekdays, Monday as 1 through Sunday as 7", () => {
    const mwf = { days_mask: "1,3,5" };
    expect(isDueOn(mwf, "2026-10-12")).toBe(true);   // Mon
    expect(isDueOn(mwf, "2026-10-13")).toBe(false);  // Tue
    expect(isDueOn(mwf, "2026-10-16")).toBe(true);   // Fri
    expect(isDueOn({ days_mask: "7" }, "2026-10-18")).toBe(true);   // Sun
    expect(isDueOn({ days_mask: "7" }, "2026-10-17")).toBe(false);  // Sat
  });

  it("is not due before the course starts or after it ends", () => {
    const course = { started_on: "2026-10-10", ends_on: "2026-10-14" };
    expect(isDueOn(course, "2026-10-09")).toBe(false);
    expect(isDueOn(course, "2026-10-10")).toBe(true);
    expect(isDueOn(course, "2026-10-14")).toBe(true);
    expect(isDueOn(course, "2026-10-15")).toBe(false);
  });

  it("counts every-N-days from the start date, across a month boundary", () => {
    const everyThird = { every_n_days: 3, started_on: "2026-10-30" };
    expect(isDueOn(everyThird, "2026-10-30")).toBe(true);
    expect(isDueOn(everyThird, "2026-10-31")).toBe(false);
    expect(isDueOn(everyThird, "2026-11-02")).toBe(true);
  });

  it("ignores an interval that has no start date to count from", () => {
    expect(isDueOn({ every_n_days: 3, started_on: "" }, "2026-10-13")).toBe(true);
  });
});

describe("showsToday", () => {
  const offDay = { id: "m1", days_mask: "1" }; // Mondays only

  it("lists a medication on a day it is due", () => {
    expect(showsToday(offDay, {}, "2026-10-12")).toBe(true);
  });

  it("leaves it off a day it is not due", () => {
    expect(showsToday(offDay, {}, "2026-10-13")).toBe(false);
  });

  it("keeps it listed on an off day once a dose was logged that day", () => {
    expect(showsToday(offDay, { "m1__2026-10-13__08:00": true }, "2026-10-13")).toBe(true);
    expect(showsToday(offDay, { "m1__2026-10-12__08:00": true }, "2026-10-13")).toBe(false);
    expect(showsToday(offDay, { "m10__2026-10-13__08:00": true }, "2026-10-13")).toBe(false);
  });
});

describe("daysBefore", () => {
  it("counts back on the calendar, across a month, a year and a leap day", () => {
    expect(daysBefore("2026-10-11", 90)).toBe("2026-07-13");
    expect(daysBefore("2027-01-15", 90)).toBe("2026-10-17");
    expect(daysBefore("2028-03-31", 90)).toBe("2028-01-01");
    expect(daysBefore("2026-10-11", 0)).toBe("2026-10-11");
  });

  it("is empty when it is not given a date", () => {
    expect(daysBefore("", 90)).toBe("");
    expect(daysBefore(null, 90)).toBe("");
    expect(daysBefore("today", 90)).toBe("");
  });
});

describe("reportRange", () => {
  it("asks for the courses running today, and for the last days of doses", () => {
    expect(reportRange("current_medications", "2026-10-12", 90)).toEqual({ from: "2026-10-12", to: "2026-10-12" });
    // Both ends are in the document, so 90 days ending 12 October start on 15 July.
    expect(reportRange("doses_taken", "2026-10-12", 90)).toEqual({ from: "2026-07-15", to: "2026-10-12" });
    expect(reportRange("doses_taken", "2026-10-12", 1)).toEqual({ from: "2026-10-12", to: "2026-10-12" });
  });

  it("leaves both ends open without a household date", () => {
    expect(reportRange("current_medications", "", 90)).toEqual({ from: "", to: "" });
    expect(reportRange("doses_taken", null, 90)).toEqual({ from: "", to: "" });
    expect(reportRange("current_medications", "today", 90)).toEqual({ from: "", to: "" });
  });
});

describe("reportUrl", () => {
  const base = "https://hub.example/run/medication-tracker/";

  it("addresses one document with its format and dates", () => {
    expect(reportUrl("/run/medication-tracker/api/reports", "doses_taken", "html", "2026-07-13", "2026-10-11", base))
      .toBe("https://hub.example/run/medication-tracker/api/reports/doses_taken?format=html&from=2026-07-13&to=2026-10-11");
  });

  it("leaves an empty bound off, which asks for every date on that side", () => {
    expect(reportUrl("/run/medication-tracker/api/reports", "current_medications", "csv", "", "", base))
      .toBe("https://hub.example/run/medication-tracker/api/reports/current_medications?format=csv");
  });

  it("escapes the view id", () => {
    expect(reportUrl("/r", "a/b?c", "html", "", "", base)).toBe("https://hub.example/r/a%2Fb%3Fc?format=html");
  });
});
