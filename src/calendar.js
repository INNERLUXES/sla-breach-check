// Cover time: the time that counts against a target. Under business cover it is the working hours of the working days
// in the time zone of the calendar, without the holidays; under 24x7 cover it is all the time there is. A clock gives,
// for every instant, the cover time from a fixed start up to that instant, so the cover time between two instants is
// one subtraction, and paused time is taken out the same way, one interval at a time.
//
// A business clock is built once per run over the local days the timestamps of the run reach: the instant each local
// day starts, the windows of cover in it as instants, and the cover time before each day. An instant is placed in its
// day by a binary search over the starts of the days, so a clock change at midnight places it right.

import { DAY, MINUTE, weekdayOf } from './time.js';
import { localDay, localToUtc } from './zone.js';

export const CALENDAR_LIMITS = { maxDays: 36600 };

export class CalendarError extends Error {}

// The clock of 24x7 cover: every millisecond counts.
export const AROUND_THE_CLOCK = { kind: '24x7', at: (t) => t };

// The clock of business cover over the local days from the day of fromMs to the day of toMs, with a day on each side.
// calendar: { zone, workingDays (weekday indexes, Monday 0), spans ([start, end] in minutes), holidays (day numbers) }.
export function businessClock(calendar, fromMs, toMs, limits = CALENDAR_LIMITS) {
  const { zone } = calendar;
  const first = localDay(zone, fromMs) - 1;
  const last = localDay(zone, toMs) + 1;
  const n = last - first + 1;
  if (n > limits.maxDays) throw new CalendarError(`the timestamps of the run reach over ${n.toLocaleString('en-US')} days, more than the limit of ${limits.maxDays.toLocaleString('en-US')}; look for a timestamp with a wrong year`);
  const holidays = new Set(calendar.holidays);
  const working = new Set(calendar.workingDays);
  const starts = new Float64Array(n + 1);
  for (let i = 0; i <= n; i += 1) starts[i] = localToUtc(zone, (first + i) * DAY);
  const windows = new Array(n);
  const before = new Float64Array(n + 1);
  for (let i = 0; i < n; i += 1) {
    const day = first + i;
    const list = [];
    let total = 0;
    if (working.has(weekdayOf(day)) && !holidays.has(day)) {
      for (const [s, e] of calendar.spans) {
        const ws = Math.max(localToUtc(zone, day * DAY + s * MINUTE), starts[i]);
        const we = Math.min(localToUtc(zone, day * DAY + e * MINUTE), starts[i + 1]);
        if (we > ws) {
          list.push([ws, we]);
          total += we - ws;
        }
      }
    }
    windows[i] = list;
    before[i + 1] = before[i] + total;
  }
  const at = (t) => {
    if (t <= starts[0]) return 0;
    if (t >= starts[n]) return before[n];
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= t) lo = mid;
      else hi = mid - 1;
    }
    let v = before[lo];
    for (const [ws, we] of windows[lo]) if (t > ws) v += Math.min(t, we) - ws;
    return v;
  };
  return { kind: 'business', at, days: n };
}

// Intervals [start, end] sorted and merged where they touch or overlap.
export function mergeIntervals(intervals) {
  const sorted = intervals.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = [];
  for (const [s, e] of sorted) {
    const last = out.at(-1);
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

// The cover time between two instants, and the part of it inside the paused intervals (merged): { used, paused }, where
// used leaves the paused cover time out.
export function coverBetween(clock, from, to, pauses = []) {
  if (to <= from) return { used: 0, paused: 0 };
  const total = clock.at(to) - clock.at(from);
  let paused = 0;
  for (const [s, e] of pauses) {
    const a = Math.max(s, from);
    const b = Math.min(e, to);
    if (b > a) paused += clock.at(b) - clock.at(a);
  }
  return { used: total - paused, paused };
}
