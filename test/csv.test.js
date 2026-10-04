import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CsvError, TicketFileError, csvProblem, formatOf, parseCsv, readTickets } from '../src/index.js';
import { HEADER, T, configOf, lineOf } from './helpers.js';

// The CSV reader as RFC 4180 writes the format, and the ticket files in CSV and JSON.

const fields = (text) => parseCsv(text).map((r) => r.fields);
const fails = (text, pattern) => assert.throws(() => parseCsv(text), (e) => e instanceof CsvError && pattern.test(e.reason), text.slice(0, 40));
const fileProblems = (text, file = 'tickets.csv', config = configOf()) => {
  try {
    readTickets(text, file, config);
  } catch (error) {
    assert.ok(error instanceof TicketFileError, error.message);
    return error.problems;
  }
  assert.fail(`not refused: ${text.slice(0, 60)}`);
};

test('csv: fields, quoted fields with commas, doubled quotes and line breaks, and the line each record starts on', () => {
  const text = 'a,b,c\n1,"x, y","say ""hi"""\n2,"two\nlines",z\n3,,\n';
  assert.deepEqual(fields(text), [['a', 'b', 'c'], ['1', 'x, y', 'say "hi"'], ['2', 'two\nlines', 'z'], ['3', '', '']]);
  assert.deepEqual(parseCsv(text).map((r) => r.line), [1, 2, 3, 5]);
  assert.equal(parseCsv(text)[3].line, lineOf(text, '3,,'));
});

test('csv: CR LF, LF and CR end a record, blank lines are passed over, the last line break is optional, and a byte order mark is dropped', () => {
  const want = [['a', 'b'], ['1', '2'], ['3', '4']];
  for (const text of ['a,b\r\n1,2\r\n3,4\r\n', 'a,b\n1,2\n3,4', 'a,b\r1,2\r3,4\r', 'a,b\n\n1,2\n\r\n3,4\n\n', `${String.fromCharCode(0xfeff)}a,b\n1,2\n3,4\n`]) assert.deepEqual(fields(text), want, JSON.stringify(text));
  assert.deepEqual(parseCsv('a,b\n\n\n1,2\n').map((r) => r.line), [1, 4]);
  assert.deepEqual(fields('a,"b\r\nc"\n'), [['a', 'b\r\nc']]);
  assert.deepEqual(parseCsv('"a\r\nb",c\nd,e\n').map((r) => r.line), [1, 3]);
  assert.deepEqual(fields('a,b,\n'), [['a', 'b', '']]);
  assert.deepEqual(fields('a,b,'), [['a', 'b', '']]);
  assert.deepEqual(fields(' a , b '), [[' a ', ' b ']], 'spaces belong to the field');
  assert.deepEqual(fields(''), []);
});

test('csv: a stray quote, text after a closing quote and a quoted field that is not closed are refused with their line and column', () => {
  fails('a,b"c\n', /a quote inside a field that does not start with a quote/);
  fails('a,"b"c\n', /text after the closing quote of a field/);
  fails('a,"b\n1,2\n', /a quoted field that is not closed/);
  try {
    parseCsv('a,b\n1,"x\n');
    assert.fail('not refused');
  } catch (error) {
    assert.equal(csvProblem(error, 'a,b\n1,"x\n'), 'line 2, column 3: a quoted field that is not closed');
  }
  assert.equal(csvProblem(new Error('plain'), ''), 'plain');
});

test('csv: the number of fields, the length of a field and the number of records have limits', () => {
  assert.throws(() => parseCsv('a,b,c\n', { maxFields: 2 }), /more than 2 fields/);
  assert.throws(() => parseCsv('abcdef\n', { maxFieldLength: 5 }), /a field longer than 5 characters/);
  assert.throws(() => parseCsv('"abcdef"\n', { maxFieldLength: 5 }), /a field longer than 5 characters/);
  assert.throws(() => parseCsv('a\nb\nc\n', { maxRecords: 2 }), /more than 2 records/);
});

test('tickets: the format of a file comes from its extension, else from its first character', () => {
  assert.equal(formatOf('a.CSV', '['), 'csv');
  assert.equal(formatOf('a.json', 'id'), 'json');
  assert.equal(formatOf('export.txt', '  [{}]'), 'json');
  assert.equal(formatOf('export.txt', '{"tickets": []}'), 'json');
  assert.equal(formatOf('export.txt', 'id,priority'), 'csv');
  assert.equal(formatOf('export', ''), 'csv');
});

test('tickets: a CSV export is read by the names of its header, in any case and order, with other columns left alone', () => {
  const text = `Priority,ID,Channel,Created,First_Response,Resolved\nhigh,A-1,email,${T('02 09:00')},${T('02 09:30')},\n`;
  const { format, tickets } = readTickets(text, 'x.csv', configOf());
  assert.equal(format, 'csv');
  assert.deepEqual(tickets, [{ file: 'x.csv', line: 2, values: { id: 'A-1', priority: 'high', created: T('02 09:00'), firstResponse: T('02 09:30'), resolved: null, paused: [], history: [] } }]);
  const renamed = configOf({ fields: { id: 'Key', firstResponse: 'Replied' } });
  const other = readTickets(`Key,priority,created,Replied,resolved\nB-2,high,${T('02 09:00')},,\n`, 'y.csv', renamed);
  assert.equal(other.tickets[0].values.id, 'B-2');
});

test('tickets: paused intervals and a status history written in one CSV cell, separated by semicolons', () => {
  const text = `${HEADER},history\nA-1,high,${T('02 09:00')},,,${T('02 10:00')}/${T('02 11:00')}; ${T('03 10:00')}/ ; oops,${T('02 09:00')} open;${T('02 12:00')} on hold;bad\n`;
  const v = readTickets(text, 't.csv', configOf()).tickets[0].values;
  assert.deepEqual(v.paused, [{ start: T('02 10:00'), end: T('02 11:00'), bad: false }, { start: T('03 10:00'), end: null, bad: false }, { start: 'oops', end: null, bad: true }]);
  assert.deepEqual(v.history, [{ at: T('02 09:00'), status: 'open', bad: false }, { at: T('02 12:00'), status: 'on hold', bad: false }, { at: 'bad', status: '', bad: true }]);
});

test('tickets: a CSV export with a missing column, a column named twice or a record of the wrong length stops the run with every problem', () => {
  assert.deepEqual(fileProblems('id,priorty,created,first_response,resolved\n'), ['tickets.csv: line 1: the header has no column "priority" for fields.priority; did you mean "priorty"?']);
  assert.deepEqual(fileProblems(`${HEADER},ID\n`), ['tickets.csv: line 1: the header names the column "ID" twice']);
  const text = `${HEADER}\nA,high,${T('02 09:00')},,,\nB,high\nC,high,${T('02 09:00')},,,,extra\n`;
  assert.deepEqual(fileProblems(text), ['tickets.csv: line 3: 2 fields where the header has 6', 'tickets.csv: line 4: 7 fields where the header has 6']);
  assert.deepEqual(fileProblems(''), ['tickets.csv: holds no header row; the first line names the columns']);
  assert.deepEqual(fileProblems('id,"x\n'), ['tickets.csv: line 1, column 4: a quoted field that is not closed']);
});

test('tickets: a JSON export is a list of tickets or an object with a tickets list, and each ticket keeps its line', () => {
  const list = `[\n  {"id": 7, "priority": "high", "created": "${T('02 09:00')}", "first_response": null, "resolved": ""}\n]\n`;
  const r = readTickets(list, 'x.json', configOf());
  assert.equal(r.format, 'json');
  assert.deepEqual(r.tickets[0], { file: 'x.json', line: 2, values: { id: '7', priority: 'high', created: T('02 09:00'), firstResponse: null, resolved: null, paused: [], history: [] } });
  const wrapped = `{\n  "exported": "yes",\n  "tickets": [\n    {"id": "A", "priority": "high", "created": "${T('02 09:00')}", "first_response": null, "resolved": null,\n     "paused": [{"start": "${T('02 10:00')}", "end": null}, "${T('02 11:00')}/${T('02 12:00')}"],\n     "history": [{"at": "${T('02 09:00')}", "status": "Pending"}, "${T('02 13:00')} open"]}\n  ]\n}\n`;
  const w = readTickets(wrapped, 'w.json', configOf()).tickets[0];
  assert.equal(w.line, lineOf(wrapped, '{"id": "A"'));
  assert.deepEqual(w.values.paused, [{ start: T('02 10:00'), end: null, bad: false }, { start: T('02 11:00'), end: T('02 12:00'), bad: false }]);
  assert.deepEqual(w.values.history, [{ at: T('02 09:00'), status: 'Pending', bad: false }, { at: T('02 13:00'), status: 'open', bad: false }]);
  assert.deepEqual(readTickets('[]', 'e.json', configOf()).tickets, []);
  assert.equal(readTickets(`[{"id": "S", "priority": "high", "created": "${T('02 09:00')}", "first_response": null, "resolved": null, "paused": "${T('02 10:00')}/${T('02 11:00')}", "history": "${T('02 10:00')} pending"}]`, 's.json', configOf()).tickets[0].values.history[0].status, 'pending');
});

test('tickets: a JSON export of the wrong shape, a value of the wrong kind or a field no ticket has stops the run', () => {
  assert.deepEqual(fileProblems('{"items": []}', 'x.json'), ['x.json: line 1: a JSON ticket file holds a list of tickets, or an object whose "tickets" key holds one']);
  assert.deepEqual(fileProblems('[1]', 'x.json'), ['x.json: line 1: ticket 1 of the list is not an object']);
  assert.deepEqual(fileProblems('[{"id": "A"}]', 'x.json'), ['priority', 'created', 'first_response', 'resolved'].map((k) => `x.json: no ticket has the key "${k}" for fields.${k === 'first_response' ? 'firstResponse' : k}; name the key of the export in fields.${k === 'first_response' ? 'firstResponse' : k}`));
  const base = `"priority": "high", "created": "${T('02 09:00')}", "first_response": null, "resolved": null`;
  assert.deepEqual(fileProblems(`[{"id": ["A"], ${base}}]`, 'x.json'), ['x.json: line 1: id must be a text, not a list']);
  assert.deepEqual(fileProblems(`[{"id": "A", ${base}, "paused": 3}]`, 'x.json'), ['x.json: line 1: paused must be a list or a text, not a number']);
  assert.deepEqual(fileProblems(`[{"id": "A", ${base}, "paused": [3]}]`, 'x.json'), ['x.json: line 1: paused[0] must be a text or an object, not a number']);
  assert.deepEqual(fileProblems(`[{"id": "A", ${base}, "history": [{"at": 3, "status": "x"}]}]`, 'x.json'), ['x.json: line 1: history[0]: at and status must be texts']);
  assert.match(fileProblems('{"a": 1, "a": 2}', 'x.json')[0], /x\.json: line 1, column 10: the name "a" appears twice/);
  assert.match(fileProblems('[{"id": "A",}]', 'x.json')[0], /no trailing comma/);
});

test('tickets: more paused intervals or status entries in one ticket than the limit stops the run', () => {
  const many = Array.from({ length: 4 }, () => `${T('02 10:00')}/${T('02 11:00')}`).join(';');
  const problems = (() => {
    try {
      readTickets(`${HEADER}\nA,high,${T('02 09:00')},,,${many}\n`, 't.csv', configOf(), { maxPerTicket: 3 });
    } catch (error) {
      return error.problems;
    }
    return [];
  })();
  assert.deepEqual(problems, ['t.csv: line 2: more than 3 paused intervals in one ticket (4)']);
});
