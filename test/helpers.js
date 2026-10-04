// Shared test helpers: ticket exports and configurations built inline, checked in memory or written into a temporary
// folder that is removed after the test. Paths are built with resolve() from forward-slash names, so the same test runs
// on Linux, macOS and Windows. The line a test expects is found with lineOf(), which counts lines the way the tool does,
// so a test never holds a line number worked out by hand for one system only. No test reads the clock, the time zone or
// the locale: every moment is written out, in the made-up year of the examples.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { buildReport, lineStarts, main, parseTimestamp, positionOf, readConfig, readTickets } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'sla-breach-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function offsetOf(text, needle, n) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return at;
}

// The line (from 1) of the n-th place where needle starts in text.
export const lineOf = (text, needle, n = 1) => positionOf(lineStarts(text), offsetOf(text, needle, n)).line;

// A moment of the made-up week of the tests, in UTC: T('02 09:00') is the second day of the third month of the made-up
// year at 09:00Z, a Monday. The days 02 to 06 are Monday to Friday, 07 and 08 the weekend, 09 and 10 Monday and Tuesday.
export const T = (dayAndTime) => {
  const [day, time] = dayAndTime.split(' ');
  return `3001-03-${day}T${time}:00Z`;
};

// A timestamp in another year, for the tests of the calendar rules and the limits; the year is built from a number so
// that the only full dates written out in the repository are in the made-up year.
export const inYear = (year, rest = '03-02T09:00:00Z') => `${String(year).padStart(4, '0')}-${rest}`;

// The milliseconds of such a moment.
export const ms = (dayAndTime) => parseTimestamp(T(dayAndTime)).ms;

// A small SLA: urgent around the clock, high and normal under business cover from 09:00 to 17:00 UTC on weekdays.
export const SLA = {
  name: 'Test SLA',
  priorities: {
    urgent: { firstResponse: '30m', resolution: '4h', cover: '24x7', aliases: ['P1'] },
    high: { firstResponse: '1h', resolution: '8h' },
    normal: { firstResponse: '4h', resolution: '16h', aliases: ['P3 - Normal'] }
  },
  timezone: 'Z',
  workingHours: ['09:00-17:00']
};

// The configuration of a configuration object, through the real reader; SLA with the keys given over it by default.
export const configOf = (object = {}) => readConfig(JSON.stringify({ ...SLA, ...object }), 'sla.json');

export const HEADER = 'id,priority,created,first_response,resolved,paused';

// A CSV export with the header above, from rows of [id, priority, created, first_response, resolved, paused].
export const csv = (...rows) => `${[HEADER, ...rows.map((r) => [...r, ...Array(Math.max(0, 6 - r.length)).fill(null)].map((c) => c ?? '').join(','))].join('\n')}\n`;

// The report object of exports checked in memory: one CSV text (tickets.csv), or an object of file name to text, with a
// configuration object over the SLA above, and --as-of as a moment of T() or none.
export function reportOf(input, config = {}, { asOf = null, minSeverity = 'notice' } = {}) {
  const sources = typeof input === 'string' ? { 'tickets.csv': input } : input;
  const cfg = configOf(config);
  const files = Object.entries(sources).map(([file, text]) => ({ file, ...readTickets(text, file, cfg) }));
  const at = asOf === null ? null : { text: T(asOf), ms: ms(asOf) };
  return buildReport({ input: { paths: Object.keys(sources), skippedLinks: 0 }, files, config: cfg, asOf: at, minSeverity, version: 'test' });
}

// The findings of a report, of one rule or of all.
export const findingsOf = (r, rule) => r.findings.filter((f) => !rule || f.rule === rule);

// The rule ids of the findings of a report, in order.
export const rulesOf = (r) => r.findings.map((f) => f.rule);

// The rule ids of the findings of one row, checked as of a moment.
export const rulesOfRow = (row, config = {}, asOf = '10 15:00') => rulesOf(reportOf(csv(row), config, { asOf }));

// Writes the files and runs the command line with these arguments (paths relative to the folder).
export async function run(files, args = [], limits) {
  return withFiles(files, async (dir) => {
    let out = '';
    let err = '';
    const code = await main(args, { out: (t) => { out += t; }, err: (t) => { err += t; } }, limits, dir);
    return { code, out, err, dir };
  });
}

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, dir) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, dir);
  return { code, out, err };
}

// The SLA as the text of a configuration file, for the command line.
export const SLA_FILE = JSON.stringify(SLA, null, 2);
