/**
 * Pure business logic for the Medication Tracker app.
 * No DOM, no fetch — importable in both browser and test environments.
 */

export { AVATAR_COLORS, memberColor, initial, esc, isAdult } from "./shared.js";

export const SLOT_LABELS = {
  morning:   "Morning",
  afternoon: "Afternoon",
  evening:   "Evening",
  bedtime:   "Bedtime",
};

export const ALL_SLOTS = ["morning", "afternoon", "evening", "bedtime"];

/**
 * Clock time each legacy named slot maps to. From 1.1.0 a medication's schedule
 * is a list of wall-clock times rather than four fixed slots: that is what lets
 * the hub nudge "8:00 — did you take it?" and escalate a missed dose, and it
 * removes the old ceiling of one dose per named slot per day.
 *
 * Kept exported (with SLOT_LABELS/ALL_SLOTS) so migration 003's backfill and the
 * legacy-data path have one shared definition.
 */
export const SLOT_TIMES = {
  morning:   "08:00",
  afternoon: "13:00",
  evening:   "18:00",
  bedtime:   "21:00",
};

/** Longest schedule we let a single medication declare. Matches the hub's
 *  MAX_TIMES_PER_ROW so the UI can't create a row the cron will truncate. */
export const MAX_TIMES = 24;

/** "HH:MM" → true when it is a valid 24-hour clock time. */
export function isClockTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/** Human label for a clock time, e.g. "08:00" → "8:00 AM". */
export function formatTime(hhmm) {
  if (!isClockTime(hhmm)) return String(hhmm ?? "");
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** Rough time-of-day label, used only as a grouping hint in the UI. */
export function timeOfDayLabel(hhmm) {
  if (!isClockTime(hhmm)) return "";
  const hour = Number(hhmm.slice(0, 2));
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  if (hour < 21) return "Evening";
  return "Bedtime";
}

/** Normalize a list of times: valid only, de-duplicated, sorted, bounded. */
export function normalizeTimes(times) {
  return [...new Set((times ?? []).filter(isClockTime))].sort().slice(0, MAX_TIMES);
}

/** Normalize ISO weekday selections. An empty string means every day. */
export function normalizeDaysMask(days) {
  return [...new Set((days ?? []).map(Number)
    .filter(day => Number.isInteger(day) && day >= 1 && day <= 7))]
    .sort((a, b) => a - b)
    .join(",");
}

/** Normalize explicit reminder recipients as a stable JSON array. An empty
 * array is meaningful for escalation: it means nobody, not the default adults. */
export function normalizeMemberIds(ids) {
  return JSON.stringify([...new Set((ids ?? []).filter(id =>
    typeof id === "string" && id.trim()).map(id => id.trim()))].sort());
}

/**
 * A medication's schedule as clock times.
 *
 * Falls back to mapping the legacy `schedule_slots` when `reminder_times` is
 * absent, so a row that predates migration 003 (or one written by an older
 * client still in a browser tab) still renders a working schedule instead of
 * appearing to have none.
 */
export function medicationTimes(med) {
  const times = normalizeTimes(parseJsonArray(med?.reminder_times));
  if (times.length > 0) return times;
  const legacy = parseJsonArray(med?.schedule_slots)
    .map(slot => SLOT_TIMES[slot])
    .filter(Boolean);
  return normalizeTimes(legacy);
}

/** Whether the hub should be sending nudges for this medication. */
export function remindersEnabled(med) {
  return Number(med?.reminders_on ?? 1) !== 0;
}

/** Archive/restore state. Both directions keep reminders off: archiving is an
 * immediate stop signal, while restoring must not silently restart delivery. */
export function withArchivedState(med, archived) {
  return { ...med, archived: archived ? 1 : 0, reminders_on: 0 };
}

/**
 * Returns today's date as a YYYY-MM-DD string (local time).
 */
export function todayDate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Parses a JSON field that may be stored as a string or already be an array.
 * Returns an empty array on any error.
 */
export function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value) ?? []; } catch { return []; }
}

/**
 * Returns true if the current user can see a medication.
 *
 * Rules (mirrors the server-side `adult_writable` row policy):
 *  - Adults can see every medication in the household.
 *  - Children can only see their own medications.
 */
export function canViewMedication(med, me, members) {
  if (!me) return false;
  const isAdult = m => !!m && (m.role === "adult" || m.role === "admin");
  return isAdult(me) || med.member_id === me.id;
}

/**
 * Returns true if the current user can add, edit, or archive medications.
 * Only adults can manage medications (including for children).
 */
export function canManageMedications(me) {
  if (!me) return false;
  return me.role === "adult" || me.role === "admin";
}

/**
 * Returns true if the current user can edit a specific medication.
 * Adults can edit medications for children and their own; not other adults'.
 */
export function canEditMedication(med, me, members) {
  if (!canManageMedications(me)) return false;
  if (med.member_id === me.id) return true;
  const owner = members.find(m => m.id === med.member_id);
  const ownerIsAdult = !!owner && (owner.role === "adult" || owner.role === "admin");
  return !ownerIsAdult; // can edit children's meds, not other adults'
}

/**
 * Returns true if the given dose slot has been taken on the given date.
 * doses is a flat object keyed by `${medId}__${date}__${slot}`.
 */
export function isDoseTaken(doses, medId, slot, date) {
  return existingDoseKey(doses, medId, slot, date) !== null;
}

/** Return the stored completion key for a displayed clock-time slot. This is
 * also the key an undo must delete: pre-1.1 rows used names such as "morning",
 * so deleting only "08:00" would leave the real completion untouched. */
export function existingDoseKey(doses, medId, slot, date) {
  const direct = `${medId}__${date}__${slot}`;
  if (direct in doses) return direct;
  // Back-compat: doses ticked before 1.1.0 are keyed by the legacy NAMED slot
  // ("morning"), while the schedule is now keyed by clock time ("08:00"). Without
  // this, upgrading mid-day would silently un-tick everything already taken today.
  const legacy = LEGACY_SLOT_FOR_TIME[slot];
  const legacyKey = legacy ? `${medId}__${date}__${legacy}` : "";
  return legacyKey && legacyKey in doses ? legacyKey : null;
}

/** Extract the slot component from a dose map key without depending on ids
 * containing no punctuation. The date delimiter is the stable boundary. */
export function slotFromDoseKey(key, date) {
  const marker = `__${date}__`;
  const index = String(key).lastIndexOf(marker);
  return index === -1 ? "" : String(key).slice(index + marker.length);
}

/** Recompute the app's local date and report whether an open tab crossed
 * midnight. Kept pure so rollover behavior is testable without a browser. */
export function nextTodayKey(current, now = new Date()) {
  const next = todayDate(now);
  return { today: next, changed: next !== current };
}

/** Reverse of SLOT_TIMES, for reading dose rows written before 1.1.0. */
const LEGACY_SLOT_FOR_TIME = Object.fromEntries(
  Object.entries(SLOT_TIMES).map(([slot, time]) => [time, slot]),
);

/**
 * Returns true when every active schedule slot for a medication has been
 * taken on the given date.
 */
export function allDosesComplete(med, doses, date) {
  const times = medicationTimes(med);
  return times.length > 0 && times.every(time => isDoseTaken(doses, med.id, time, date));
}

/**
 * Groups an array of medications by member_id.
 * Returns a Map<member_id, medication[]>.
 */
export function groupByMember(medications) {
  const map = new Map();
  for (const med of medications) {
    if (!map.has(med.member_id)) map.set(med.member_id, []);
    map.get(med.member_id).push(med);
  }
  return map;
}

/**
 * Fields the in-app search matches against (see hub-sdk `searchMatch`).
 * Dosage and notes count as well as the name — a medication is often
 * looked up by strength ("the 5mg one") or by what the note says about
 * how to take it.
 */
export function searchableFields(item) {
  return [item.name, item.dosage, item.notes];
}
