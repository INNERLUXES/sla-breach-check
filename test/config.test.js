import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_LIMITS, ConfigError, DEFAULT_FIELDS, DEFAULT_FILES, DEFAULT_RULES, HOUR, KEYS, MINUTE, PRIORITY_KEYS, RULES, SAMPLE_PRIORITIES, calendarOf, defaultConfig, defaultsAsConfig, distance, globMatch, globProblem, isIncluded, isObject, kindOf, readConfig, suggestion, validateConfig } from '../src/index.js';
import { SLA } from './helpers.js';

// The configuration file: the SLA and every key with a good value and a bad one, the list forms, the errors with their
// lines, and the file patterns.

const read = (object) => readConfig(JSON.stringify({ ...SLA, ...object }), 'c.json');
const problemsOf = (text) => {
  try {
    readConfig(text, 'c.json');
  } catch (error) {
    assert.ok(error instanceof ConfigError, error.message);
    return error.problems;
  }
  assert.fail(`not refused: ${text}`);
};
const problemsOfObject = (object) => problemsOf(JSON.stringify({ ...SLA, ...object }));

test('config: the defaults, and the defaults written as a file read back with the sample priorities', () => {
  const d = defaultConfig();
  assert.deepEqual(d.priorities, []);
  assert.equal(d.timezone, 'Z');
  assert.deepEqual(d.workingDays, ['mon', 'tue', 'wed', 'thu', 'fri']);
  assert.deepEqual(d.workingHours, ['09:00-17:00']);
  assert.deepEqual(d.fields, DEFAULT_FIELDS);
  assert.deepEqual(d.pausedStatuses, ['pending', 'on hold', 'waiting on customer']);
  assert.deepEqual(d.pausedClocks, ['resolution']);
  assert.equal(d.warnAt, 80);
  assert.equal(d.defaultOffset, null);
  assert.deepEqual(d.files, DEFAULT_FILES);
  assert.equal(d.minSeverity, 'notice');
  assert.deepEqual(Object.keys(d.rules), RULES.map((r) => r.key));
  const back = readConfig(JSON.stringify(defaultsAsConfig()), 'd.json');
  assert.equal(back.name, 'built-in defaults with sample priorities');
  assert.deepEqual(back.priorities.map((p) => p.name), Object.keys(SAMPLE_PRIORITIES));
  for (const k of ['timezone', 'workingDays', 'workingHours', 'holidays', 'defaultOffset', 'fields', 'pausedStatuses', 'pausedClocks', 'warnAt', 'files', 'exclude', 'rules', 'minSeverity']) assert.deepEqual(back[k], d[k], k);
});

test('config: priorities with their targets, cover and aliases, compared as whole lowercase words', () => {
  const c = read({});
  assert.deepEqual(c.priorities.map((p) => [p.name, p.firstResponseMs, p.resolutionMs, p.cover]), [['urgent', 30 * MINUTE, 4 * HOUR, '24x7'], ['high', HOUR, 8 * HOUR, 'business'], ['normal', 4 * HOUR, 16 * HOUR, 'business']]);
  assert.deepEqual(c.priorities[0].keys, ['urgent', 'p1']);
  assert.deepEqual(c.priorities[2].keys, ['normal', 'p3 normal']);
  assert.equal(read({ priorities: { 'P1 - Critical': { firstResponse: '1h30m', resolution: '100h' } } }).priorities[0].key, 'p1 critical');
});

test('config: the cover calendar: an offset or a zone name, working days, working hours sorted, and holidays', () => {
  assert.equal(read({ timezone: '+05:30' }).zone.offset, 330);
  assert.equal(read({ timezone: 'Etc/GMT-5' }).zone.offset, null);
  const c = read({ workingDays: ['Fri', 'mon'], workingHours: ['13:30-17:30', '09:00-12:30'], holidays: ['3001-03-05', '3001-01-01'] });
  assert.deepEqual(c.workingDays, ['mon', 'fri']);
  assert.deepEqual(c.workingHours, ['09:00-12:30', '13:30-17:30']);
  assert.deepEqual(c.holidays, ['3001-01-01', '3001-03-05']);
  const cal = calendarOf(c);
  assert.deepEqual(cal.workingDays, [0, 4]);
  assert.deepEqual(cal.spans, [[540, 750], [810, 1050]]);
  assert.equal(cal.holidays.length, 2);
  assert.deepEqual(read({ workingDays: { add: ['sat'] } }).workingDays, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']);
  assert.deepEqual(read({ workingDays: { remove: ['fri'] } }).workingDays, ['mon', 'tue', 'wed', 'thu']);
  assert.deepEqual(read({ workingHours: ['00:00-24:00'] }).workingHours, ['00:00-24:00']);
  assert.deepEqual(read({ workingDays: [], priorities: { urgent: { firstResponse: '1h', resolution: '2h', cover: '24x7' } } }).workingDays, [], 'no working day is fine when every priority has 24x7 cover');
});

test('config: the fields of the export, the paused statuses and clocks, warnAt, the default offset, the patterns and the rules', () => {
  const c = read({ fields: { id: ' Key ', firstResponse: 'replied_at' }, pausedStatuses: { add: ['Waiting for Vendor'] }, pausedClocks: ['firstResponse', 'resolution'], warnAt: 75.5, defaultOffset: '+02:00', files: ['exports/*.csv'], exclude: ['**/old/*'], rules: { resolutionAtRisk: 'off', firstResponseAtRisk: 'error' }, minSeverity: 'warning' });
  assert.equal(c.fields.id, 'Key');
  assert.equal(c.fields.firstResponse, 'replied_at');
  assert.equal(c.pausedStatuses.at(-1), 'waiting for vendor');
  assert.deepEqual(c.pausedClocks, ['firstResponse', 'resolution']);
  assert.equal(c.warnAt, 75.5);
  assert.equal(c.defaultOffset, '+02:00');
  assert.deepEqual(c.files, ['exports/*.csv']);
  assert.deepEqual(c.exclude, ['**/old/*']);
  assert.equal(c.rules.resolutionAtRisk, 'off');
  assert.equal(c.rules.firstResponseAtRisk, 'error');
  assert.equal(c.minSeverity, 'warning');
  assert.equal(read({ defaultOffset: null }).defaultOffset, null);
});

test('config: every unknown key is an error with its line and a suggestion, in a priority, in fields and in rules too', () => {
  const p = problemsOf('{\n  "priorites": {},\n  "priorities": {\n    "high": {"firstResponse": "1h", "resolution": "8h", "covr": "24x7"}\n  },\n  "fields": {\n    "firstReponse": "x"\n  },\n  "rules": {\n    "resolutionMised": "off"\n  },\n  "workingDays": {"ad": ["sat"]}\n}');
  assert.deepEqual(p, [
    'c.json: line 2: "priorites" is not a key of the configuration; did you mean "priorities"?',
    'c.json: line 4: "covr" is not a key of a priority (firstResponse, resolution, cover, aliases); did you mean "cover"?',
    'c.json: line 7: "firstReponse" is not a key of fields; did you mean "firstResponse"?',
    'c.json: line 10: "resolutionMised" is not a key of rules; did you mean "resolutionMissed"?',
    'c.json: line 12: "ad" is not a key of workingDays (replace, add, remove); did you mean "add"?'
  ]);
  assert.match(problemsOfObject({ zzzzzz: 1 })[0], /"zzzzzz" is not a key of the configuration$/, 'no suggestion when nothing is close');
});

test('config: a configuration without priorities, or with priorities that cannot be read, is refused', () => {
  assert.match(problemsOf('{}')[0], /^c\.json: line 1: the configuration names no priority; give "priorities"/);
  for (const [priorities, pattern] of [
    [{}, /priorities names no priority/],
    [[], /priorities must be an object of priority names, not a list/],
    [{ high: '1h' }, /priorities\.high must be an object with firstResponse and resolution, not a string/],
    [{ high: { resolution: '8h' } }, /priorities\.high has no firstResponse target/],
    [{ high: { firstResponse: '1d', resolution: '8h' } }, /priorities\.high\.firstResponse must be a duration of cover time such as 30m, 4h or 1h30m, not "1d"/],
    [{ high: { firstResponse: 60, resolution: '8h' } }, /not a number/],
    [{ high: { firstResponse: '1h', resolution: '8h', cover: '24/7' } }, /priorities\.high\.cover must be "business" or "24x7"/],
    [{ high: { firstResponse: '1h', resolution: '8h', cover: 'busness' } }, /did you mean "business"\?/],
    [{ high: { firstResponse: '1h', resolution: '8h', aliases: 'P2' } }, /priorities\.high\.aliases must be a list, not a string/],
    [{ high: { firstResponse: '1h', resolution: '8h', aliases: [''] } }, /aliases\[0\] must be a text of 1 to 60 characters/],
    [{ high: { firstResponse: '1h', resolution: '8h', aliases: ['--'] } }, /aliases\[0\] holds no letter or digit/],
    [{ High: { firstResponse: '1h', resolution: '8h' }, 'high!': { firstResponse: '1h', resolution: '8h' } }, /"high!" is the same priority as "High", once compared as lowercase words/],
    [{ high: { firstResponse: '1h', resolution: '8h', aliases: ['P2'] }, low: { firstResponse: '1h', resolution: '8h', aliases: ['p2'] } }, /"p2" is the same priority as "high"/],
    [{ [`${'x'.repeat(61)}`]: { firstResponse: '1h', resolution: '8h' } }, /a priority name must hold 1 to 60 characters/],
    [Object.fromEntries(Array.from({ length: CONFIG_LIMITS.maxPriorities + 1 }, (_, i) => [`p${i}`, { firstResponse: '1h', resolution: '2h' }])), /names more than 100 priorities/]
  ]) assert.match(problemsOfObject({ priorities }).join('\n'), pattern, JSON.stringify(priorities).slice(0, 80));
});

test('config: wrong values of the calendar and the other keys are errors', () => {
  for (const [object, pattern] of [
    [{ timezone: 'Mars/Base' }, /timezone must be an offset such as \+01:00, Z, or a time zone name such as Europe\/Berlin that Node knows, not "Mars\/Base"/],
    [{ timezone: 1 }, /timezone must be .*, not a number/],
    [{ workingDays: ['monday'] }, /workingDays\[0\]: "monday" is not a weekday: mon, tue, wed, thu, fri, sat, sun/],
    [{ workingDays: ['mon', 'Mon'] }, /workingDays names "mon" twice/],
    [{ workingDays: [] }, /the calendar has no working day or no working hours/],
    [{ workingHours: ['17:00-09:00'] }, /workingHours\[0\]: "17:00-09:00" is not a span HH:MM-HH:MM of one day that ends after it starts/],
    [{ workingHours: ['09:00-13:00', '12:00-17:00'] }, /workingHours: 09:00-13:00 and 12:00-17:00 overlap/],
    [{ workingHours: { remove: ['09:00-17:00'] } }, /no working day or no working hours/],
    [{ holidays: ['3001-02-29'] }, /holidays\[0\]: "3001-02-29" is not a date YYYY-MM-DD that exists/],
    [{ holidays: '3001-03-05' }, /holidays must be a list or an object with replace, add or remove, not a string/],
    [{ holidays: { add: ['3001-03-05', '3001-03-05'] } }, /holidays.add names "3001-03-05" twice/],
    [{ holidays: { remove: ['3001-03-05'] } }, /holidays.remove names "3001-03-05", which is not on the list/],
    [{ defaultOffset: 'local' }, /defaultOffset must be an offset such as \+01:00 or Z, or null, not "local"/],
    [{ defaultOffset: 60 }, /defaultOffset must be .*, not a number/],
    [{ fields: [] }, /fields must be an object, not a list/],
    [{ fields: { id: '' } }, /fields\.id must be a text of 1 to 120 characters/],
    [{ fields: { id: 'priority' } }, /fields\.priority and fields\.id name the same column "priority"/],
    [{ pausedStatuses: ['?'] }, /pausedStatuses\[0\] holds no letter or digit/],
    [{ pausedClocks: ['response'] }, /pausedClocks\[0\]: "response" is not a clock: firstResponse or resolution/],
    [{ warnAt: 0 }, /warnAt must be a number above 0 and at most 100/],
    [{ warnAt: 101 }, /warnAt must be/],
    [{ warnAt: '80%' }, /warnAt must be .*, not a string/],
    [{ files: [] }, /files has no pattern left/],
    [{ files: ['/abs/*.csv'] }, /files\[0\]: "\/abs\/\*\.csv" is not a file pattern/],
    [{ exclude: ['../x.csv'] }, /exclude\[0\]: .* is not a file pattern/],
    [{ rules: [] }, /rules must be an object, not a list/],
    [{ rules: { resolutionMissed: 'loud' } }, /rules\.resolutionMissed must be one of notice, warning, error, off, not "loud"/],
    [{ rules: { resolutionMissed: { level: 'off' } } }, /not an object/],
    [{ minSeverity: 'fatal' }, /minSeverity must be one of notice, warning, error/],
    [{ name: 3 }, /name must be a text of 1 to 120 characters/],
    [{ pausedStatuses: Array(CONFIG_LIMITS.maxEntries + 1).fill('x') }, /holds more than 500 entries/],
    [{ pausedStatuses: ['x'.repeat(121)] }, /must hold 1 to 120 characters/],
    [{ pausedStatuses: [3] }, /pausedStatuses\[0\] must be a text, not a number/]
  ]) assert.match(problemsOfObject(object).join('\n'), pattern, JSON.stringify(object).slice(0, 80));
});

test('config: JSON that is not valid, and a key named twice, are refused with the line and column', () => {
  assert.deepEqual(problemsOf('{"name": "a",}'), ['c.json: line 1, column 14: a comma before the closing brace; JSON has no trailing comma']);
  assert.match(problemsOf('{\n "rules": {},\n "rules": {}\n}')[0], /^c\.json: line 3, column 2: the name "rules" appears twice in one object/);
});

test('config: every problem of a file is listed at once, and __proto__ stays a name like any other', () => {
  const p = problemsOfObject({ name: '', minSeverity: 1, warnAt: -1 });
  assert.equal(p.length, 3);
  assert.equal({}.x, undefined);
  assert.throws(() => validateConfig('x'), /must be a JSON object, not a string/);
  assert.match(problemsOf('{"__proto__": {"x": 1}, "priorities": {"high": {"firstResponse": "1h", "resolution": "2h"}}}')[0], /"__proto__" is not a key of the configuration/);
  const c = readConfig('{"priorities": {"__proto__": {"firstResponse": "1h", "resolution": "2h"}}}', 'c.json');
  assert.equal(c.priorities[0].name, '__proto__');
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
});

test('config: the keys of the file, and the small helpers', () => {
  assert.deepEqual(Object.keys(KEYS), ['name', 'priorities', 'timezone', 'workingDays', 'workingHours', 'holidays', 'defaultOffset', 'fields', 'pausedStatuses', 'pausedClocks', 'warnAt', 'files', 'exclude', 'rules', 'minSeverity']);
  assert.deepEqual(Object.keys(KEYS.rules), Object.keys(DEFAULT_RULES));
  assert.deepEqual(Object.keys(KEYS.fields), Object.keys(DEFAULT_FIELDS));
  assert.deepEqual(Object.keys(PRIORITY_KEYS), ['firstResponse', 'resolution', 'cover', 'aliases']);
  assert.equal(distance('files', 'flies'), 1);
  assert.equal(distance('name', 'nmae'), 1);
  assert.equal(distance('kitten', 'sitting'), 3);
  assert.equal(distance('', 'abc'), 3);
  assert.equal(suggestion('exlude', ['files', 'exclude']), '; did you mean "exclude"?');
  assert.equal(suggestion('x'.repeat(4000), ['files']), '', 'a long name is not compared');
  assert.equal(kindOf(null), 'null');
  assert.equal(kindOf([]), 'a list');
  assert.equal(kindOf({}), 'an object');
  assert.equal(kindOf(1), 'a number');
  assert.equal(isObject([]), false);
  assert.equal(isObject({}), true);
});

test('patterns: *, ? and ** match by parts, a pattern with no slash matches the file name anywhere, and the rest is refused', () => {
  assert.equal(globMatch('**/*.csv', 'a.csv'), true);
  assert.equal(globMatch('**/*.csv', 'exports/daily/tickets.csv'), true);
  assert.equal(globMatch('**/*.csv', 'exports/readme.md'), false);
  assert.equal(globMatch('exports/*.csv', 'exports/a.csv'), true);
  assert.equal(globMatch('exports/*.csv', 'exports/x/a.csv'), false);
  assert.equal(globMatch('exports/**/t?.json', 'exports/x/y/t1.json'), true);
  assert.equal(globMatch('exports/**/t?.json', 'exports/t12.json'), false);
  assert.equal(globMatch('*.csv', 'deep/down/a.csv'), true);
  assert.equal(globMatch('a*b*c', 'aXbYbZc'), true);
  assert.equal(globMatch('a*b*c', 'aXbYbZ'), false);
  assert.equal(isIncluded('exports/old/a.csv', ['**/*.csv'], ['**/old/*.csv']), false);
  assert.equal(isIncluded('exports/a.csv', ['**/*.csv'], ['**/old/*.csv']), true);
  for (const bad of ['', '/abs', 'a/../b', 'a//b', './a', '[ab].csv', '{a,b}.csv', '!a.csv', 'a\\b', 'a**', 'x'.repeat(201), `a${String.fromCharCode(1)}`]) assert.notEqual(globProblem(bad), null, bad);
  assert.equal(globProblem('exports/**/*.csv'), null);
  assert.equal(globProblem(3), 'must hold 1 to 200 characters');
});
