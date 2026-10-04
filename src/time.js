// Timestamps, dates, clock times and durations, read and written by hand with no Date object, so nothing here can read
// the clock or the time zone of the machine. Days are counted from the first day of the Unix epoch (day 0) in the
// proleptic Gregorian calendar, with the days-from-civil method that Howard Hinnant describes. A timestamp is read as
// RFC 3339 writes it: the date, T (or a space), the time and Z or an offset; one without an offset is refused unless the
// configuration gives a default offset, because a local time with no offset names a different instant in each zone.

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

// The day number of a date of the proleptic Gregorian calendar.
export function daysFromCivil(year, month, day) {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

// The date of a day number: { year, month, day }.
export function civilFromDays(days) {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: yoe + era * 400 + (month <= 2 ? 1 : 0), month, day };
}

// The weekdays from Monday, as the configuration names them.
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

// The weekday of a day number, 0 for Monday to 6 for Sunday. Day 0 was a Thursday.
export const weekdayOf = (days) => (((days % 7) + 7 + 3) % 7);

const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
export const daysInMonth = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

const pad = (n, w = 2) => String(n).padStart(w, '0');

// A date in the form YYYY-MM-DD, as a day number, or null.
export function parseDate(text) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(text).trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return daysFromCivil(y, mo, d);
}

// A day number as YYYY-MM-DD.
export function formatDate(days) {
  const c = civilFromDays(days);
  return `${pad(c.year, 4)}-${pad(c.month)}-${pad(c.day)}`;
}

// An offset such as +01:00, -05:30, Z or -00:00, in minutes east of UTC, or null. RFC 3339 reads -00:00 as a time in UTC
// whose local offset is not known, which for a count of time is UTC.
export function parseOffset(text) {
  const t = String(text).trim();
  if (t === 'Z' || t === 'z') return 0;
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(t);
  if (!m || Number(m[2]) > 23 || Number(m[3]) > 59) return null;
  return (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) || 0;
}

// An offset in minutes as +HH:MM.
export function formatOffset(minutes) {
  const a = Math.abs(minutes);
  return `${minutes < 0 ? '-' : '+'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

const TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?([Zz]|[+-]\d{2}:\d{2})?$/;
export const TIMESTAMP_FORM = 'a timestamp as RFC 3339 writes it: the date as YYYY-MM-DD, T, the time as HH:MM:SS and Z or an offset such as +01:00';

// A timestamp as milliseconds since the start of day 0 in UTC: { ms } or { problem }. defaultOffset (minutes, or null)
// is used for a timestamp written without an offset. Seconds may be left out; a fraction is kept to the millisecond; a
// leap second (:60) is read as the last second of its minute.
export function parseTimestamp(text, defaultOffset = null) {
  const t = String(text).trim();
  if (t === '') return { problem: 'is empty' };
  const m = TIMESTAMP.exec(t);
  if (!m) return { problem: `is not ${TIMESTAMP_FORM}` };
  const [y, mo, d, h, mi] = [1, 2, 3, 4, 5].map((i) => Number(m[i]));
  if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return { problem: 'names a date that does not exist' };
  if (h > 23 || mi > 59 || (m[6] !== undefined && Number(m[6]) > 60)) return { problem: 'names a time that does not exist' };
  const s = m[6] === undefined ? 0 : Math.min(Number(m[6]), 59);
  let offset;
  if (m[8] === undefined) {
    if (defaultOffset === null) return { problem: 'has no offset; write Z or an offset such as +01:00 after the time, or set defaultOffset in the configuration' };
    offset = defaultOffset;
  } else {
    offset = parseOffset(m[8]);
    if (offset === null) return { problem: 'has an offset that does not exist' };
  }
  const fraction = m[7] === undefined ? 0 : Number(m[7].slice(0, 3).padEnd(3, '0'));
  return { ms: daysFromCivil(y, mo, d) * DAY + h * HOUR + mi * MINUTE + s * SECOND + fraction - offset * MINUTE };
}

// A clock time HH:MM as minutes after midnight, or null. 24:00 is read only with end set, as the end of the day.
export function parseClock(text, end = false) {
  const m = /^(\d{2}):(\d{2})$/.exec(String(text).trim());
  if (!m) return null;
  const [h, mi] = [Number(m[1]), Number(m[2])];
  if (h === 24 && mi === 0 && end) return 24 * 60;
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

// A span of working hours HH:MM-HH:MM as [start, end] in minutes, or null when it is not one or ends before it starts.
export function parseSpan(text) {
  const parts = String(text).split('-');
  if (parts.length !== 2) return null;
  const start = parseClock(parts[0]);
  const end = parseClock(parts[1], true);
  if (start === null || end === null || end <= start) return null;
  return [start, end];
}

// A duration of cover time such as 30m, 4h or 1h30m, in milliseconds, or null. Hours and minutes only: a day of cover
// time is a different length under each calendar, so the tool does not read one.
export function parseDuration(text) {
  const m = /^(?:(\d{1,5})\s*h)?\s*(?:(\d{1,6})\s*m)?$/.exec(String(text).trim());
  if (!m || (m[1] === undefined && m[2] === undefined)) return null;
  const ms = Number(m[1] ?? 0) * HOUR + Number(m[2] ?? 0) * MINUTE;
  return ms > 0 && ms <= 100000 * HOUR ? ms : null;
}

// A duration for a report: 2h, 1h 30m, 45m, 1h 0m 5s or 20s; whole seconds, and at least 1s for a time above zero.
export function formatDuration(ms) {
  let total = Math.floor(ms / SECOND);
  if (ms > 0 && total === 0) total = 1;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = [];
  if (h) parts.push(`${h}h`);
  if (m || (h && s)) parts.push(`${m}m`);
  if (s) parts.push(`${s}s`);
  return parts.length ? parts.join(' ') : '0m';
}
