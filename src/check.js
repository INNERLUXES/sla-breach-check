// A run: read the configuration and the ticket files, run the checks, and build the report of the run. An input that
// cannot be read, a folder with no ticket file in it, a file whose shape is wrong (a CSV record with the wrong number of
// fields, a header without a field the tool needs), or open tickets with no --as-of stop the run with an InputError and
// no result, so a run never passes because a part of the input was passed over.

import { analyse } from './analyse.js';
import { CALENDAR_LIMITS, CalendarError } from './calendar.js';
import { ConfigError, readConfig } from './config.js';
import { CSV_LIMITS } from './csv.js';
import { LEVELS, NOTICE, POINTS, pointPage } from './data.js';
import { FILE_LIMITS, collectFiles, readText, readTextFile } from './files.js';
import { RULES, atOrAbove, decide } from './rules.js';
import { grouped, plural } from './size.js';
import { safeText } from './text.js';
import { TICKET_LIMITS, TicketFileError, readTickets } from './tickets.js';

export const LIMITS = { ...FILE_LIMITS, ...CSV_LIMITS, ...TICKET_LIMITS, ...CALENDAR_LIMITS, maxTickets: 500000, maxFindingsPerRule: 500 };
export const MAX_PROBLEMS = 20;

export class InputError extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

// A copy of a value with every text in it cleaned by safeText, for the parts of the report that come from the input.
export function cleanTexts(value) {
  if (typeof value === 'string') return safeText(value, 300);
  if (Array.isArray(value)) return value.map(cleanTexts);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, cleanTexts(v)]));
  return value;
}

// A list of problems for an error message: the first twenty, then a count.
export function capped(problems) {
  return problems.length > MAX_PROBLEMS ? [...problems.slice(0, MAX_PROBLEMS), `and ${grouped(problems.length - MAX_PROBLEMS)} more`] : problems;
}

const seconds = (ms) => (ms === null ? null : ms / 1000);

// The run as a report object, from the tickets that were read (src/tickets.js), the configuration and --as-of.
export function buildReport({ input, files, config, asOf = null, minSeverity, version, limits = LIMITS }) {
  let analysis;
  try {
    analysis = analyse(files, config, asOf, limits);
  } catch (error) {
    if (error instanceof CalendarError) throw new InputError([error.message]);
    throw error;
  }
  const { findings: raw, summary, open } = analysis;
  if (open && !asOf) throw new InputError([`${plural(open, 'ticket')} ${open === 1 ? 'is' : 'are'} open; give --as-of <timestamp> to count ${open === 1 ? 'its' : 'their'} time up to that moment, since the tool reads no clock`]);
  const ruleOrder = new Map(RULES.map((r, i) => [r.id, i]));
  const fileOrder = new Map(files.map((f, i) => [f.file, i]));
  const levelOf = (id) => config.rules[RULES.find((r) => r.id === id).key];
  const order = (a, b) => LEVELS.indexOf(b.level) - LEVELS.indexOf(a.level) || fileOrder.get(a.file) - fileOrder.get(b.file) || a.line - b.line || ruleOrder.get(a.rule) - ruleOrder.get(b.rule);
  const all = raw.filter((f) => levelOf(f.rule) !== 'off').map((f) => ({ ...f, level: levelOf(f.rule) })).sort(order);
  const shown = all.filter((f) => atOrAbove(f.level, minSeverity));
  const hidden = all.length - shown.length;
  const perRule = new Map();
  const findings = [];
  let cut = 0;
  for (const f of shown) {
    const n = (perRule.get(f.rule) ?? 0) + 1;
    perRule.set(f.rule, n);
    if (n > limits.maxFindingsPerRule) cut += 1;
    else {
      const rule = RULES.find((r) => r.id === f.rule);
      const file = safeText(f.file);
      const d = f.details;
      findings.push({
        rule: f.rule,
        level: f.level,
        file,
        line: f.line,
        column: null,
        at: `${file}:${f.line}`,
        ticket: f.ticket === null ? null : safeText(f.ticket, 80),
        priority: f.priority === null ? null : safeText(f.priority, 80),
        found: safeText(f.found, 600),
        clock: d ? d.clock : null,
        usedSeconds: d ? seconds(d.usedMs) : null,
        targetSeconds: d ? seconds(d.targetMs) : null,
        pausedSeconds: d ? seconds(d.pausedMs) : null,
        basis: rule.basis.map((k) => ({ text: POINTS[k].text, source: pointPage(k).title, url: pointPage(k).url })),
        own: rule.own
      });
    }
  }
  // The result counts every finding at or above the minimum severity, including the ones past the limit of a rule.
  const result = decide(shown);
  const notes = [];
  if (input.skippedLinks) notes.push(`${plural(input.skippedLinks, 'symbolic link')} inside the folders ${input.skippedLinks === 1 ? 'was' : 'were'} skipped, not followed`);
  if (cut) notes.push(`${plural(cut, 'finding')} past the limit of ${grouped(limits.maxFindingsPerRule)} per rule ${cut === 1 ? 'is' : 'are'} counted but not listed`);
  if (hidden) notes.push(`${plural(hidden, 'finding')} below ${minSeverity} ${hidden === 1 ? 'is' : 'are'} not shown`);
  const off = RULES.filter((r) => config.rules[r.key] === 'off');
  if (off.length) notes.push(`${plural(off.length, 'rule')} ${off.length === 1 ? 'is' : 'are'} off: ${off.map((r) => r.id).join(', ')}`);
  const byLevel = { error: 0, warning: 0, notice: 0 };
  for (const f of shown) byLevel[f.level] += 1;
  const clockOut = (c) => ({ target: c.target, targetSeconds: seconds(c.targetMs), tickets: c.tickets, met: c.met, missed: c.missed, open: c.open, atRisk: c.atRisk, share: c.share, medianSeconds: seconds(c.medianMs), p90Seconds: seconds(c.p90Ms) });
  return {
    tool: 'sla-breach-check',
    version,
    input: { paths: input.paths.map((p) => safeText(p)), files: files.map((f) => ({ file: safeText(f.file), format: f.format, tickets: f.tickets.length })) },
    asOf: asOf === null ? null : safeText(asOf.text, 60),
    config: {
      file: config.file === null ? null : safeText(config.file),
      name: config.name === null ? null : safeText(config.name, 120),
      priorities: config.priorities.map((p) => ({ name: safeText(p.name, 60), firstResponse: p.firstResponse, resolution: p.resolution, cover: p.cover, aliases: p.aliases.map((a) => safeText(a, 60)) })),
      timezone: safeText(config.timezone, 64),
      workingDays: config.workingDays,
      workingHours: config.workingHours,
      holidays: config.holidays,
      defaultOffset: config.defaultOffset,
      fields: cleanTexts(config.fields),
      pausedStatuses: config.pausedStatuses,
      pausedClocks: config.pausedClocks,
      warnAt: config.warnAt,
      files: config.files,
      exclude: config.exclude,
      minSeverity,
      rules: RULES.map((r) => ({ id: r.id, key: r.key, level: config.rules[r.key], rule: safeText(r.rule(config), 600) }))
    },
    summary: {
      tickets: summary.counts.tickets,
      resolved: summary.counts.resolved,
      open: summary.counts.open,
      notJudged: summary.counts.notJudged,
      withPauses: summary.counts.paused,
      priorities: summary.priorities.map((p) => ({ name: safeText(p.name, 60), cover: p.cover, tickets: p.tickets, firstResponse: clockOut(p.firstResponse), resolution: clockOut(p.resolution) }))
    },
    findings,
    totals: { findings: shown.length, byLevel, hidden, notListed: cut },
    result,
    notes: notes.map((n) => safeText(n, 600)),
    notice: NOTICE
  };
}

// Reads the configuration and the ticket files named and checks them: the report object of the run.
export async function checkPaths({ inputs, config: configPath, asOf = null, minSeverity = null, version = '0.0.0', limits = LIMITS, base = process.cwd() }) {
  let config;
  try {
    const c = await readTextFile(configPath, base, limits.maxConfigBytes);
    config = readConfig(c.text, c.file);
  } catch (error) {
    if (error instanceof ConfigError) throw new InputError(capped(error.problems));
    throw new InputError([error.message]);
  }
  let collected;
  try {
    collected = await collectFiles(inputs, base, config, limits);
  } catch (error) {
    throw new InputError([error.message]);
  }
  const files = [];
  const problems = [];
  let total = 0;
  let tickets = 0;
  for (const { full, shown } of collected.files) {
    try {
      const { text, size } = await readText(full, shown, limits.maxFileBytes);
      total += size;
      if (total > limits.maxTotalBytes) throw new Error(`${shown}: the files read so far hold more than ${grouped(limits.maxTotalBytes)} bytes, the limit of one run`);
      try {
        const read = readTickets(text, shown, config, limits);
        tickets += read.tickets.length;
        if (tickets > limits.maxTickets) throw new Error(`${shown}: the files read so far hold more than ${grouped(limits.maxTickets)} tickets, the limit of one run`);
        files.push({ file: shown, format: read.format, tickets: read.tickets });
      } catch (error) {
        if (error instanceof TicketFileError) problems.push(...error.problems);
        else throw error;
      }
    } catch (error) {
      problems.push(error.message);
      if (/the limit of one run/.test(error.message)) break;
    }
  }
  if (problems.length) throw new InputError(capped(problems));
  return buildReport({ input: { paths: collected.named, skippedLinks: collected.skippedLinks }, files, config, asOf, minSeverity: minSeverity ?? config.minSeverity, version, limits });
}
