import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AROUND_THE_CLOCK, CalendarError, DAY, HOUR, MINUTE, businessClock, calendarOf, coverBetween, localDay, localToUtc, mergeIntervals, offsetAt, parseTimestamp, readZone } from '../src/index.js';
import { configOf, inYear, ms } from './helpers.js';

// The time zone of the calendar and the clocks of cover time.

const calendar = (over = {}) => calendarOf(configOf(over));
const clockOf = (over = {}, from = '02 00:00', to = '10 23:00') => businessClock(calendar(over), ms(from), ms(to));
const between = (clock, a, b, pauses = []) => coverBetween(clock, ms(a), ms(b), pauses).used;

test('zone: a fixed offset, a zone name Node knows, and anything else refused', () => {
  assert.deepEqual(readZone('+01:00'), { name: '+01:00', offset: 60, formatter: null });
  assert.equal(readZone('Z').offset, 0);
  const named = readZone('Etc/GMT-5');
  assert.equal(named.offset, null);
  assert.ok(named.formatter);
  for (const bad of ['Mars/Olympus_Mons', 'Europe/Nowhere', '', '../etc', 'x'.repeat(70), 'Europe Berlin']) assert.equal(readZone(bad), null, bad);
  assert.equal(readZone(5), null);
  assert.equal(readZone(null), null);
});

test('zone: the offset at an instant and the instant of a local time, for a fixed offset and a named zone', () => {
  const t = ms('02 09:00');
  assert.equal(offsetAt(readZone('+01:00'), t), 60);
  assert.equal(offsetAt(readZone('Etc/GMT-5'), t), 300, 'Etc/GMT-5 is five hours east of UTC');
  assert.equal(offsetAt(readZone('UTC'), t), 0);
  assert.equal(localToUtc(readZone('+01:00'), t), t - HOUR);
  assert.equal(localToUtc(readZone('Etc/GMT-5'), t), t - 5 * HOUR);
  assert.equal(localDay(readZone('-05:00'), ms('03 03:00')), localDay(readZone('Z'), ms('02 12:00')), 'three in the morning UTC is the evening before at -05:00');
});

test('zone: in a zone with daylight saving, every local time maps back to itself, and the offsets follow the zone', () => {
  const zone = readZone('America/New_York');
  const seen = new Set();
  for (let h = 0; h < 365 * 24; h += 7) {
    const local = ms('02 00:00') + h * HOUR;
    const utc = localToUtc(zone, local);
    const back = utc + offsetAt(zone, utc) * MINUTE;
    seen.add(offsetAt(zone, utc));
    // A local time a clock change skips maps to an instant an hour away; every other local time maps back to itself.
    assert.ok(back === local || Math.abs(back - local) === HOUR, String(h));
  }
  assert.ok(seen.size >= 1 && [...seen].every((o) => o < 0), 'the offsets of the zone are west of UTC');
});

test('calendar: business cover counts the working hours of the working days only', () => {
  const clock = clockOf();
  assert.equal(between(clock, '02 09:00', '02 17:00'), 8 * HOUR);
  assert.equal(between(clock, '02 08:00', '02 18:00'), 8 * HOUR, 'time outside the hours does not count');
  assert.equal(between(clock, '02 16:30', '03 09:30'), HOUR, 'the night does not count');
  assert.equal(between(clock, '06 16:00', '09 10:00'), 2 * HOUR, 'the weekend does not count');
  assert.equal(between(clock, '02 09:00', '09 09:00'), 40 * HOUR, 'a working week');
  assert.equal(between(clock, '07 10:00', '08 15:00'), 0);
  assert.equal(between(clock, '02 12:00', '02 12:00'), 0);
  assert.equal(between(clock, '02 13:00', '02 12:00'), 0, 'an end before the start counts nothing');
});

test('calendar: holidays, several spans a day, a day that ends at 24:00, other working days and a zone', () => {
  assert.equal(between(clockOf({ holidays: ['3001-03-04'] }), '03 09:00', '06 09:00'), 16 * HOUR, 'the holiday does not count');
  const lunch = clockOf({ workingHours: ['13:30-17:30', '09:00-12:30'] });
  assert.equal(between(lunch, '02 12:00', '02 14:00'), HOUR, 'the lunch break does not count');
  assert.equal(between(lunch, '02 00:00', '03 00:00'), 7.5 * HOUR);
  assert.equal(between(clockOf({ workingHours: ['00:00-24:00'] }), '02 00:00', '07 00:00'), 5 * DAY);
  assert.equal(between(clockOf({ workingDays: ['sat', 'sun'] }), '02 00:00', '09 00:00'), 16 * HOUR);
  const east = clockOf({ timezone: '+05:00' });
  assert.equal(between(east, '02 03:00', '02 05:00'), HOUR, '09:00 at +05:00 is 04:00 UTC');
  assert.equal(between(clockOf({ timezone: 'Etc/GMT-5' }), '02 03:00', '02 05:00'), HOUR, 'the same through a zone name');
});

test('calendar: paused time is taken out once, where pauses overlap, and only inside the cover', () => {
  const clock = clockOf();
  const p = (a, b) => [ms(a), ms(b)];
  assert.equal(between(clock, '02 09:00', '02 17:00', [p('02 10:00', '02 11:00')]), 7 * HOUR);
  assert.equal(between(clock, '02 09:00', '02 17:00', mergeIntervals([p('02 10:00', '02 12:00'), p('02 11:00', '02 13:00')])), 5 * HOUR);
  assert.equal(between(clock, '02 09:00', '03 17:00', [p('02 16:00', '03 10:00')]), 14 * HOUR, 'a pause over the night takes out two hours of cover');
  assert.equal(between(clock, '02 09:00', '02 17:00', [p('01 10:00', '02 10:00'), p('02 16:30', '04 10:00')]), 6.5 * HOUR, 'pauses are clipped to the time counted');
  assert.deepEqual(coverBetween(clock, ms('02 09:00'), ms('02 17:00'), [p('02 10:00', '02 11:00')]), { used: 7 * HOUR, paused: HOUR });
});

test('calendar: intervals are sorted and merged where they touch or overlap, and empty ones are dropped', () => {
  assert.deepEqual(mergeIntervals([[5, 8], [1, 3], [3, 4], [7, 9], [10, 10]]), [[1, 4], [5, 9]]);
  assert.deepEqual(mergeIntervals([]), []);
});

test('calendar: 24x7 cover counts every millisecond', () => {
  assert.equal(coverBetween(AROUND_THE_CLOCK, ms('06 20:00'), ms('09 08:00')).used, 60 * HOUR);
  assert.equal(AROUND_THE_CLOCK.kind, '24x7');
});

test('calendar: an instant outside the days built counts as their first or last moment', () => {
  const clock = clockOf({}, '03 10:00', '03 11:00');
  assert.equal(clock.days, 3);
  assert.equal(clock.at(ms('02 05:00') - 10 * DAY), 0);
  assert.equal(clock.at(ms('04 23:00')), clock.at(ms('04 23:30')));
});

test('calendar: a run whose timestamps reach over too many days is refused, so a wrong year cannot make it slow', () => {
  const cal = calendar();
  const far = parseTimestamp(inYear(3001 + 200)).ms;
  assert.throws(() => businessClock(cal, ms('02 09:00'), far), (e) => e instanceof CalendarError && /more than the limit of 36,600; look for a timestamp with a wrong year/.test(e.message));
  assert.throws(() => businessClock(cal, ms('02 09:00'), ms('10 09:00'), { maxDays: 5 }), CalendarError);
});
