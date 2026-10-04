import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { NOTICE, USAGE, VERSION, escapeData, escapeProperty, parseArgs, shareText, toGithub, toJson, toText } from '../src/index.js';
import { SLA_FILE, T, cli, csv, reportOf, run, withFiles } from './helpers.js';

const AS_OF = T('10 15:00');
const GOOD = { 'sla.json': SLA_FILE, 'exports/a.csv': csv(['A', 'high', T('02 09:00'), T('02 09:30'), T('02 11:00')]) };
const BAD_ROW = ['B', 'high', T('02 09:00'), T('02 10:30'), T('02 11:00')];
const BAD = { ...GOOD, 'exports/a.csv': csv(BAD_ROW) };
const ARGS = ['exports', '--config', 'sla.json', '--as-of', AS_OF];

test('cli: exit 0 with no error, 1 with an error, and a warning alone does not fail the run', async () => {
  const good = await run(GOOD, ARGS);
  assert.equal(good.code, 0, good.err);
  assert.match(good.out, /^sla-breach-check: exports\ninput: exports \(1 file, 1 ticket: 1 resolved, 0 open\)\nsla: sla\.json \(Test SLA\): first response \/ resolution: urgent 30m \/ 4h \(24x7\); high 1h \/ 8h; normal 4h \/ 16h\ncover: mon, tue, wed, thu and fri, 09:00-17:00, at Z; no holidays; paused statuses pending, on hold and waiting on customer; pauses stop the resolution clock; at risk from 80% of a target\nas of: 3001-03-10T15:00:00Z\n/);
  assert.match(good.out, /RESULT: PASS - no error\n$/);
  assert.equal(good.err, '');
  const bad = await run(BAD, ARGS);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /RESULT: FAIL - 1 error\n$/);
  const warning = await run({ ...GOOD, 'exports/a.csv': csv(['W', 'high', T('10 14:05'), null, null]) }, ARGS);
  assert.equal(warning.code, 0);
  assert.match(warning.out, /RESULT: PASS - no error \(1 warning\)\n$/);
  const raised = await run({ ...GOOD, 'exports/a.csv': csv(['W', 'high', T('10 14:05'), null, null]), 'raised.json': JSON.stringify({ ...JSON.parse(SLA_FILE), rules: { firstResponseAtRisk: 'error' } }) }, ['exports', '--config', 'raised.json', '--as-of', AS_OF]);
  assert.equal(raised.code, 1);
});

test('cli: several paths, files and folders, are read together in the order given, and a resolved export needs no --as-of', async () => {
  const r = await run({ ...GOOD, 'more/b.json': JSON.stringify([{ id: 'C', priority: 'normal', created: T('02 09:00'), first_response: T('02 09:30'), resolved: T('02 12:00') }]), 'extra.txt': csv(BAD_ROW) }, ['exports', 'more', 'extra.txt', '--config', 'sla.json']);
  assert.equal(r.code, 1, r.err);
  assert.match(r.out, /^sla-breach-check: exports, more, extra\.txt\ninput: exports, more, extra\.txt \(3 files, 3 tickets: 3 resolved, 0 open\)/);
  assert.match(r.out, /\nas of: not given \(every ticket is resolved\)\n/);
  assert.match(r.out, /ERROR {4}first-response-missed {4}extra\.txt:2\n/);
  assert.match(r.out, /files {4}exports\/a\.csv \(csv, 1 ticket\), more\/b\.json \(json, 1 ticket\) and extra\.txt \(csv, 1 ticket\)/);
});

test('cli: exit 2 for usage errors, with the usage and nothing on standard output', async () => {
  for (const [args, message] of [
    [[], /give the ticket export to check: a \.csv or \.json file or a folder of them/],
    [['exports'], /give the SLA with --config <file>; --print-defaults writes a sample to start from/],
    [['exports', 'exports', '--config', 'sla.json'], /exports is named twice/],
    [[...ARGS, '--bogus'], /unknown argument --bogus/],
    [[...ARGS, '--format', 'html'], /unknown format html \(text, json or github\)/],
    [[...ARGS, '--format', 'json', '--format', 'text'], /--format was given twice/],
    [[...ARGS, '--json', '--format', 'github'], /--json and --format github ask for two formats; give one/],
    [[...ARGS, '--min-severity', 'fatal'], /unknown level fatal/],
    [[...ARGS, '--as-of', AS_OF], /--as-of was given twice/],
    [['exports', '--config', 'sla.json', '--as-of', 'now'], /--as-of now is not a timestamp as RFC 3339 writes it/],
    [['exports', '--config', 'sla.json', '--as-of', '3001-03-10T15:00:00'], /--as-of 3001-03-10T15:00:00 has no offset; write Z or an offset such as \+01:00 after the time\n/],
    [['exports', '--config'], /--config needs a value/],
    [['exports', '--config', '--json'], /--config needs a value/],
    [['-'], /reading from standard input is not supported/],
    [['exports', '--config', '-'], /reading from standard input is not supported/],
    [['https://example.com/t.csv', '--config', 'sla.json'], /give a local path; the tool never fetches a URL/],
    [['exports', '--config', 'https://example.com/sla.json'], /give a local path; the tool never fetches a URL/],
    [[...Array.from({ length: 101 }, (_, i) => `f${i}.csv`), '--config', 'sla.json'], /more than 100 paths/]
  ]) {
    const r = await run(GOOD, args);
    assert.equal(r.code, 2, args.join(' '));
    assert.match(r.err, message);
    assert.ok(r.err.includes('Usage: sla-breach-check'), args.join(' ').slice(0, 60));
    assert.equal(r.out, '');
  }
  assert.equal(parseArgs(['a.csv', '--config', 'c.json', '--json', '--format', 'json']).format, 'json');
  assert.deepEqual(parseArgs(['a.csv', '--config', 'c.json', '--as-of', ` ${AS_OF} `]).asOf.text, AS_OF);
});

test('cli: exit 2 for input errors, with every problem and no result', async () => {
  const missing = await run(GOOD, ['nowhere.csv', '--config', 'sla.json']);
  assert.equal(missing.code, 2);
  assert.equal(missing.err, 'sla-breach-check: no result, the input has a problem:\n  nowhere.csv: no such file\n');
  assert.equal(missing.out, '');
  assert.match((await run({ ...GOOD, 'docs/a.md': 'x' }, ['docs', '--config', 'sla.json'])).err, /docs: no file in this folder matches \*\*\/\*\.csv, \*\*\/\*\.json/);
  assert.match((await run({ ...GOOD, 'c.json': '{"priorites": {}}' }, ['exports', '--config', 'c.json'])).err, /c\.json: line 1: "priorites" is not a key of the configuration; did you mean "priorities"\?/);
  assert.match((await run(GOOD, ['exports', '--config', 'none.json'])).err, /none\.json: no such file/);
  assert.match((await run({ ...GOOD, 't.csv': Buffer.from([105, 100, 0, 1]) }, ['t.csv', '--config', 'sla.json'])).err, /t\.csv: holds binary data \(a null byte\); only text is read/);
  const two = await run({ ...GOOD, 'exports/a.csv': 'id,"x\n', 'exports/b.json': '[1,]' }, ['exports', '--config', 'sla.json']);
  assert.equal(two.code, 2);
  assert.equal(two.err, 'sla-breach-check: no result, the input has problems:\n  exports/a.csv: line 1, column 4: a quoted field that is not closed\n  exports/b.json: line 1, column 4: a comma before the closing bracket; JSON has no trailing comma\n');
  const open = await run({ ...GOOD, 'exports/a.csv': csv(['W', 'high', T('10 14:05'), null, null]) }, ['exports', '--config', 'sla.json']);
  assert.equal(open.code, 2);
  assert.match(open.err, /1 ticket is open; give --as-of <timestamp>/);
});

test('cli: --help, --version and --print-defaults exit 0 and need no input', async () => {
  const help = await run({}, ['--help']);
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  for (const option of ['--config', '--as-of', '--format', '--json', '--min-severity', '--explain', '--print-defaults', '--help', '--version']) assert.ok(USAGE.includes(option), option);
  assert.equal((await run({}, ['--version'])).out, `${VERSION}\n`);
  const defaults = await run({}, ['--print-defaults']);
  assert.equal(defaults.code, 0);
  assert.equal(JSON.parse(defaults.out).name, 'built-in defaults with sample priorities');
  const back = await run({ ...GOOD, 'd.json': defaults.out, 'exports/a.csv': csv(['A', 'normal', T('02 09:00'), T('02 09:30'), T('02 11:00')]) }, ['exports', '--config', 'd.json']);
  assert.equal(back.code, 0, back.err);
});

test('cli: --min-severity hides findings below it, and the command line wins over the configuration', async () => {
  const files = { ...GOOD, 'exports/a.csv': csv(BAD_ROW, ['W', 'high', T('10 14:05'), null, null]) };
  const all = await run(files, ARGS);
  assert.match(all.out, /findings: 2 \(1 error, 1 warning\)/);
  const errors = await run(files, [...ARGS, '--min-severity', 'error']);
  assert.match(errors.out, /findings: 1 \(1 error\); 1 below error not shown/);
  assert.match(errors.out, /note: 1 finding below error is not shown/);
  assert.ok(!errors.out.includes('WARNING '));
  const cfg = await run({ ...files, 'c.json': JSON.stringify({ ...JSON.parse(SLA_FILE), minSeverity: 'error' }) }, ['exports', '--config', 'c.json', '--as-of', AS_OF, '--min-severity', 'notice']);
  assert.match(cfg.out, /findings: 2 \(1 error, 1 warning\)/);
});

test('text: the findings with their level, rule and place, the tables per priority, what was read, the notice and the result', () => {
  const r = reportOf(csv(BAD_ROW, ['C', 'normal', T('02 09:00'), T('02 09:30'), T('02 12:00')]), {}, { asOf: '10 15:00' });
  const out = toText(r);
  assert.match(out, /\n {2}ERROR {4}first-response-missed {4}tickets\.csv:2\n {11}ticket B \(high\): the first response came after 1h 30m of cover time, 30m past the target of 1h\n/);
  assert.match(out, /\nFirst response, in cover time\n\n {2}priority {2}target {2}tickets {2}met {2}missed {2}open {2}at risk {2}met share {2}median {2}p90\n {2}urgent {4}30m {5}0 {8}0 {4}0 {7}0 {5}0 {8}- {10}- {7}-\n {2}high {6}1h {6}1 {8}0 {4}1 {7}0 {5}0 {8}0% {9}1h 30m {2}1h 30m\n {2}normal {4}4h {6}1 {8}1 {4}0 {7}0 {5}0 {8}100% {7}30m {5}30m\n/);
  assert.match(out, /\nResolution, in cover time\n/);
  assert.match(out, /\nRead: tickets\.csv\n\n {2}tickets {2}2: 2 resolved, 0 open; 0 not judged for an input problem\n {2}files {4}tickets\.csv \(csv, 2 tickets\)\n {2}paused {3}0 judged tickets with paused time\n/);
  assert.ok(out.includes(`\n${NOTICE}\n\nRESULT: FAIL - 1 error\n`));
  const explained = toText(r, { explain: true });
  assert.match(explained, /\n {11}rule: a ticket whose cover time from creation to first response/);
  assert.match(explained, /\n {11}basis: an SLA calendar has a time zone, working days, .* \(Set up SLA calendars \(Jira Service Management Cloud, Atlassian Support\), https:\/\/support\.atlassian\.com\/jira-service-management-cloud\/docs\/set-up-sla-calendars\/\)\n/);
  assert.match(explained, /\n {11}the tool's own choice: a time equal to the target meets it/);
  const lunch = toText(reportOf(csv(['A', 'high', T('02 09:00'), T('02 09:30'), T('02 11:00')]), { workingHours: ['09:00-12:00', '13:00-17:00'], holidays: ['3001-03-05'], pausedStatuses: [], pausedClocks: [], timezone: 'Etc/GMT-5', warnAt: 90 }));
  assert.match(lunch, /\ncover: mon, tue, wed, thu and fri, 09:00-12:00 and 13:00-17:00, at Etc\/GMT-5; 1 holiday \(3001-03-05\); no paused statuses; pauses stop no clock; at risk from 90% of a target\n/);
});

test('text: a share is a percentage with at most one decimal', () => {
  assert.equal(shareText(null), '-');
  assert.equal(shareText(1), '100%');
  assert.equal(shareText(0), '0%');
  assert.equal(shareText(2 / 3), '66.7%');
  assert.equal(shareText(0.125), '12.5%');
});

test('json: the whole report, with the basis of each finding only when asked', () => {
  const r = reportOf(csv(BAD_ROW), {}, { asOf: '10 15:00' });
  const plain = JSON.parse(toJson(r));
  assert.equal(plain.tool, 'sla-breach-check');
  assert.deepEqual(Object.keys(plain), ['tool', 'version', 'input', 'asOf', 'config', 'summary', 'findings', 'totals', 'result', 'notes', 'notice']);
  assert.deepEqual(Object.keys(plain.findings[0]), ['rule', 'level', 'file', 'line', 'column', 'at', 'ticket', 'priority', 'found', 'clock', 'usedSeconds', 'targetSeconds', 'pausedSeconds']);
  assert.deepEqual([plain.findings[0].ticket, plain.findings[0].priority, plain.findings[0].usedSeconds], ['B', 'high', 5400]);
  assert.deepEqual(plain.result, { pass: false, errors: 1, byLevel: { error: 1, warning: 0, notice: 0 }, text: 'FAIL - 1 error' });
  assert.equal(plain.config.rules.length, 10);
  assert.equal(plain.asOf, T('10 15:00'));
  assert.deepEqual(plain.summary.priorities.map((p) => p.name), ['urgent', 'high', 'normal']);
  assert.equal(plain.summary.priorities[1].firstResponse.medianSeconds, 5400);
  const explained = JSON.parse(toJson(r, { explain: true }));
  assert.equal(explained.findings[0].basis[0].url, 'https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-goals/');
  assert.match(explained.findings[0].own, /^a time equal to the target meets it/);
});

test('github: one workflow command per finding at its level, with the file and line, then a summary line', () => {
  const lines = toGithub(reportOf(csv(BAD_ROW, ['W', 'high', T('10 14:05'), null, null]), {}, { asOf: '10 15:00' })).trimEnd().split('\n');
  assert.equal(lines.length, 3);
  assert.equal(lines[0], '::error file=tickets.csv,line=2,title=sla-breach-check first-response-missed::ticket B (high): the first response came after 1h 30m of cover time, 30m past the target of 1h');
  assert.match(lines[1], /^::warning file=tickets\.csv,line=3,title=sla-breach-check first-response-at-risk::/);
  assert.equal(lines[2], 'sla-breach-check: tickets.csv: 2 tickets, 2 findings; RESULT: FAIL - 1 error (and 1 warning)');
  assert.equal(toGithub(reportOf(csv(['A', 'high', T('02 09:00'), T('02 09:30'), T('02 11:00')]))), 'sla-breach-check: tickets.csv: 1 ticket, 0 findings; RESULT: PASS - no error\n');
  assert.match(toGithub(reportOf(csv(BAD_ROW), { rules: { firstResponseMissed: 'notice' } })), /^::notice file=tickets\.csv,line=2,/);
});

test('github: the characters a workflow command gives a meaning to are escaped, so a finding cannot start another command', () => {
  assert.equal(escapeData('a%b\r\nc'), 'a%25b%0D%0Ac');
  assert.equal(escapeProperty('dir/a,b:c.csv'), 'dir/a%2Cb%3Ac.csv');
  const r = reportOf({ 'a,b:c.csv': csv(['100% ::error::x', 'P9', T('02 09:00'), null, T('02 10:00')]) });
  const out = toGithub(r);
  assert.equal(out.split('\n')[0], '::error file=a%2Cb%3Ac.csv,line=2,title=sla-breach-check unknown-priority::ticket 100%25 ::error::x: priority "P9" is not a priority of the SLA, which names urgent, high and normal');
  assert.equal(out.split('\n').filter((l) => l.startsWith('::')).length, 1);
});

test('cli: a run reads its inputs and writes nothing to the folder', async () => {
  await withFiles(BAD, async (dir) => {
    for (const args of [['--format', 'text'], ['--format', 'json'], ['--format', 'github'], ['--explain']]) assert.equal((await cli([...ARGS, ...args], dir)).code, 1);
    assert.deepEqual((await readdir(dir)).sort(), ['exports', 'sla.json']);
    assert.deepEqual(await readdir(resolve(dir, 'exports')), ['a.csv']);
  });
});
