import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, HOUR, MINUTE, SECOND, TIMESTAMP_FORM, WEEKDAYS, civilFromDays, daysFromCivil, daysInMonth, formatDate, formatDuration, formatOffset, parseClock, parseDate, parseDuration, parseOffset, parseSpan, parseTimestamp, weekdayOf } from '../src/index.js';
import { inYear } from './helpers.js';

// Dates, timestamps, clock times and durations, worked out by hand with no Date object.

test('time: day numbers and dates convert both ways, day 0 is a Thursday, and the made-up week starts on a Monday', () => {
  const epoch = civilFromDays(0);
  assert.deepEqual([epoch.month, epoch.day], [1, 1], 'day 0 is the first day of a year');
  assert.equal(daysFromCivil(epoch.year, 1, 1), 0);
  assert.equal(daysFromCivil(epoch.year + 1, 1, 1), 365);
  assert.equal(weekdayOf(0), 3);
  assert.equal(WEEKDAYS[weekdayOf(daysFromCivil(3001, 3, 2))], 'mon');
  assert.equal(WEEKDAYS[weekdayOf(daysFromCivil(3001, 3, 8))], 'sun');
  assert.equal(weekdayOf(-1), 2, 'a day before day 0 is a Wednesday');
  for (let d = -800000; d < 800000; d += 997) assert.equal(daysFromCivil(...Object.values(civilFromDays(d))), d);
  assert.equal(daysFromCivil(3001, 3, 1) - daysFromCivil(3001, 2, 28), 1);
});

test('time: leap years follow the Gregorian rules', () => {
  assert.equal(daysInMonth(3000, 2), 28, 'a century not divisible by 400');
  assert.equal(daysInMonth(3200, 2), 29, 'a century divisible by 400');
  assert.equal(daysInMonth(3004, 2), 29);
  assert.equal(daysInMonth(3001, 2), 28);
  assert.equal(daysInMonth(3001, 4), 30);
});

test('time: a date YYYY-MM-DD is read and written back, and a date that does not exist is refused', () => {
  assert.equal(formatDate(parseDate('3001-03-05')), '3001-03-05');
  assert.equal(formatDate(parseDate(` ${inYear(1, '01-01')} `)), inYear(1, '01-01'));
  for (const bad of ['3001-02-29', '3001-13-01', '3001-00-10', '3001-3-5', inYear(0, '01-01'), 'next friday', '']) assert.equal(parseDate(bad), null, bad);
});

test('time: offsets are minutes east of UTC; Z, -00:00 and +00:00 are UTC', () => {
  assert.equal(parseOffset('Z'), 0);
  assert.equal(parseOffset('z'), 0);
  assert.equal(parseOffset('-00:00'), 0);
  assert.equal(parseOffset('+05:30'), 330);
  assert.equal(parseOffset('-03:00'), -180);
  for (const bad of ['+24:00', '+01:60', '+1:00', '0100', 'UTC', '']) assert.equal(parseOffset(bad), null, bad);
  assert.equal(formatOffset(330), '+05:30');
  assert.equal(formatOffset(-180), '-03:00');
  assert.equal(formatOffset(0), '+00:00');
});

test('time: a timestamp is read as RFC 3339 writes it, with a space for T, seconds left out, a fraction and a leap second', () => {
  const base = parseTimestamp('3001-03-02T09:00:00Z').ms;
  assert.equal(base, daysFromCivil(3001, 3, 2) * DAY + 9 * HOUR);
  assert.equal(parseTimestamp('3001-03-02T10:00:00+01:00').ms, base);
  assert.equal(parseTimestamp('3001-03-02t04:00:00-05:00').ms, base);
  assert.equal(parseTimestamp('3001-03-02 09:00:00Z').ms, base);
  assert.equal(parseTimestamp('3001-03-02T09:00Z').ms, base);
  assert.equal(parseTimestamp('3001-03-02T09:00:00.25Z').ms, base + 250);
  assert.equal(parseTimestamp('3001-03-02T09:00:00.123456789Z').ms, base + 123);
  assert.equal(parseTimestamp('3001-03-02T08:59:60Z').ms, base - SECOND, 'a leap second is the last second of its minute');
  assert.equal(parseTimestamp(' 3001-03-02T09:00:00Z ').ms, base);
});

test('time: a timestamp with no offset is refused unless a default offset is given', () => {
  assert.match(parseTimestamp('3001-03-02T09:00:00').problem, /has no offset; write Z or an offset such as \+01:00/);
  assert.equal(parseTimestamp('3001-03-02T10:00:00', 60).ms, parseTimestamp('3001-03-02T09:00:00Z').ms);
  assert.equal(parseTimestamp('3001-03-02T10:00:00Z', 60).ms, parseTimestamp('3001-03-02T10:00:00Z').ms, 'an offset in the text wins');
});

test('time: a timestamp that is empty, of another form or names a date or time that does not exist is refused with its reason', () => {
  assert.equal(parseTimestamp('').problem, 'is empty');
  assert.equal(parseTimestamp('   ').problem, 'is empty');
  for (const bad of ['yesterday', '3001-03-02', '02/03/3001 09:00', '3001-03-02T9:00:00Z', '3001-03-02T09:00:00+0100', '3001-03-02T09:00:00 +01:00', '3001-03-02T09:00:00.Z']) assert.equal(parseTimestamp(bad).problem, `is not ${TIMESTAMP_FORM}`, bad);
  assert.equal(parseTimestamp('3001-02-29T09:00:00Z').problem, 'names a date that does not exist');
  assert.equal(parseTimestamp(inYear(0, '01-01T09:00:00Z')).problem, 'names a date that does not exist');
  assert.equal(parseTimestamp('3001-03-02T24:00:00Z').problem, 'names a time that does not exist');
  assert.equal(parseTimestamp('3001-03-02T09:60:00Z').problem, 'names a time that does not exist');
  assert.equal(parseTimestamp('3001-03-02T09:00:61Z').problem, 'names a time that does not exist');
  assert.equal(parseTimestamp('3001-03-02T09:00:00+24:00').problem, 'has an offset that does not exist');
});

test('time: clock times and spans of working hours, with 24:00 only as an end', () => {
  assert.equal(parseClock('09:30'), 570);
  assert.equal(parseClock('24:00'), null);
  assert.equal(parseClock('24:00', true), 1440);
  assert.equal(parseClock('9:30'), null);
  assert.deepEqual(parseSpan('09:00-17:00'), [540, 1020]);
  assert.deepEqual(parseSpan('00:00-24:00'), [0, 1440]);
  assert.deepEqual(parseSpan(' 13:30 - 17:30 '), [810, 1050]);
  for (const bad of ['17:00-09:00', '09:00-09:00', '09:00', '09:00-17:00-18:00', '24:00-24:00', 'nine to five']) assert.equal(parseSpan(bad), null, bad);
});

test('time: durations of cover time in hours and minutes, and how a report writes them', () => {
  assert.equal(parseDuration('30m'), 30 * MINUTE);
  assert.equal(parseDuration('4h'), 4 * HOUR);
  assert.equal(parseDuration('1h30m'), 90 * MINUTE);
  assert.equal(parseDuration('1h 30m'), 90 * MINUTE);
  assert.equal(parseDuration('90m'), 90 * MINUTE);
  for (const bad of ['0m', '0h', '1d', '1.5h', '-1h', 'h', '', '4 hours', '100001h']) assert.equal(parseDuration(bad), null, bad);
  assert.equal(formatDuration(0), '0m');
  assert.equal(formatDuration(1), '1s', 'a time above zero is at least a second');
  assert.equal(formatDuration(20 * SECOND), '20s');
  assert.equal(formatDuration(45 * MINUTE), '45m');
  assert.equal(formatDuration(2 * HOUR), '2h');
  assert.equal(formatDuration(90 * MINUTE), '1h 30m');
  assert.equal(formatDuration(HOUR + 5 * SECOND), '1h 0m 5s');
  assert.equal(formatDuration(41 * HOUR + 30 * MINUTE + 999), '41h 30m', 'whole seconds');
});
