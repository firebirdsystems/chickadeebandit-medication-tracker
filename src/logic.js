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
 * Parses a JSON field that may be stored as a string or already be an array.
 * Returns an empty array on any error.
 */
export function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  try { return JSON.parse(value) ?? []; } catch { return []; }
}

const isAdultMember = m => !!m && (m.role === "adult" || m.role === "admin");

/**
 * Whether a member manages medications: reads everyone's, adds for anyone,
 * edits and archives. Mirrors the hub's rule for the medications table
 * (owner_only with adults_bypass, member_can_update: false and
 * steward_writes_only): any adult in a household, and only the steward in a
 * shared space of any kind. Anyone else reads their own medications alone and
 * is refused every edit, their own included.
 */
export function managesMedications(member, { tenantKind = "household", isAdmin = false } = {}) {
  return tenantKind === "household" ? isAdultMember(member) : isAdmin === true;
}

/**
 * Whether a member may add a medication at all. Whoever manages may add for
 * anyone. An adult who takes part in a shared space may add one for themself
 * (the hub stamps the row to them) unless the space is a roster, where every
 * write belongs to the steward. A child never adds.
 */
export function canAddMedication(member, tenant = {}) {
  if (managesMedications(member, tenant)) return true;
  const { tenantKind = "household", spaceKind = null } = tenant;
  return tenantKind !== "household" && spaceKind !== "roster" && isAdultMember(member);
}

/**
 * Returns true if the current user can see a medication: whoever manages
 * medications sees every one, everyone else only their own.
 */
export function canViewMedication(med, me, members, tenant) {
  if (!me) return false;
  return managesMedications(me, tenant) || med.member_id === me.id;
}

/**
 * Returns true if the current user can edit or archive medications
 * (including for children). See managesMedications.
 */
export function canManageMedications(me, tenant) {
  if (!me) return false;
  return managesMedications(me, tenant);
}

/**
 * Returns true if the current user can edit a specific medication. In a
 * household, whoever manages edits their own and children's, and leaves
 * another adult's alone. In a shared space the steward edits anyone's: the
 * members there are mostly adults, and keeping their medications is the
 * steward's job.
 */
export function canEditMedication(med, me, members, tenant) {
  if (!canManageMedications(me, tenant)) return false;
  if (med.member_id === me.id) return true;
  if ((tenant?.tenantKind ?? "household") !== "household") return true;
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

/**
 * Has the calendar day rolled over under an open tab?
 *
 * Takes the new day as a STRING, not a Date, and deliberately does not compute
 * it: "today" for this app is the HOUSEHOLD's day (the caller passes
 * `hubToday(now)`), and logic.js stays free of the SDK so it remains testable
 * in Node. Deriving the day from a Date in here is what made every dose row
 * follow the VIEWER DEVICE's clock — a dose taken at 11pm in one timezone and
 * read from another named two different days, with nothing to reconcile them.
 */
export function nextTodayKey(current, today) {
  return { today, changed: today !== current };
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

/** Whole days from one yyyy-mm-dd to another, or null when either is not a date. */
function daysBetween(from, to) {
  const utc = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
    return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : null;
  };
  const a = utc(from), b = utc(to);
  return a === null || b === null ? null : Math.round((b - a) / 86400000);
}

/**
 * Whether a medication is scheduled on the given yyyy-mm-dd: inside its course
 * dates, on one of its weekdays, and on a day its every-N-days interval lands
 * on. Mirrors the WHERE of the manifest's agenda and glance queries, so the
 * Today tab and the hub's own surfaces name the same medications. An interval
 * with no start date has no anchor and is ignored, as it is there.
 */
export function isDueOn(med, date) {
  const startedOn = med?.started_on || "";
  const endsOn = med?.ends_on || "";
  if (startedOn && startedOn > date) return false;
  if (endsOn && endsOn < date) return false;
  const days = String(med?.days_mask ?? "").split(",").map(Number).filter(Boolean);
  if (days.length) {
    const sinceEpoch = daysBetween("1970-01-01", date);
    if (sinceEpoch === null) return false;
    // 1970-01-01 was a Thursday (ISO weekday 4).
    const isoWeekday = ((sinceEpoch + 3) % 7 + 7) % 7 + 1;
    if (!days.includes(isoWeekday)) return false;
  }
  const interval = Number(med?.every_n_days);
  if (Number.isInteger(interval) && interval > 1 && startedOn) {
    const elapsed = daysBetween(startedOn, date);
    if (elapsed !== null && elapsed % interval !== 0) return false;
  }
  return true;
}

/**
 * Whether the Today tab lists a medication: it is due today, or a dose was
 * already logged against it today (a tick must stay visible, and undoable,
 * even when the schedule was edited afterwards).
 */
export function showsToday(med, doses, date) {
  if (isDueOn(med, date)) return true;
  const prefix = `${med?.id}__${date}__`;
  return Object.keys(doses ?? {}).some(key => key.startsWith(prefix));
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

// ── Printed lists ─────────────────────────────────────────────────────────────
//
// The hub renders the documents from the manifest's `reports`. The page only
// builds their addresses.

/**
 * The yyyy-mm-dd that is `days` before `todayStr`, or "" when `todayStr` is not
 * a date. Worked out on the calendar and not from a clock, so it names the same
 * day on any device: `todayStr` is the HOUSEHOLD's today, which is the calendar
 * a dose's date is stored on.
 */
export function daysBefore(todayStr, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(todayStr ?? ""));
  if (!match) return "";
  const start = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) - days));
  return start.toISOString().slice(0, 10);
}

/**
 * The dates one printed list is asked for. The medication list is the courses
 * running today, so both ends are today: a course that has ended or not begun
 * is not something being taken now. The dose history covers `days` calendar
 * days ending today. The hub includes both ends, so it starts `days - 1` back.
 * Without a household date both are open, which the hub reads as everything.
 */
export function reportRange(id, todayStr, days) {
  const today = daysBefore(todayStr, 0);
  if (!today) return { from: "", to: "" };
  return { from: id === "doses_taken" ? daysBefore(today, Math.max(days, 1) - 1) : today, to: today };
}

/** The address of one document. An empty bound is left off, which the hub reads as open-ended. */
export function reportUrl(reportsUrl, id, format, from, to, base) {
  const url = new URL(`${reportsUrl}/${encodeURIComponent(id)}`, base);
  url.searchParams.set("format", format);
  if (from) url.searchParams.set("from", from);
  if (to) url.searchParams.set("to", to);
  return url.toString();
}
