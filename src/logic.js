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
 * The stored value for the reminder-recipient list. Nobody ticked means the
 * person the medication is for, which the hub spells as the empty string; an
 * empty JSON array is what an older hub reads as "the household picked nobody".
 * The reminder lane now declares `empty_list: "audience"`, so both spellings
 * reach the owner; the plain default is still the one this page writes.
 */
export function reminderRecipientsValue(ids) {
  const normalized = normalizeMemberIds(ids);
  return normalized === "[]" ? "" : normalized;
}

/**
 * The recipients a medication can actually reach. The hub delivers a reminder
 * only to someone who can read the medication, and a private one is read by
 * the person it is for alone, so anyone else named on it would silently
 * receive nothing.
 */
export function recipientsForVisibility(ids, visibility, ownerId) {
  const list = (ids ?? []).filter(id => typeof id === "string" && id);
  return visibility === VISIBILITY_PRIVATE ? list.filter(id => id === ownerId) : list;
}

/**
 * Whether the list may be re-read from the hub right now. Not under an open
 * form, which a redraw would disturb, and not while a write is on its way: the
 * read would describe the moment before it and could land after it.
 */
export function canRereadNow({ modalOpen, writesInFlight }) {
  return !modalOpen && writesInFlight === 0;
}

/**
 * Whether a re-read that has just come back may replace what is on screen.
 * `writeEpoch` counts the writes this page has started; one that began after
 * the read did makes the read a picture of the state before it.
 */
export function rereadStillCurrent({ epochAtStart, writeEpoch, modalOpen, writesInFlight }) {
  return epochAtStart === writeEpoch && canRereadNow({ modalOpen, writesInFlight });
}

/**
 * Whether a failed write may be stored all the same: no answer arrived (a
 * thrown fetch carries no status), or the hub answered 400, which it also
 * gives a write that timed out and a retry that met its own first row, or
 * failed on its side (a 5xx) with the write possibly stored first. A 403 or a
 * 507 is a clean refusal.
 */
export function writeOutcomeUnknown(error) {
  return error?.status == null || error.status === 400 || (error.status >= 500 && error.status !== 507);
}

/** Whether a stored medication holds exactly the fields the form sent. */
export function storedMatchesForm(stored, sent) {
  return Object.keys(sent).every(key => String(stored?.[key] ?? "") === String(sent[key] ?? ""));
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

/** The three values of a medication's `visibility` column. */
export const VISIBILITY_FAMILY = "family";
export const VISIBILITY_PRIVATE = "private";
export const VISIBILITY_CARE = "care";

/** A medication the care team sees as well as the adults: the household's
 * chosen member group (a nanny who signs in as a guest, a grandparent). */
export function isCareMedication(med) {
  return med?.visibility === VISIBILITY_CARE;
}

/** A medication kept to the person it is for. Rows written before the column
 * existed carry no value and were always shared, so only an explicit
 * "private" counts. */
export function isPrivateMedication(med) {
  return med?.visibility === VISIBILITY_PRIVATE;
}

/**
 * Whether a member manages medications: reads every shared ("family") one,
 * adds, edits and archives. Mirrors the hub's rule for the medications table
 * (owner_or_visibility with adult_values ["family"], write_visibility_scoped
 * and adult-only column writes): every adult in a household, every adult who
 * takes part in a general or co-parenting space, and the steward alone in a
 * roster, where a participant reads their own rows only. A child or a guest
 * reads their own medications and ticks their doses, nothing more.
 */
export function managesMedications(member, { tenantKind = "household", spaceKind = null, isAdmin = false } = {}) {
  if (!isAdultMember(member)) return false;
  if (tenantKind === "household") return true;
  return spaceKind !== "roster" || isAdmin === true;
}

/**
 * Whether the member may add a medication for `owner` (someone other than
 * themselves). The hub keeps the owner an adult names only where supervision
 * is theirs (supervisor_assigns_owner): every adult at home, the steward of a
 * general or roster space, for anyone. In a co-parenting space it keeps it
 * only for a CHILD member (coparenting_child_supervision), so a steward adds a
 * child's medication but never one for the other parent; with no owner given
 * there it answers false. Everywhere else the hub stamps the row to its
 * author, so the form offers no choice rather than one the hub would silently
 * overrule.
 */
export function canAssignOwner(member, { tenantKind = "household", spaceKind = null, isAdmin = false } = {}, owner = null) {
  if (!isAdultMember(member)) return false;
  if (tenantKind === "household") return true;
  if (isAdmin !== true) return false;
  if (spaceKind !== "coparenting") return true;
  return owner?.role === "child";
}

/** Whether a member may add a medication at all: whoever manages them. */
export function canAddMedication(member, tenant = {}) {
  return managesMedications(member, tenant);
}

/** Who decides who else sees a medication: an adult, for their own and for a
 * child's or a guest's (the people they look after). Another adult's
 * medication is left to that adult, as its editing is (canEditMedication),
 * though at home the hub lets any adult who sees a row write the column
 * (column_write_acls, writable_by ["adult"], write_visibility_scoped). In a
 * co-parenting space the hub writes only the caller's own and a child's
 * medications (coparenting_child_supervision), so a guest's is not offered
 * there. A child never chooses. */
export function canChooseVisibility(ownerId, me, members = [], tenant = {}) {
  if (!isAdultMember(me) || !ownerId) return false;
  if (ownerId === me.id) return true;
  const owner = (members ?? []).find(m => m?.id === ownerId);
  if (isCoparentingSpace(tenant)) return owner?.role === "child";
  return !!owner && !isAdultMember(owner);
}

/** A co-parenting space, where the hub keeps each parent's own medications
 * theirs: writes reach the caller's own and the children's only. */
function isCoparentingSpace(tenant) {
  return (tenant?.tenantKind ?? "household") !== "household" && tenant?.spaceKind === "coparenting";
}

/**
 * The choices the form offers for a medication's visibility, in order. "Only
 * me" is offered on the chooser's own medication alone: a child's medication
 * stays in their parents' sight. "Care team" is offered once an admin has
 * chosen the group; without one the form says so rather than offering a value
 * nobody could read. A stored value the form no longer offers (a care
 * medication after the group is unset) stays offered so an edit keeps it.
 */
export function visibilityOptions(ownerId, me, { careTeamConfigured = false, current = VISIBILITY_FAMILY } = {}) {
  const options = [VISIBILITY_FAMILY];
  if (careTeamConfigured || current === VISIBILITY_CARE) options.push(VISIBILITY_CARE);
  if (ownerId && me && ownerId === me.id) options.push(VISIBILITY_PRIVATE);
  return options;
}

/**
 * Returns true if whoever manages medications can see this one: their own
 * always, every other one that is not private. Used to gate editing
 * (canEditMedication); what the page lists is the hub's select. A private
 * medication is its owner's alone.
 */
export function canViewMedication(med, me, members, tenant) {
  if (!me) return false;
  if (med.member_id === me.id) return true;
  if (managesMedications(me, tenant)) return !isPrivateMedication(med);
  return false;
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
 * Returns true if the current user can edit a specific medication. Whoever
 * manages edits what they can see, with one courtesy at home: another adult's
 * medication is left to that adult. In a general space every adult who sees a
 * medication keeps it, which is the point of sharing a parent's list between
 * siblings. In a co-parenting space the hub writes only your own and the
 * children's (coparenting_child_supervision), never the other parent's.
 */
export function canEditMedication(med, me, members, tenant) {
  if (!canManageMedications(me, tenant)) return false;
  if (!canViewMedication(med, me, members, tenant)) return false;
  if (med.member_id === me.id) return true;
  if (isCoparentingSpace(tenant)) return members.find(m => m.id === med.member_id)?.role === "child";
  if ((tenant?.tenantKind ?? "household") !== "household") return true;
  const owner = members.find(m => m.id === med.member_id);
  return !isAdultMember(owner); // can edit children's meds, not other adults'
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
  return [item.name, item.dosage, item.notes, item.prescriber, item.pharmacy];
}

// ── Refills ──────────────────────────────────────────────────────────────────

/** Days ahead of a refill the page calls it "soon". The manifest's
 *  date_reminders.default_lead_days is the same number, so the badge and the
 *  email agree on when a refill starts to matter. */
export const REFILL_SOON_DAYS = 5;

/** "yyyy-mm-dd" naming a real day. */
export function isIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));
  if (!match) return false;
  const day = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return day.toISOString().slice(0, 10) === match[0];
}

/**
 * The day the next refill falls due once one is picked up today: `everyDays`
 * on from the household's day. "" when there is no interval to count, or no
 * day to count from, so the medication stops being tracked for refills until
 * someone enters the next date.
 */
export function nextRefillOn(todayStr, everyDays) {
  const every = Number(everyDays);
  if (!Number.isInteger(every) || every < 1 || every > 366) return "";
  return daysBefore(todayStr, -every);
}

/**
 * Where a medication stands on its refill as of the household's day, or null
 * when none is tracked (no date, or not a date). `daysUntil` is negative once
 * it is overdue.
 */
export function refillStatus(med, todayStr) {
  const on = String(med?.refill_on ?? "");
  if (!isIsoDate(on)) return null;
  const daysUntil = daysBetween(todayStr, on);
  if (daysUntil === null) return null;
  return { on, daysUntil, overdue: daysUntil < 0, soon: daysUntil >= 0 && daysUntil <= REFILL_SOON_DAYS };
}

/** The words a refill status is shown as; "" for none. */
export function refillLine(status) {
  if (!status) return "";
  const n = Math.abs(status.daysUntil);
  const days = `${n} day${n === 1 ? "" : "s"}`;
  if (status.daysUntil === 0) return "Refill due today";
  if (status.overdue) return `Refill overdue by ${days}`;
  if (status.soon) return `Refill due in ${days}`;
  return `Refill due ${status.on}`;
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

/**
 * The line a failed write shows ("Refused, gone, or failed" in the app-template
 * guide): "try again" only when retrying can work, and never the hub's text.
 * `thing` and `action` are the app's own nouns. `found` is the caller's re-read
 * after a write that changed nothing: false = the row is gone, true = it is
 * still there (on a plain `WHERE id = ?` write the row policy narrowed it, the
 * permission line; on a `guarded` write its state moved), null = the re-read
 * itself failed. A `forUser` error keeps the message the app wrote for it.
 */
export function failureLine(e, { action, thing, found, guarded = false } = {}) {
  if (e?.forUser) return e.message;
  if (e?.code === "UNIQUE_CONSTRAINT" || /UNIQUE constraint failed/i.test(String(e?.message ?? ""))) return `That ${thing} already exists.`;
  if (e?.status === 403 || (found === true && !guarded)) return `You don’t have permission to ${action}.`;
  if (e?.status === 507) return "The household’s storage is full — free up space first.";
  if (e?.status === 429) return "Too many tries — wait a minute and try again.";
  if (found === null) return `Couldn’t ${action} — try again.`;
  if (found === false || (found === undefined && e?.status === 404)) return `This ${thing} has been removed.`;
  if (found === true || e?.status === 409) return `This ${thing} was changed by someone else — check it first.`;
  return `Couldn’t ${action} — try again.`;
}
