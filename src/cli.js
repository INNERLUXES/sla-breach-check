// Command line: sla-breach-check <ticket-file-or-folder>... --config <sla.json> [--as-of <timestamp>] [options]

import { readFileSync } from 'node:fs';
import { InputError, LIMITS, checkPaths } from './check.js';
import { defaultsAsConfig } from './config.js';
import { LEVELS } from './data.js';
import { toGithub, toJson, toText } from './report.js';
import { RULES } from './rules.js';
import { safeText } from './text.js';
import { parseTimestamp } from './time.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, json: toJson, github: toGithub };

export const USAGE = `Usage: sla-breach-check <ticket-file-or-folder>... --config <sla.json> [--as-of <timestamp>] [options]

Reads a support ticket export (CSV with a header row, or JSON) and the SLA of a configuration file: the first response
and resolution targets of each priority and the cover calendar (time zone, working days, working hours, holidays, or
24x7 cover). It counts the time of each ticket inside the cover hours, without paused time, and reports the targets
that were missed, the open tickets past their target or close to it as of --as-of, the tickets it cannot judge
(missing or unreadable timestamps, times in an order that cannot be, unknown priorities, ids read twice), and for each
priority the tickets met and missed with the median and 90th percentile. It reads no clock: the time of an open ticket
is counted up to --as-of, and nothing else. It opens no network connection and writes nothing to disk.

Options:
  --config <file>           the SLA and the settings, in strict JSON: priorities with their targets and cover,
                            timezone, workingDays, workingHours, holidays, the field names of the export, the paused
                            statuses, warnAt and the level of the rules (--print-defaults shows a sample)
  --as-of <timestamp>       the moment open tickets are measured up to, with Z or an offset, such as
                            YYYY-MM-DDTHH:MM:SSZ; needed when a ticket is open
  --format <name>           text, json or github (default: text); github writes workflow commands that GitHub shows
                            as annotations on the ticket files
  --json                    the same as --format json
  --min-severity <level>    the lowest level of a finding that is shown: ${LEVELS.join(', ')} (default: minSeverity of
                            the configuration, else notice)
  --explain                 show the rule and the public sources behind each finding
  --print-defaults          print the built-in configuration with sample priorities and exit
  --help                    show this text
  --version                 show the version

Rules: ${RULES.map((r) => `${r.id} (rules.${r.key})`).join(', ')}.

Exit codes: 0 no finding at the level error, 1 a finding at the level error, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);
export const MAX_INPUTS = 100;

export function parseArgs(argv) {
  const o = { inputs: [], config: null, asOf: null, format: null, json: false, minSeverity: null, explain: false, printDefaults: false, help: false, version: false };
  const once = (name, current, value) => {
    if (current !== null) throw new Error(`${name} was given twice`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      if (v === '-') throw new Error('reading from standard input is not supported; give a file');
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--explain') o.explain = true;
    else if (a === '--json') o.json = true;
    else if (a === '--print-defaults') o.printDefaults = true;
    else if (a === '--config') o.config = once(a, o.config, next());
    else if (a === '--as-of') o.asOf = once(a, o.asOf, next());
    else if (a === '--format') o.format = once(a, o.format, next());
    else if (a === '--min-severity') o.minSeverity = once(a, o.minSeverity, next());
    else if (a === '-') throw new Error('reading from standard input is not supported; give a file');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else if (o.inputs.includes(a)) throw new Error(`${a} is named twice`);
    else if (o.inputs.length >= MAX_INPUTS) throw new Error(`more than ${MAX_INPUTS} paths; name the folders that hold the files`);
    else o.inputs.push(a);
  }
  if (o.json) {
    if (o.format !== null && o.format !== 'json') throw new Error(`--json and --format ${o.format} ask for two formats; give one`);
    o.format = 'json';
  }
  if (o.format === null) o.format = 'text';
  if (!o.help && !o.version && !o.printDefaults) {
    if (!o.inputs.length) throw new Error('give the ticket export to check: a .csv or .json file or a folder of them, such as sla-breach-check exports/tickets.csv --config sla.json --as-of <timestamp>');
    if (o.config === null) throw new Error('give the SLA with --config <file>; --print-defaults writes a sample to start from');
    for (const p of [...o.inputs, o.config]) if (isUrl(p)) throw new Error('give a local path; the tool never fetches a URL');
    if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, json or github)`);
    if (o.minSeverity !== null && !LEVELS.includes(o.minSeverity)) throw new Error(`unknown level ${o.minSeverity} (${LEVELS.join(', ')})`);
    if (o.asOf !== null) {
      const t = parseTimestamp(o.asOf);
      if (t.problem) throw new Error(`--as-of ${o.asOf.slice(0, 60)} ${t.problem.replace(', or set defaultOffset in the configuration', '')}`);
      o.asOf = { text: o.asOf.trim(), ms: t.ms };
    }
  }
  return o;
}

const clean = (text) => safeText(text, 1500);

// Exit code: 0 no finding at the level error, 1 a finding at the level error, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = undefined, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`sla-breach-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  if (o.printDefaults) {
    io.out(`${JSON.stringify(defaultsAsConfig(), null, 2)}\n`);
    return 0;
  }
  let report;
  try {
    report = await checkPaths({ inputs: o.inputs, config: o.config, asOf: o.asOf, minSeverity: o.minSeverity, version: VERSION, limits: { ...LIMITS, ...(limits ?? {}) }, base });
  } catch (error) {
    if (error instanceof InputError) io.err(`sla-breach-check: no result, the input has ${error.problems.length === 1 ? 'a problem' : 'problems'}:\n${error.problems.map((p) => `  ${clean(p)}`).join('\n')}\n`);
    else io.err(`sla-breach-check: ${clean(error.message)}\n`);
    return 2;
  }
  io.out(FORMATS[o.format](report, { explain: o.explain }));
  return report.result.pass ? 0 : 1;
}
