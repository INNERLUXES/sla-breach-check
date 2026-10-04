// The time zone of the cover calendar: a fixed offset such as +01:00 or Z, or a name of the IANA time zone database such
// as Europe/Berlin. A name is read through Intl.DateTimeFormat with that zone set, which gives the local time of an
// instant in the zone with the rules of the database that comes with Node; the time zone of the machine is never read,
// because every formatter here names its zone and its locale. Local times are turned back into instants with two
// lookups, which places a time that a clock change skips or repeats one way or the other (docs/limits.md).

import { DAY, HOUR, MINUTE, SECOND, daysFromCivil, parseOffset } from './time.js';

const NAME = /^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/;

// The zone of a text: { name, offset } for a fixed offset, { name, formatter } for a named zone, or null when the text is
// neither an offset nor a zone the database knows.
export function readZone(text) {
  if (typeof text !== 'string') return null;
  const offset = parseOffset(text);
  if (offset !== null) return { name: text, offset, formatter: null };
  if (!NAME.test(text)) return null;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: text, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    return { name: text, offset: null, formatter };
  } catch {
    return null;
  }
}

// The offset of the zone at an instant, in minutes east of UTC.
export function offsetAt(zone, ms) {
  if (zone.offset !== null) return zone.offset;
  const whole = Math.floor(ms / SECOND) * SECOND;
  const p = {};
  for (const part of zone.formatter.formatToParts(whole)) p[part.type] = part.value;
  const local = daysFromCivil(Number(p.year), Number(p.month), Number(p.day)) * DAY + Number(p.hour) * HOUR + Number(p.minute) * MINUTE + Number(p.second) * SECOND;
  return Math.round((local - whole) / MINUTE);
}

// The instant of a local time of the zone, given as milliseconds of the local clock since the start of day 0.
export function localToUtc(zone, local) {
  if (zone.offset !== null) return local - zone.offset * MINUTE;
  const first = offsetAt(zone, local);
  const guess = local - first * MINUTE;
  const second = offsetAt(zone, guess);
  return second === first ? guess : local - second * MINUTE;
}

// The local day number of an instant in the zone.
export const localDay = (zone, ms) => Math.floor((ms + offsetAt(zone, ms) * MINUTE) / DAY);
