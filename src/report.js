// The reports: text for a terminal, JSON for other tools, and GitHub workflow commands that turn each finding into an
// annotation on the ticket file and line. Every text from the input (a file name, a ticket id, a priority, a value)
// was cleaned by safeText before it reached the report object. The GitHub commands also escape the characters a command
// gives a meaning to, so a value in the input cannot end a command early or start another one.

import { grouped, listText, plural } from './size.js';
import { safeText } from './text.js';
import { formatDuration } from './time.js';

const clean = (t, max = 200) => safeText(t, max);
const pathsText = (r) => r.input.paths.join(', ');

// A share as a percentage with at most one decimal: 75%, 66.7%, or - when nothing was judged.
export function shareText(share) {
  if (share === null) return '-';
  return `${String(Math.round(share * 1000) / 10)}%`;
}

const durationText = (seconds) => (seconds === null ? '-' : formatDuration(seconds * 1000));

function inputLine(r) {
  const s = r.summary;
  return `${pathsText(r)} (${plural(r.input.files.length, 'file')}, ${plural(s.tickets, 'ticket')}: ${grouped(s.resolved)} resolved, ${grouped(s.open)} open)`;
}

function slaLine(r) {
  const c = r.config;
  const where = `${c.file}${c.name ? ` (${clean(c.name, 120)})` : ''}`;
  const priorities = c.priorities.map((p) => `${p.name} ${p.firstResponse} / ${p.resolution}${p.cover === '24x7' ? ' (24x7)' : ''}`).join('; ');
  return `${where}: first response / resolution: ${priorities}`;
}

function coverLine(r) {
  const c = r.config;
  const holidays = c.holidays.length ? `${plural(c.holidays.length, 'holiday')} (${listText(c.holidays, 4)})` : 'no holidays';
  const statuses = c.pausedStatuses.length ? `paused statuses ${listText(c.pausedStatuses, 4)}` : 'no paused statuses';
  const clocks = c.pausedClocks.map((k) => (k === 'firstResponse' ? 'first response' : 'resolution')).join(' and ');
  return `${listText(c.workingDays, 7)}, ${listText(c.workingHours, 6)}, at ${c.timezone}; ${holidays}; ${statuses}; pauses stop ${clocks ? `the ${clocks} ${c.pausedClocks.length > 1 ? 'clocks' : 'clock'}` : 'no clock'}; at risk from ${c.warnAt}% of a target`;
}

const rulesLine = (r) => r.config.rules.map((x) => `${x.id} (${x.level})`).join('; ');

function findingsLine(r) {
  const b = r.totals.byLevel;
  const parts = ['error', 'warning', 'notice'].filter((l) => b[l]).map((l) => `${grouped(b[l])} ${l}`);
  return `${grouped(r.totals.findings)}${parts.length ? ` (${parts.join(', ')})` : ''}${r.totals.hidden ? `; ${grouped(r.totals.hidden)} below ${r.config.minSeverity} not shown` : ''}`;
}

// A table with a header row and its columns padded to the widest cell.
function table(head, rows) {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => `  ${cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ')}`;
  return [line(head), ...rows.map(line)];
}

function clockTable(r, key) {
  const head = ['priority', 'target', 'tickets', 'met', 'missed', 'open', 'at risk', 'met share', 'median', 'p90'];
  const rows = r.summary.priorities.map((p) => {
    const c = p[key];
    return [p.name, c.target, grouped(c.tickets), grouped(c.met), grouped(c.missed), grouped(c.open), grouped(c.atRisk), shareText(c.share), durationText(c.medianSeconds), durationText(c.p90Seconds)];
  });
  return table(head, rows);
}

// The lines that say what was read.
function summaryLines(r) {
  const s = r.summary;
  const rows = [];
  rows.push(['tickets', `${grouped(s.tickets)}: ${grouped(s.resolved)} resolved, ${grouped(s.open)} open; ${grouped(s.notJudged)} not judged for an input problem`]);
  rows.push(['files', listText(r.input.files.map((f) => `${f.file} (${f.format}, ${plural(f.tickets, 'ticket')})`), 6)]);
  rows.push(['paused', `${plural(s.withPauses, 'judged ticket')} with paused time`]);
  const width = Math.max(...rows.map((x) => x[0].length));
  return rows.map(([k, v]) => `  ${k.padEnd(width)}  ${v}`);
}

export function toText(r, { explain = false } = {}) {
  const out = [];
  out.push(`sla-breach-check: ${pathsText(r)}`);
  out.push(`input: ${inputLine(r)}`);
  out.push(`sla: ${slaLine(r)}`);
  out.push(`cover: ${coverLine(r)}`);
  out.push(`as of: ${r.asOf ?? 'not given (every ticket is resolved)'}`);
  out.push(`rules: ${rulesLine(r)}`);
  out.push(`findings: ${findingsLine(r)}`);
  out.push('', `Findings (${grouped(r.findings.length)})`, '');
  if (!r.findings.length) out.push('  none', '');
  const width = Math.max(...r.config.rules.map((x) => x.id.length));
  const pad = ' '.repeat(11);
  for (const f of r.findings) {
    out.push(`  ${f.level.toUpperCase().padEnd(8)} ${f.rule.padEnd(width)}  ${f.at}`);
    out.push(`${pad}${f.found}`);
    if (explain) {
      out.push(`${pad}rule: ${r.config.rules.find((x) => x.id === f.rule).rule}`);
      for (const b of f.basis) out.push(`${pad}basis: ${b.text} (${b.source}, ${b.url})`);
      if (f.own) out.push(`${pad}the tool's own choice: ${f.own}`);
    }
    out.push('');
  }
  out.push('First response, in cover time', '', ...clockTable(r, 'firstResponse'), '');
  out.push('Resolution, in cover time', '', ...clockTable(r, 'resolution'), '');
  out.push(`Read: ${pathsText(r)}`, '');
  out.push(...summaryLines(r), '');
  for (const n of r.notes) out.push(`note: ${n}`);
  if (r.notes.length) out.push('');
  out.push(r.notice, '');
  out.push(`RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}

export function toJson(r, { explain = false } = {}) {
  const out = { ...r, findings: r.findings.map((f) => (explain ? f : { ...f, basis: undefined, own: undefined })) };
  return `${JSON.stringify(out, null, 2)}\n`;
}

// The message of a workflow command: %, CR and LF escaped.
export const escapeData = (t) => String(t).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

// A property of a workflow command: also : and , escaped.
export const escapeProperty = (t) => escapeData(t).replace(/:/g, '%3A').replace(/,/g, '%2C');

const COMMANDS = { error: 'error', warning: 'warning', notice: 'notice' };

export function toGithub(r) {
  const out = [];
  for (const f of r.findings) {
    const props = [`file=${escapeProperty(f.file)}`, `line=${f.line}`, `title=${escapeProperty(`sla-breach-check ${f.rule}`)}`];
    out.push(`::${COMMANDS[f.level]} ${props.join(',')}::${escapeData(f.found)}`);
  }
  out.push(`sla-breach-check: ${pathsText(r)}: ${plural(r.summary.tickets, 'ticket')}, ${grouped(r.totals.findings)} ${r.totals.findings === 1 ? 'finding' : 'findings'}; RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}
