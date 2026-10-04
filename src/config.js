// The configuration file: the SLA (the targets of every priority and the cover calendar) and the settings of the tool,
// in one strict JSON object over the built-in defaults. A list is either a JSON array, which replaces the built-in list,
// or an object with "replace", "add" and "remove". Every key the tool does not know is an error with its line and a
// suggestion, so a typo cannot leave a default in place unnoticed; the JSON reader refuses a name given twice in one
// object.

import { LEVELS } from './data.js';
import { CLOCKS, COVER_KINDS, DEFAULT_COVER, DEFAULT_EXCLUDE, DEFAULT_FIELDS, DEFAULT_FILES, DEFAULT_HOLIDAYS, DEFAULT_MIN_SEVERITY, DEFAULT_OFFSET, DEFAULT_PAUSED_CLOCKS, DEFAULT_PAUSED_STATUSES, DEFAULT_RULES, DEFAULT_TIMEZONE, DEFAULT_WARN_AT, DEFAULT_WORKING_DAYS, DEFAULT_WORKING_HOURS, SAMPLE_PRIORITIES } from './defaults.js';
import { globProblem } from './glob.js';
import { JsonError, jsonProblem, parseJson } from './json.js';
import { WEEKDAYS, formatDate, parseDate, parseDuration, parseOffset, parseSpan } from './time.js';
import { asciiLower, normalizePhrase } from './words.js';
import { readZone } from './zone.js';

export const CONFIG_LIMITS = { maxEntries: 500, maxEntryLength: 120, maxPriorities: 100 };

// The keys of one priority.
export const PRIORITY_KEYS = { firstResponse: 'duration', resolution: 'duration', cover: '"business" or "24x7"', aliases: 'list of names' };

// Every key of the configuration file, with the kind of its value. docs/inputs.md describes each of them.
export const KEYS = {
  name: 'text',
  priorities: 'object of priorities, each with its targets',
  timezone: 'offset such as +01:00 or Z, or a time zone name such as Europe/Berlin',
  workingDays: 'list of weekdays',
  workingHours: 'list of spans such as 09:00-17:00',
  holidays: 'list of dates YYYY-MM-DD',
  defaultOffset: 'offset, or null',
  fields: Object.fromEntries(Object.keys(DEFAULT_FIELDS).map((k) => [k, 'column or key name'])),
  pausedStatuses: 'list of statuses',
  pausedClocks: 'list of clocks',
  warnAt: 'percentage',
  files: 'list of file patterns',
  exclude: 'list of file patterns',
  rules: Object.fromEntries(Object.keys(DEFAULT_RULES).map((k) => [k, 'level or off'])),
  minSeverity: 'level'
};

const LIST_OPS = ['replace', 'add', 'remove'];

export class ConfigError extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

// The edit distance of two short names, for a suggestion: an insertion, a deletion, a change or two neighbours swapped
// ("nmae" for "name") each count one.
export function distance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

// The closest of the known names, when it is close enough to be a typo: "; did you mean ...?" or nothing. A name longer
// than any known name by more than a few characters is not compared.
export function suggestion(name, known) {
  let best = null;
  for (const k of known) {
    if (Math.abs(name.length - k.length) > 3) continue;
    const d = distance(asciiLower(name), asciiLower(k));
    if (d <= Math.max(1, Math.floor(k.length / 3)) && (!best || d < best.d)) best = { k, d };
  }
  return best ? `; did you mean "${best.k}"?` : '';
}

export function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'an object';
  return `a ${typeof value}`;
}

export const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// The calendar of a configuration as the clocks use it: the zone, the weekday indexes, the spans in minutes and the
// holidays as day numbers.
export function calendarOf(c) {
  return { zone: c.zone, workingDays: c.workingDays.map((d) => WEEKDAYS.indexOf(d)), spans: c.workingHours.map(parseSpan), holidays: c.holidays.map(parseDate) };
}

// The built-in configuration, as the checks use it. It names no priority: those come from the configuration file.
export function defaultConfig() {
  return {
    file: null,
    name: null,
    priorities: [],
    timezone: DEFAULT_TIMEZONE,
    zone: readZone(DEFAULT_TIMEZONE),
    workingDays: [...DEFAULT_WORKING_DAYS],
    workingHours: [...DEFAULT_WORKING_HOURS],
    holidays: [...DEFAULT_HOLIDAYS],
    defaultOffset: DEFAULT_OFFSET,
    fields: { ...DEFAULT_FIELDS },
    pausedStatuses: DEFAULT_PAUSED_STATUSES.map(normalizePhrase),
    pausedClocks: [...DEFAULT_PAUSED_CLOCKS],
    warnAt: DEFAULT_WARN_AT,
    files: [...DEFAULT_FILES],
    exclude: [...DEFAULT_EXCLUDE],
    rules: { ...DEFAULT_RULES },
    minSeverity: DEFAULT_MIN_SEVERITY
  };
}

// The built-in configuration written as a configuration file with the sample priorities, for --print-defaults. Read
// back, it gives the defaults with those priorities.
export function defaultsAsConfig() {
  const d = defaultConfig();
  return { name: 'built-in defaults with sample priorities', priorities: SAMPLE_PRIORITIES, timezone: d.timezone, workingDays: d.workingDays, workingHours: d.workingHours, holidays: d.holidays, defaultOffset: d.defaultOffset, fields: d.fields, pausedStatuses: d.pausedStatuses, pausedClocks: d.pausedClocks, warnAt: d.warnAt, files: d.files, exclude: d.exclude, rules: d.rules, minSeverity: d.minSeverity };
}

const minutesOf = (span) => span.map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`).join('-');

// Checks a parsed configuration and builds the configuration the checks use, or throws ConfigError with every problem.
export function validateConfig(value, lines = new Map(), file = 'config') {
  const problems = [];
  const lineOf = (path) => {
    for (let p = path, prev = null; p && p !== prev; prev = p, p = p.replace(/(?:\.[^.[]+|\[\d+\])$/, '')) if (lines.has(p)) return lines.get(p);
    return 1;
  };
  const fail = (path, message) => problems.push({ line: lineOf(path), text: `${file}: line ${lineOf(path)}: ${message}` });
  const refuse = (path, message, result) => {
    fail(path, message);
    return result;
  };
  const config = defaultConfig();
  config.file = file;
  if (!isObject(value)) throw new ConfigError([`${file}: line 1: the configuration must be a JSON object, not ${kindOf(value)}`]);

  // One entry of a list: a string of 1 to 120 characters, kept in its compared form, or null with a problem.
  const entryOf = (path, e, normalize, hint) => {
    if (typeof e !== 'string') return refuse(path, `${path} must be a text, not ${kindOf(e)}`, null);
    if (e.length === 0 || e.length > CONFIG_LIMITS.maxEntryLength) return refuse(path, `${path} must hold 1 to ${CONFIG_LIMITS.maxEntryLength} characters`, null);
    const n = normalize(e);
    if (n === null) return refuse(path, `${path}: "${e.slice(0, 60)}" is not ${hint}`, null);
    if (!n) return refuse(path, `${path} holds no letter or digit`, null);
    return n;
  };
  const entriesOf = (path, list, normalize, hint) => {
    if (!Array.isArray(list)) return refuse(path, `${path} must be a list, not ${kindOf(list)}`, []);
    if (list.length > CONFIG_LIMITS.maxEntries) return refuse(path, `${path} holds more than ${CONFIG_LIMITS.maxEntries} entries`, []);
    const out = [];
    list.forEach((e, i) => {
      const n = entryOf(`${path}[${i}]`, e, normalize, hint);
      if (n === null) return;
      if (out.includes(n)) fail(`${path}[${i}]`, `${path} names "${n}" twice`);
      else out.push(n);
    });
    return out;
  };
  // A list value: an array that replaces the list, or { replace, add, remove } applied to it in that order.
  const listOf = (path, v, base, normalize, hint = 'a valid entry') => {
    if (Array.isArray(v)) return entriesOf(path, v, normalize, hint);
    if (!isObject(v)) return refuse(path, `${path} must be a list or an object with replace, add or remove, not ${kindOf(v)}`, base);
    for (const k of Object.keys(v)) if (!LIST_OPS.includes(k)) fail(`${path}.${k}`, `"${k.slice(0, 60)}" is not a key of ${path} (replace, add, remove)${suggestion(k, LIST_OPS)}`);
    let out = Object.hasOwn(v, 'replace') ? entriesOf(`${path}.replace`, v.replace, normalize, hint) : [...base];
    if (Object.hasOwn(v, 'remove')) {
      for (const [i, n] of entriesOf(`${path}.remove`, v.remove, normalize, hint).entries()) {
        if (!out.includes(n)) fail(`${path}.remove[${i}]`, `${path}.remove names "${n}", which is not on the list`);
        out = out.filter((x) => x !== n);
      }
    }
    if (Object.hasOwn(v, 'add')) {
      for (const [i, n] of entriesOf(`${path}.add`, v.add, normalize, hint).entries()) {
        if (out.includes(n)) fail(`${path}.add[${i}]`, `${path}.add names "${n}", which is already on the list`);
        else out.push(n);
      }
    }
    if (out.length > CONFIG_LIMITS.maxEntries) fail(path, `${path} holds more than ${CONFIG_LIMITS.maxEntries} entries`);
    return out;
  };

  const top = Object.keys(KEYS);
  for (const k of Object.keys(value)) if (!top.includes(k)) fail(k, `"${k.slice(0, 60)}" is not a key of the configuration${suggestion(k, top)}`);

  if (Object.hasOwn(value, 'name')) {
    if (typeof value.name !== 'string' || value.name.length === 0 || value.name.length > CONFIG_LIMITS.maxEntryLength) fail('name', `name must be a text of 1 to ${CONFIG_LIMITS.maxEntryLength} characters`);
    else config.name = value.name;
  }

  // The priorities: each a name with its two targets, its cover and its aliases. Names and aliases are compared as
  // whole lowercase words and must all differ.
  if (!Object.hasOwn(value, 'priorities')) fail('', 'the configuration names no priority; give "priorities" with the firstResponse and resolution targets of each (--print-defaults shows a sample)');
  else if (!isObject(value.priorities)) fail('priorities', `priorities must be an object of priority names, not ${kindOf(value.priorities)}`);
  else {
    const names = Object.keys(value.priorities);
    if (!names.length) fail('priorities', 'priorities names no priority, so no ticket could be judged');
    if (names.length > CONFIG_LIMITS.maxPriorities) fail('priorities', `priorities names more than ${CONFIG_LIMITS.maxPriorities} priorities`);
    const seen = new Map();
    const claim = (path, label, owner) => {
      const n = normalizePhrase(label);
      if (!n) return refuse(path, `${path} holds no letter or digit`, null);
      if (seen.has(n)) return refuse(path, `${path}: "${label.slice(0, 60)}" is the same priority as ${seen.get(n)}, once compared as lowercase words`, null);
      seen.set(n, `"${owner.slice(0, 60)}"`);
      return n;
    };
    for (const name of names.slice(0, CONFIG_LIMITS.maxPriorities)) {
      const path = `priorities.${name}`;
      const p = value.priorities[name];
      if (name.length > 60) {
        fail(path, 'a priority name must hold 1 to 60 characters');
        continue;
      }
      if (!isObject(p)) {
        fail(path, `${path} must be an object with firstResponse and resolution, not ${kindOf(p)}`);
        continue;
      }
      const key = claim(path, name, name);
      for (const k of Object.keys(p)) if (!Object.hasOwn(PRIORITY_KEYS, k)) fail(`${path}.${k}`, `"${k.slice(0, 60)}" is not a key of a priority (${Object.keys(PRIORITY_KEYS).join(', ')})${suggestion(k, Object.keys(PRIORITY_KEYS))}`);
      const target = (k) => {
        if (!Object.hasOwn(p, k)) return refuse(`${path}`, `${path} has no ${k} target`, null);
        const ms = typeof p[k] === 'string' ? parseDuration(p[k]) : null;
        if (ms === null) return refuse(`${path}.${k}`, `${path}.${k} must be a duration of cover time such as 30m, 4h or 1h30m, not ${typeof p[k] === 'string' ? `"${p[k].slice(0, 40)}"` : kindOf(p[k])}`, null);
        return ms;
      };
      const firstResponseMs = target('firstResponse');
      const resolutionMs = target('resolution');
      let cover = DEFAULT_COVER;
      if (Object.hasOwn(p, 'cover')) {
        if (COVER_KINDS.includes(p.cover)) cover = p.cover;
        else fail(`${path}.cover`, `${path}.cover must be "business" or "24x7"${typeof p.cover === 'string' ? suggestion(p.cover, COVER_KINDS) : ''}`);
      }
      const aliases = [];
      if (Object.hasOwn(p, 'aliases')) {
        if (!Array.isArray(p.aliases)) fail(`${path}.aliases`, `${path}.aliases must be a list, not ${kindOf(p.aliases)}`);
        else {
          p.aliases.slice(0, CONFIG_LIMITS.maxEntries).forEach((a, i) => {
            if (typeof a !== 'string' || a.length === 0 || a.length > 60) fail(`${path}.aliases[${i}]`, `${path}.aliases[${i}] must be a text of 1 to 60 characters`);
            else if (claim(`${path}.aliases[${i}]`, a, name) !== null) aliases.push(a);
          });
        }
      }
      if (key !== null && firstResponseMs !== null && resolutionMs !== null) config.priorities.push({ name, key, firstResponse: p.firstResponse.trim(), firstResponseMs, resolution: p.resolution.trim(), resolutionMs, cover, aliases, keys: [key, ...aliases.map(normalizePhrase)] });
    }
  }

  if (Object.hasOwn(value, 'timezone')) {
    const zone = readZone(value.timezone);
    if (zone === null) fail('timezone', `timezone must be an offset such as +01:00, Z, or a time zone name such as Europe/Berlin that Node knows, not ${typeof value.timezone === 'string' ? `"${value.timezone.slice(0, 60)}"` : kindOf(value.timezone)}`);
    else {
      config.timezone = value.timezone;
      config.zone = zone;
    }
  }
  if (Object.hasOwn(value, 'workingDays')) {
    config.workingDays = listOf('workingDays', value.workingDays, config.workingDays, (e) => {
      const d = asciiLower(e.trim());
      return WEEKDAYS.includes(d) ? d : null;
    }, `a weekday: ${WEEKDAYS.join(', ')}`);
    config.workingDays.sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
  }
  if (Object.hasOwn(value, 'workingHours')) {
    config.workingHours = listOf('workingHours', value.workingHours, config.workingHours, (e) => {
      const s = parseSpan(e);
      return s === null ? null : minutesOf(s);
    }, 'a span HH:MM-HH:MM of one day that ends after it starts, such as 09:00-17:00 (24:00 is the end of the day)');
    const spans = config.workingHours.map(parseSpan).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i += 1) if (spans[i][0] < spans[i - 1][1]) fail('workingHours', `workingHours: ${minutesOf(spans[i - 1])} and ${minutesOf(spans[i])} overlap`);
    config.workingHours = spans.map(minutesOf);
  }
  if (Object.hasOwn(value, 'holidays')) {
    config.holidays = listOf('holidays', value.holidays, config.holidays, (e) => {
      const d = parseDate(e);
      return d === null ? null : formatDate(d);
    }, 'a date YYYY-MM-DD that exists');
    config.holidays.sort();
  }
  if (config.priorities.some((p) => p.cover === 'business') && (!config.workingDays.length || !config.workingHours.length)) fail(Object.hasOwn(value, 'workingDays') && !config.workingDays.length ? 'workingDays' : 'workingHours', 'the calendar has no working day or no working hours, so a priority with business cover could never meet a target');
  if (Object.hasOwn(value, 'defaultOffset')) {
    const v = value.defaultOffset;
    if (v === null) config.defaultOffset = null;
    else if (typeof v === 'string' && parseOffset(v) !== null) config.defaultOffset = v;
    else fail('defaultOffset', `defaultOffset must be an offset such as +01:00 or Z, or null, not ${typeof v === 'string' ? `"${v.slice(0, 40)}"` : kindOf(v)}`);
  }
  if (Object.hasOwn(value, 'fields')) {
    const v = value.fields;
    const keys = Object.keys(DEFAULT_FIELDS);
    if (!isObject(v)) fail('fields', `fields must be an object, not ${kindOf(v)}`);
    else {
      for (const k of Object.keys(v)) {
        const path = `fields.${k}`;
        if (!keys.includes(k)) fail(path, `"${k.slice(0, 60)}" is not a key of fields${suggestion(k, keys)}`);
        else if (typeof v[k] !== 'string' || v[k].trim().length === 0 || v[k].length > CONFIG_LIMITS.maxEntryLength) fail(path, `${path} must be a text of 1 to ${CONFIG_LIMITS.maxEntryLength} characters`);
        else config.fields[k] = v[k].trim();
      }
      const used = new Map();
      for (const k of keys) {
        const n = asciiLower(config.fields[k]);
        if (used.has(n)) fail(`fields.${k}`, `fields.${k} and fields.${used.get(n)} name the same column "${config.fields[k].slice(0, 60)}"`);
        else used.set(n, k);
      }
    }
  }
  if (Object.hasOwn(value, 'pausedStatuses')) config.pausedStatuses = listOf('pausedStatuses', value.pausedStatuses, config.pausedStatuses, normalizePhrase);
  if (Object.hasOwn(value, 'pausedClocks')) config.pausedClocks = listOf('pausedClocks', value.pausedClocks, config.pausedClocks, (e) => (CLOCKS.includes(e) ? e : null), `a clock: ${CLOCKS.join(' or ')}`);
  if (Object.hasOwn(value, 'warnAt')) {
    const v = value.warnAt;
    if (typeof v !== 'number' || !(v > 0) || v > 100) fail('warnAt', `warnAt must be a number above 0 and at most 100 (a share of the target in percent), not ${typeof v === 'number' ? v : kindOf(v)}`);
    else config.warnAt = v;
  }
  const pattern = (e) => (globProblem(e) === null ? e : null);
  for (const key of ['files', 'exclude']) {
    if (Object.hasOwn(value, key)) config[key] = listOf(key, value[key], config[key], pattern, 'a file pattern: a relative path with / in which only * ? and ** (as a whole part) are special, with no .. and no leading slash');
  }
  if (!config.files.length) fail('files', 'files has no pattern left, so no file of a folder would be read');
  if (Object.hasOwn(value, 'rules')) {
    const v = value.rules;
    const keys = Object.keys(DEFAULT_RULES);
    if (!isObject(v)) fail('rules', `rules must be an object, not ${kindOf(v)}`);
    else {
      for (const k of Object.keys(v)) {
        const path = `rules.${k}`;
        if (!keys.includes(k)) fail(path, `"${k.slice(0, 60)}" is not a key of rules${suggestion(k, keys)}`);
        else if (typeof v[k] !== 'string' || ![...LEVELS, 'off'].includes(v[k])) fail(path, `${path} must be one of ${[...LEVELS, 'off'].join(', ')}, not ${typeof v[k] === 'string' ? `"${v[k].slice(0, 40)}"` : kindOf(v[k])}`);
        else config.rules[k] = v[k];
      }
    }
  }
  if (Object.hasOwn(value, 'minSeverity')) {
    if (!LEVELS.includes(value.minSeverity)) fail('minSeverity', `minSeverity must be one of ${LEVELS.join(', ')}`);
    else config.minSeverity = value.minSeverity;
  }
  // The problems in the order of their lines, so the list reads like the file.
  if (problems.length) throw new ConfigError(problems.sort((a, b) => a.line - b.line).map((p) => p.text));
  return config;
}

// Reads the text of a configuration file.
export function readConfig(text, file) {
  let parsed;
  try {
    parsed = parseJson(text, { linesUpTo: 4 });
  } catch (error) {
    if (error instanceof JsonError) throw new ConfigError([`${file}: ${jsonProblem(error, text)}`]);
    throw error;
  }
  return validateConfig(parsed.value, parsed.lines, file);
}
