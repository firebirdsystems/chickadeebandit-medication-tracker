import { describe, it, expect } from "vitest";
import {
  initial, memberColor, AVATAR_COLORS,
  SLOT_LABELS, ALL_SLOTS,
  todayDate, parseJsonArray,
  canViewMedication, canManageMedications, canEditMedication,
  isDoseTaken, allDosesComplete, groupByMember,
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
    shared_with: "[]",
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

  it("adult cannot view another adult's medication when not shared", () => {
    const m = med({ member_id: "adult-1", shared_with: "[]" });
    expect(canViewMedication(m, MEMBERS[1], MEMBERS)).toBe(false); // adult-2
  });

  it("adult can view another adult's medication when shared with them", () => {
    const m = med({ member_id: "adult-1", shared_with: '["adult-2"]' });
    expect(canViewMedication(m, MEMBERS[1], MEMBERS)).toBe(true);
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
