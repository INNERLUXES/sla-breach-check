// The checks: every ticket of the run is read for input problems first (no id or an id read before, no priority or one
// the SLA does not name, a timestamp that is missing or cannot be read, times in an order that cannot be), and a ticket
// with one is reported and not judged. Every other ticket is judged on two clocks, the time to first response and the
// time to resolution, each counted in the cover time of its priority with the paused time taken out of the clocks that
// pausedClocks names. A clock that has stopped is met or missed; a clock still running is counted up to --as-of and is
// overdue, at risk or open. The summary gives, for each priority, the counts and the median and 90th percentile of the
// clocks that have stopped.

import { AROUND_THE_CLOCK, businessClock, coverBetween, mergeIntervals } from './calendar.js';
import { calendarOf } from './config.js';
import { listText } from './size.js';
import { formatDuration, parseOffset, parseTimestamp } from './time.js';
import { normalizePhrase } from './words.js';

const quote = (text) => `"${String(text).slice(0, 60)}${String(text).length > 60 ? '...' : ''}"`;
const fmt = formatDuration;

// The rules of the input: a ticket with a finding of one of them is not judged against its targets.
export const INPUT_RULES = ['invalid-timestamp', 'timestamps-out-of-order', 'unknown-priority', 'duplicate-ticket'];

// The value at a percentile of a list of numbers, by the nearest-rank method: the smallest value with at least that
// share of the list at or below it. null for an empty list.
export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

// The stopped and running clocks of one priority, as the summary shows them.
function tally(times) {
  const measured = times.measured;
  const judged = times.met + times.missed;
  return { target: times.target, targetMs: times.targetMs, tickets: times.tickets, met: times.met, missed: times.missed, open: times.open, atRisk: times.atRisk, share: judged ? times.met / judged : null, medianMs: percentile(measured, 50), p90Ms: percentile(measured, 90) };
}

// Pauses from a status history: a pause starts at an entry whose status is a paused status and ends at the next entry
// whose status is not. The entries are taken in the order of their times. A pause still running has no end (null).
export function pausesOfHistory(entries, pausedStatuses) {
  const sorted = [...entries].sort((a, b) => a.ms - b.ms);
  const out = [];
  let open = null;
  for (const e of sorted) {
    const paused = pausedStatuses.includes(normalizePhrase(e.status));
    if (paused && open === null) open = e.ms;
    else if (!paused && open !== null) {
      out.push([open, e.ms]);
      open = null;
    }
  }
  if (open !== null) out.push([open, null]);
  return out;
}

// Runs the checks over the tickets of every file. asOf is { text, ms } or null. Returns { findings, summary, open },
// where open counts the tickets that would need --as-of; with no --as-of and open tickets, the caller stops the run.
export function analyse(files, config, asOf, limits = undefined) {
  const findings = [];
  const fields = config.fields;
  const lookup = new Map();
  for (const p of config.priorities) for (const k of p.keys) lookup.set(k, p);
  const priorityNames = listText(config.priorities.map((p) => p.name), 8);
  const defaultOffset = config.defaultOffset === null ? null : parseOffset(config.defaultOffset);
  const ids = new Map();
  const judged = [];
  const counts = { tickets: 0, resolved: 0, open: 0, notJudged: 0, paused: 0 };

  for (const file of files) {
    for (const raw of file.tickets) {
      counts.tickets += 1;
      const v = raw.values;
      const label = v.id === null ? `the ticket at line ${raw.line}` : `ticket ${v.id.slice(0, 80)}`;
      const t = { file: raw.file, line: raw.line, ticket: v.id, priority: null };
      let bad = false;
      const add = (rule, found, details = null) => {
        findings.push({ rule, file: t.file, line: t.line, ticket: t.ticket, priority: t.priority, found, details });
        if (INPUT_RULES.includes(rule)) bad = true;
      };
      if (v.resolved === null) counts.open += 1;
      else counts.resolved += 1;

      if (v.id === null) add('duplicate-ticket', `${label} has no ${fields.id}, so it cannot be told apart from the others; it is not judged`);
      else if (ids.has(v.id)) add('duplicate-ticket', `${label} was read before, at ${ids.get(v.id)}; this copy is not judged`);
      else ids.set(v.id, `${raw.file}:${raw.line}`);

      const pr = v.priority === null ? null : lookup.get(normalizePhrase(v.priority)) ?? null;
      t.priority = pr ? pr.name : v.priority;
      if (v.priority === null) add('unknown-priority', `${label} has no ${fields.priority}, so it has no target; the SLA names ${priorityNames}`);
      else if (pr === null) add('unknown-priority', `${label}: ${fields.priority} ${quote(v.priority)} is not a priority of the SLA, which names ${priorityNames}`);

      const read = (name, text) => {
        const r = parseTimestamp(text, defaultOffset);
        if (r.problem) {
          add('invalid-timestamp', `${label}: ${name} ${quote(text)} ${r.problem}`);
          return null;
        }
        return r.ms;
      };
      let created = null;
      if (v.created === null) add('invalid-timestamp', `${label} has no ${fields.created}, so no time can be counted`);
      else created = read(fields.created, v.created);
      const firstResponse = v.firstResponse === null ? null : read(fields.firstResponse, v.firstResponse);
      const resolved = v.resolved === null ? null : read(fields.resolved, v.resolved);
      const named = [[fields.created, v.created, created], [fields.firstResponse, v.firstResponse, firstResponse], [fields.resolved, v.resolved, resolved]];

      const pauses = [];
      for (const p of v.paused) {
        if (p.bad) {
          add('invalid-timestamp', `${label}: the pause ${quote(p.start)} in ${fields.paused} is not two timestamps joined by /`);
          continue;
        }
        const start = read(`the start of a pause in ${fields.paused}`, p.start);
        const end = p.end === null ? null : read(`the end of a pause in ${fields.paused}`, p.end);
        if (start === null || (p.end !== null && end === null)) continue;
        if (end !== null && end < start) add('timestamps-out-of-order', `${label}: the pause ${quote(`${p.start}/${p.end}`)} in ${fields.paused} ends before it starts`);
        else pauses.push([start, end]);
        named.push([`the start of a pause in ${fields.paused}`, p.start, start]);
        if (end !== null) named.push([`the end of a pause in ${fields.paused}`, p.end, end]);
      }
      const entries = [];
      for (const e of v.history) {
        if (e.bad || !e.status) {
          add('invalid-timestamp', `${label}: the status entry ${quote(e.at)} in ${fields.history} is not a timestamp, a space and a status`);
          continue;
        }
        const ms = read(`a status time in ${fields.history}`, e.at);
        if (ms === null) continue;
        entries.push({ ms, status: e.status });
        named.push([`the status time in ${fields.history}`, e.at, ms]);
      }

      if (created !== null) {
        for (const [name, text, ms] of named.slice(1)) {
          if (ms !== null && ms < created) add('timestamps-out-of-order', `${label}: ${name} ${quote(text)} is before ${fields.created} ${quote(v.created)}`);
        }
      }
      if (asOf) {
        for (const [name, text, ms] of named) {
          if (ms !== null && ms > asOf.ms) add('timestamps-out-of-order', `${label}: ${name} ${quote(text)} is after --as-of ${asOf.text}, so the export is newer than the time the report is made for`);
        }
      }
      if (bad || created === null || pr === null) {
        counts.notJudged += 1;
        continue;
      }
      pauses.push(...pausesOfHistory(entries, config.pausedStatuses));
      if (pauses.length) counts.paused += 1;
      judged.push({ t, label, pr, created, firstResponse, resolved, pauses });
    }
  }

  const waiting = judged.filter((j) => j.resolved === null).length;
  const summary = {
    counts,
    priorities: config.priorities.map((p) => ({
      name: p.name,
      cover: p.cover,
      tickets: 0,
      firstResponse: { target: fmt(p.firstResponseMs), targetMs: p.firstResponseMs, tickets: 0, met: 0, missed: 0, open: 0, atRisk: 0, measured: [] },
      resolution: { target: fmt(p.resolutionMs), targetMs: p.resolutionMs, tickets: 0, met: 0, missed: 0, open: 0, atRisk: 0, measured: [] }
    })),
    days: 0
  };
  if (waiting && !asOf) return { findings, summary: finish(summary), open: waiting };

  let business = null;
  if (judged.some((j) => j.pr.cover === 'business')) {
    let low = asOf ? asOf.ms : Infinity;
    let high = asOf ? asOf.ms : -Infinity;
    for (const j of judged) {
      for (const x of [j.created, j.firstResponse, j.resolved, ...j.pauses.flat()]) {
        if (x === null) continue;
        if (x < low) low = x;
        if (x > high) high = x;
      }
    }
    business = businessClock(calendarOf(config), low, high, limits);
    summary.days = business.days;
  }

  for (const j of judged) {
    const { t, label, pr, created } = j;
    const clock = pr.cover === '24x7' ? AROUND_THE_CLOCK : business;
    const stop = j.resolved ?? asOf.ms;
    const pauses = mergeIntervals(j.pauses.map(([s, e]) => [s, e === null ? stop : Math.min(e, stop)]));
    const row = summary.priorities.find((p) => p.name === pr.name);
    row.tickets += 1;
    const add = (rule, found, d) => findings.push({ rule, file: t.file, line: t.line, ticket: t.ticket, priority: pr.name, found, details: { clock: d.clock, usedMs: d.used, targetMs: d.target, pausedMs: d.paused } });
    const pausedText = (m) => (m.paused > 0 ? `, with ${fmt(m.paused)} of paused cover time not counted` : '');
    const judge = (name, at, targetMs, s) => {
      const clockPauses = config.pausedClocks.includes(name) ? pauses : [];
      s.tickets += 1;
      const stopped = at !== null;
      const m = coverBetween(clock, created, stopped ? at : asOf.ms, clockPauses);
      const d = { clock: name, used: m.used, target: targetMs, paused: m.paused };
      const over = fmt(m.used - targetMs);
      const word = name === 'firstResponse' ? 'first-response' : 'resolution';
      if (stopped) {
        s.measured.push(m.used);
        if (m.used > targetMs) {
          s.missed += 1;
          const what = name === 'firstResponse' ? `the first response came after ${fmt(m.used)} of cover time` : `resolved after ${fmt(m.used)} of cover time`;
          const note = name === 'firstResponse' && j.firstResponse === null ? '; it was resolved with no first response, so the resolution is counted as the first response' : '';
          add(`${word}-missed`, `${label} (${pr.name}): ${what}${pausedText(m)}, ${over} past the target of ${fmt(targetMs)}${note}`, d);
        } else s.met += 1;
        return;
      }
      const what = name === 'firstResponse' ? 'has no first response' : 'is not resolved';
      if (m.used > targetMs) {
        s.missed += 1;
        add(`${word}-overdue`, `${label} (${pr.name}) ${what} after ${fmt(m.used)} of cover time up to --as-of${pausedText(m)}, ${over} past the target of ${fmt(targetMs)}`, d);
        return;
      }
      s.open += 1;
      if (m.used * 100 >= config.warnAt * targetMs) {
        s.atRisk += 1;
        add(`${word}-at-risk`, `${label} (${pr.name}) ${what} yet: ${fmt(m.used)} of the ${fmt(targetMs)} target used up to --as-of (${Math.floor((m.used * 100) / targetMs)}%)${pausedText(m)}, ${fmt(targetMs - m.used)} left`, d);
      }
    };
    judge('firstResponse', j.firstResponse ?? j.resolved, pr.firstResponseMs, row.firstResponse);
    judge('resolution', j.resolved, pr.resolutionMs, row.resolution);
  }
  return { findings, summary: finish(summary), open: waiting };
}

function finish(summary) {
  return {
    counts: summary.counts,
    days: summary.days,
    priorities: summary.priorities.map((p) => ({ name: p.name, cover: p.cover, tickets: p.tickets, firstResponse: tally(p.firstResponse), resolution: tally(p.resolution) }))
  };
}
