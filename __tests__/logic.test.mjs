import { describe, it, expect } from "vitest";
import {
  initial, memberColor, AVATAR_COLORS,
  SLOT_LABELS, ALL_SLOTS,
  todayDate, parseJsonArray,
  canViewMedication, canManageMedications, canEditMedication,
  isDoseTaken, existingDoseKey, slotFromDoseKey, nextTodayKey,
  allDosesComplete, groupByMember,
  isClockTime, formatTime, normalizeTimes, normalizeDaysMask, normalizeMemberIds,
  medicationTimes, remindersEnabled, MAX_TIMES,
  withArchivedState, searchableFields,
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

// ── todayDate() ───────────────────────────────────────────────────────────────
describe("todayDate", () => {
  it("returns a YYYY-MM-DD string", () => {
    expect(todayDate(new Date("2026-06-01T10:00:00"))).toBe("2026-06-01");
  });

  it("pads month and day", () => {
    expect(todayDate(new Date("2026-01-05T00:00:00"))).toBe("2026-01-05");
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
    expect(nextTodayKey("2026-06-01", new Date("2026-06-02T00:01:00")))
      .toEqual({ today: "2026-06-02", changed: true });
    expect(nextTodayKey("2026-06-02", new Date("2026-06-02T23:59:00")).changed).toBe(false);
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
