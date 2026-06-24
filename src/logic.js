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
 * Rules:
 *  - Adults can see all medications (enforced server-side by adult_writable policy).
 *  - Children can only see their own medications (enforced server-side via member_read_column).
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
  return `${medId}__${date}__${slot}` in doses;
}

/**
 * Returns true when every active schedule slot for a medication has been
 * taken on the given date.
 */
export function allDosesComplete(med, doses, date) {
  const slots = parseJsonArray(med.schedule_slots);
  return slots.length > 0 && slots.every(slot => isDoseTaken(doses, med.id, slot, date));
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
