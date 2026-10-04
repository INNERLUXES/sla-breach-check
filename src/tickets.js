// A ticket export, in CSV with a header row or in JSON as a list of ticket objects (or an object whose "tickets" key holds
// that list), read into tickets of one shape: the file, the line on which the ticket starts, and the text of each field
// named in the configuration. Paused intervals and a status history are read into lists. What makes the file itself
// unreadable (a CSV record with the wrong number of fields, a header without a field the tool needs, a JSON value of the
// wrong kind) is a problem of the file, and stops the run; what is wrong with one ticket (an empty or unreadable
// timestamp, an unknown priority) is left to the rules, so the rest of the export is still judged.

import { CSV_LIMITS, CsvError, csvProblem, parseCsv } from './csv.js';
import { DEFAULT_FIELDS, REQUIRED_FIELDS } from './defaults.js';
import { JsonError, jsonProblem, parseJson } from './json.js';
import { suggestion } from './config.js';
import { asciiLower } from './words.js';

export const TICKET_LIMITS = { maxPerTicket: 1000, maxJsonValues: 20000000 };

export class TicketFileError extends Error {
  constructor(problems) {
    super(problems.join('; '));
    this.problems = problems;
  }
}

// The format of a file: by its extension, else by its first character that is not a space.
export function formatOf(file, text) {
  const lower = asciiLower(file);
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.json')) return 'json';
  const first = /\S/.exec(text);
  return first && (first[0] === '[' || first[0] === '{') ? 'json' : 'csv';
}

const FIELD_KEYS = Object.keys(DEFAULT_FIELDS);
const LIST_FIELDS = ['paused', 'history'];

// The items of a list written in one text: separated by semicolons, with the spaces around each dropped.
const itemsOf = (text) => String(text).split(';').map((s) => s.trim()).filter(Boolean);

// One paused interval written as text: two timestamps joined by a slash; the end may be left empty for a pause that
// has not ended.
function pauseOfText(text) {
  const parts = text.split('/');
  if (parts.length !== 2) return { start: text, end: null, bad: true };
  return { start: parts[0].trim(), end: parts[1].trim() || null, bad: false };
}

// One entry of a status history written as text: a timestamp, a space and the status.
function entryOfText(text) {
  const at = text.search(/\s/);
  if (at < 0) return { at: text, status: '', bad: true };
  return { at: text.slice(0, at), status: text.slice(at + 1).trim(), bad: false };
}

// Reads a ticket file: { format, tickets: [{ file, line, values }] }, or throws TicketFileError with its problems.
export function readTickets(text, file, config, limits = {}) {
  const lim = { ...CSV_LIMITS, ...TICKET_LIMITS, ...limits };
  const format = formatOf(file, text);
  const problems = [];
  const tickets = [];
  const tooMany = (n, what, where) => problems.push(`${file}: ${where}: more than ${lim.maxPerTicket.toLocaleString('en-US')} ${what} in one ticket (${n.toLocaleString('en-US')})`);

  if (format === 'csv') {
    let rows;
    try {
      rows = parseCsv(text, lim);
    } catch (error) {
      if (error instanceof CsvError) throw new TicketFileError([`${file}: ${csvProblem(error, text)}`]);
      throw error;
    }
    if (!rows.length) throw new TicketFileError([`${file}: holds no header row; the first line names the columns`]);
    const header = rows[0].fields.map((h) => h.trim());
    const at = new Map();
    header.forEach((h, i) => {
      const k = asciiLower(h);
      if (at.has(k)) problems.push(`${file}: line ${rows[0].line}: the header names the column "${h.slice(0, 60)}" twice`);
      else at.set(k, i);
    });
    const column = {};
    for (const k of FIELD_KEYS) {
      const name = config.fields[k];
      if (at.has(asciiLower(name))) column[k] = at.get(asciiLower(name));
      else if (REQUIRED_FIELDS.includes(k)) problems.push(`${file}: line ${rows[0].line}: the header has no column "${name.slice(0, 60)}" for fields.${k}${suggestion(name, header.filter((h) => h.length <= 120))}`);
    }
    if (problems.length) throw new TicketFileError(problems);
    for (const row of rows.slice(1)) {
      if (row.fields.length !== header.length) {
        problems.push(`${file}: line ${row.line}: ${row.fields.length} ${row.fields.length === 1 ? 'field' : 'fields'} where the header has ${header.length}`);
        continue;
      }
      const values = {};
      for (const k of FIELD_KEYS) {
        if (!Object.hasOwn(column, k)) values[k] = LIST_FIELDS.includes(k) ? [] : null;
        else if (k === 'paused') values[k] = itemsOf(row.fields[column[k]]).map(pauseOfText);
        else if (k === 'history') values[k] = itemsOf(row.fields[column[k]]).map(entryOfText);
        else values[k] = row.fields[column[k]].trim() || null;
      }
      if (values.paused.length > lim.maxPerTicket) tooMany(values.paused.length, 'paused intervals', `line ${row.line}`);
      if (values.history.length > lim.maxPerTicket) tooMany(values.history.length, 'status entries', `line ${row.line}`);
      tickets.push({ file, line: row.line, values });
    }
    if (problems.length) throw new TicketFileError(problems);
    return { format, tickets };
  }

  let parsed;
  try {
    parsed = parseJson(text, { linesUpTo: 2, maxValues: lim.maxJsonValues, maxStringLength: lim.maxFieldLength });
  } catch (error) {
    if (error instanceof JsonError) throw new TicketFileError([`${file}: ${jsonProblem(error, text)}`]);
    throw error;
  }
  const { value, lines } = parsed;
  let list;
  let prefix = '';
  if (Array.isArray(value)) list = value;
  else if (value !== null && typeof value === 'object' && Array.isArray(value.tickets)) {
    list = value.tickets;
    prefix = 'tickets';
  } else throw new TicketFileError([`${file}: line 1: a JSON ticket file holds a list of tickets, or an object whose "tickets" key holds one`]);
  const lineAt = (i) => lines.get(`${prefix}[${i}]`) ?? 1;
  const seen = new Set();
  list.forEach((t, i) => {
    const where = `line ${lineAt(i)}`;
    if (t === null || typeof t !== 'object' || Array.isArray(t)) {
      problems.push(`${file}: ${where}: ticket ${i + 1} of the list is not an object`);
      return;
    }
    const values = {};
    for (const k of FIELD_KEYS) {
      const name = config.fields[k];
      const has = Object.hasOwn(t, name);
      if (has) seen.add(k);
      const v = has ? t[name] : null;
      if (LIST_FIELDS.includes(k)) {
        if (v === null) values[k] = [];
        else if (typeof v === 'string') values[k] = itemsOf(v).map(k === 'paused' ? pauseOfText : entryOfText);
        else if (Array.isArray(v)) {
          values[k] = [];
          v.forEach((item, j) => {
            if (typeof item === 'string') values[k].push(k === 'paused' ? pauseOfText(item.trim()) : entryOfText(item.trim()));
            else if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
              const [a, b] = k === 'paused' ? ['start', 'end'] : ['at', 'status'];
              const ok = (x) => x === undefined || x === null || typeof x === 'string';
              if (!ok(item[a]) || !ok(item[b])) problems.push(`${file}: ${where}: ${name}[${j}]: ${a} and ${b} must be texts`);
              else values[k].push(k === 'paused' ? { start: (item.start ?? '').trim(), end: (item.end ?? '').trim() || null, bad: false } : { at: (item.at ?? '').trim(), status: (item.status ?? '').trim(), bad: false });
            } else problems.push(`${file}: ${where}: ${name}[${j}] must be a text or an object, not ${item === null ? 'null' : Array.isArray(item) ? 'a list' : `a ${typeof item}`}`);
          });
        } else problems.push(`${file}: ${where}: ${name} must be a list or a text, not a ${typeof v}`);
        if (values[k] && values[k].length > lim.maxPerTicket) tooMany(values[k].length, k === 'paused' ? 'paused intervals' : 'status entries', where);
      } else if (v === null) values[k] = null;
      else if (typeof v === 'string') values[k] = v.trim() || null;
      else if (typeof v === 'number' || typeof v === 'boolean') values[k] = String(v);
      else problems.push(`${file}: ${where}: ${name} must be a text, not ${Array.isArray(v) ? 'a list' : 'an object'}`);
    }
    tickets.push({ file, line: lineAt(i), values });
  });
  if (tickets.length) {
    for (const k of REQUIRED_FIELDS) if (!seen.has(k)) problems.push(`${file}: no ticket has the key "${config.fields[k].slice(0, 60)}" for fields.${k}; name the key of the export in fields.${k}`);
  }
  if (problems.length) throw new TicketFileError(problems);
  return { format, tickets };
}
