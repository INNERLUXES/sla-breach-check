import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmod, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CsvError, FILE_LIMITS, LIMITS, MAX_PROBLEMS, parseCsv } from '../src/index.js';
import { HEADER, SLA_FILE, T, cli, csv, inYear, reportOf, rulesOf, run, withFiles } from './helpers.js';

// Hostile input: exports built to exhaust the memory or the time, to make the tool follow a link, to rewrite the
// terminal, to start a second workflow command or to change how objects behave. Each heavy test also checks the time,
// because work that grows faster than the input is a failure even when the answer is right. Tests that need a symbolic
// link, a device or file permissions are guarded with process.platform, and none of them asserts a line: lines are
// asserted in the tests that run everywhere.

const LIMIT = { timeout: 180000 };
// Coverage counting slows every line of the tool several times over, so a run with --experimental-test-coverage gets a
// wider time limit. A plain `npm test` keeps the tight one, and that is the run that guards against slow growth.
// The runner sets NODE_V8_COVERAGE for its test processes only when coverage is on.
const COVERAGE = Boolean(process.env.NODE_V8_COVERAGE);
const fast = async (fn, ms = 5000) => {
  const limit = COVERAGE ? ms * 4 : ms;
  const start = Date.now();
  const result = await fn();
  assert.ok(Date.now() - start < limit, `took ${Date.now() - start} ms`);
  return result;
};

const AS_OF = T('10 15:00');
const GOOD = { 'sla.json': SLA_FILE, 't.csv': csv(['A', 'high', T('02 09:00'), T('02 09:30'), T('02 11:00')]) };
const ARGS = ['t.csv', '--config', 'sla.json', '--as-of', AS_OF];

test('hostile: a file or a configuration over its size limit is refused before it is read', LIMIT, async () => {
  const big = await fast(() => run({ ...GOOD, 'big.csv': `${HEADER}\n${'x'.repeat(FILE_LIMITS.maxFileBytes)}` }, ['big.csv', '--config', 'sla.json']));
  assert.equal(big.code, 2);
  assert.match(big.err, /big\.csv: [\d,]+ bytes is over the 32 MB limit/);
  const config = await run({ ...GOOD, 'c.json': ' '.repeat(FILE_LIMITS.maxConfigBytes + 1) }, ['t.csv', '--config', 'c.json']);
  assert.equal(config.code, 2);
  assert.match(config.err, /c\.json: [\d,]+ bytes is over the 1 MB limit/);
  const small = await run(GOOD, ARGS, { maxFileBytes: 100 });
  assert.match(small.err, /over the 100 byte limit/);
  const total = await run({ ...GOOD, 'x/a.csv': GOOD['t.csv'], 'x/b.csv': GOOD['t.csv'] }, ['x', '--config', 'sla.json'], { maxTotalBytes: 200 });
  assert.equal(total.code, 2);
  assert.match(total.err, /x\/b\.csv: the files read so far hold more than 200 bytes, the limit of one run/);
  const tickets = await run({ ...GOOD, 'x/a.csv': GOOD['t.csv'], 'x/b.csv': csv(['B', 'high', T('02 09:00'), T('02 09:30'), T('02 11:00')]) }, ['x', '--config', 'sla.json'], { maxTickets: 1 });
  assert.match(tickets.err, /x\/b\.csv: the files read so far hold more than 1 tickets, the limit of one run/);
});

test('hostile: a hundred thousand tickets over a year of business days are judged in seconds', LIMIT, async () => {
  const rows = Array.from({ length: 100000 }, (_, i) => {
    const day = 2 + (i % 9);
    const d = String(day).padStart(2, '0');
    return `T${i},${i % 3 === 0 ? 'urgent' : 'high'},${T(`${d} 09:00`)},${T(`${d} 10:${String(i % 60).padStart(2, '0')}`)},3001-${String(4 + (i % 9)).padStart(2, '0')}-10T12:00:00Z,`;
  });
  const r = await fast(() => run({ 'sla.json': SLA_FILE, 'big.csv': `${HEADER}\n${rows.join('\n')}\n` }, ['big.csv', '--config', 'sla.json', '--json']), 30000);
  const json = JSON.parse(r.out);
  assert.equal(json.summary.tickets, 100000);
  assert.equal(json.findings.filter((f) => f.rule === 'resolution-missed').length, LIMITS.maxFindingsPerRule, 'every rule lists at most its limit');
  assert.ok(json.notes.some((n) => /findings past the limit of 500 per rule are counted but not listed/.test(n)));
});

test('hostile: a calendar of a named zone over a century of days, and a run that reaches past the limit of days, stay fast', LIMIT, async () => {
  const far = inYear(3001 + 98);
  const r = await fast(() => reportOf(csv(['A', 'high', T('02 09:00'), T('02 09:30'), far]), { timezone: 'America/New_York' }), 20000);
  assert.deepEqual(rulesOf(r), ['resolution-missed']);
  const past = await fast(() => run({ ...GOOD, 'w.csv': csv(['A', 'high', T('02 09:00'), T('02 09:30'), inYear(3001 + 900)]) }, ['w.csv', '--config', 'sla.json']));
  assert.equal(past.code, 2);
  assert.match(past.err, /more than the limit of 36,600; look for a timestamp with a wrong year/);
});

test('hostile: long runs of quotes, commas, line breaks and semicolons are read in one pass', LIMIT, async () => {
  for (const text of [
    `"${'""'.repeat(30000)}"\n`,
    `${','.repeat(999)}\n`.repeat(200),
    '\n'.repeat(1000000),
    '\r'.repeat(1000000),
    `"${'\n'.repeat(60000)}"`,
    `${'"'.repeat(1000001)}`,
    `a${'"'.repeat(100000)}`
  ]) {
    await fast(() => {
      try {
        parseCsv(text);
      } catch (error) {
        assert.ok(error instanceof CsvError, error.message);
      }
    });
  }
  const paused = Array.from({ length: 999 }, (_, i) => `${T('02 10:00')}/${T('02 11:00')}`).join(';');
  await fast(() => reportOf(csv(['A', 'high', T('02 09:00'), T('02 09:10'), T('02 17:00'), paused])));
  const deep = await fast(() => run({ ...GOOD, 'd.json': '['.repeat(100000) }, ['d.json', '--config', 'sla.json']));
  assert.match(deep.err, /nested more than 32 deep/);
});

test('hostile: a set with a hundred broken files lists twenty problems and a count', LIMIT, async () => {
  const files = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`x/f${String(i).padStart(3, '0')}.csv`, 'id,"x']));
  const r = await fast(() => run({ ...files, 'sla.json': SLA_FILE }, ['x', '--config', 'sla.json']));
  assert.equal(r.code, 2);
  assert.match(r.err, /the input has problems:/);
  assert.match(r.err, /\n {2}and 80 more\n$/);
  assert.equal(r.err.split('\n').filter((l) => l.startsWith('  x/')).length, MAX_PROBLEMS);
});

test('hostile: CRLF, CR and a byte order mark give the same report as LF', async () => {
  const text = csv(['A', 'high', T('02 09:00'), T('02 10:30'), T('02 11:00')], ['B', 'P9', T('02 09:00'), null, T('02 11:00')]);
  const lf = await run({ ...GOOD, 't.csv': text }, [...ARGS, '--json']);
  assert.equal(lf.code, 1, lf.err);
  for (const eol of ['\r\n', '\r']) {
    const r = await run({ ...GOOD, 't.csv': `${String.fromCharCode(0xfeff)}${text.split('\n').join(eol)}` }, [...ARGS, '--json']);
    assert.equal(r.out, lf.out, JSON.stringify(eol));
  }
});

test('hostile: control, escape and direction characters in file names, ids, priorities and values never reach the reports', async () => {
  const esc = String.fromCharCode(27);
  const rlo = String.fromCharCode(0x202e);
  const ls = String.fromCharCode(0x2028);
  const text = csv([`A${esc}[31m`, `high${rlo}`, `${T('02 09:00')}${esc}[2J`, null, T('02 11:00')], [`B${ls}`, 'high', T('02 09:00'), T('02 11:00'), T('02 12:00')]);
  const files = { ...GOOD, [`t${rlo}.csv`]: text, [`bad${rlo}.csv`]: `id,"${esc}` };
  for (const format of ['text', 'json', 'github']) {
    const r = await run(files, [`t${rlo}.csv`, '--config', 'sla.json', '--format', format, ...(format === 'github' ? [] : ['--explain'])]);
    assert.equal(r.code, 1, r.err);
    for (const c of [esc, rlo, ls]) assert.ok(!r.out.includes(c) && !r.err.includes(c), `${format}: ${c.charCodeAt(0)}`);
  }
  const bad = await run(files, [`bad${rlo}.csv`, '--config', 'sla.json']);
  assert.equal(bad.code, 2);
  assert.ok(!bad.err.includes(esc) && !bad.err.includes(rlo));
});

test('hostile: constructor, toString and __proto__ as ids, priorities, statuses and keys are only data', async () => {
  const r = reportOf(csv(['__proto__', 'constructor', T('02 09:00'), null, T('02 10:00')], ['toString', 'high', T('02 09:00'), T('02 09:10'), T('02 10:00')], ['toString', 'high', T('02 09:00'), T('02 09:10'), T('02 10:00')]));
  assert.deepEqual(rulesOf(r), ['unknown-priority', 'duplicate-ticket']);
  assert.match(r.findings[0].found, /^ticket __proto__: priority "constructor" is not a priority/);
  assert.equal(Object.getPrototypeOf({}), Object.prototype);
  const json = await run({ ...GOOD, 'j.json': `[{"__proto__": 1, "id": "hasOwnProperty", "priority": "high", "created": "${T('02 09:00')}", "first_response": null, "resolved": "${T('02 09:30')}"}]` }, ['j.json', '--config', 'sla.json']);
  assert.equal(json.code, 0, json.err);
  assert.equal({}.id, undefined);
});

test('hostile: an empty export, a header alone and an empty JSON list are read without a crash', async () => {
  for (const [name, content] of [['h.csv', `${HEADER}\n`], ['e.json', '[]'], ['w.json', '{"tickets": []}']]) {
    const r = await run({ ...GOOD, [name]: content }, [name, '--config', 'sla.json']);
    assert.equal(r.code, 0, `${name}: ${r.err}`);
    assert.match(r.out, /\(1 file, 0 tickets: 0 resolved, 0 open\)/);
  }
  assert.equal((await run({ ...GOOD, 'e.csv': '' }, ['e.csv', '--config', 'sla.json'])).code, 2, 'a CSV file with no header');
});

test('hostile: a file named through a symbolic link is refused, and a link inside a folder is skipped, not followed', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows needs extra rights to make a symbolic link');
    return;
  }
  await withFiles({ ...GOOD, 'x/a.csv': GOOD['t.csv'], 'secret/s.csv': GOOD['t.csv'] }, async (dir) => {
    await symlink(resolve(dir, 'x/a.csv'), resolve(dir, 'linked.csv'));
    await symlink(resolve(dir, 'secret'), resolve(dir, 'x/inside'));
    await symlink(resolve(dir, 'secret/s.csv'), resolve(dir, 'x/s.csv'));
    await symlink(resolve(dir, 'sla.json'), resolve(dir, 'sla-link.json'));
    const r = await cli(['linked.csv', '--config', 'sla.json'], dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /linked\.csv: is a symbolic link, which is not followed/);
    const c = await cli(['x', '--config', 'sla-link.json'], dir);
    assert.equal(c.code, 2);
    assert.match(c.err, /is a symbolic link/);
    const walk = await cli(['x', '--config', 'sla.json'], dir);
    assert.equal(walk.code, 0, walk.err);
    assert.match(walk.out, /\(1 file, 1 ticket/);
    assert.match(walk.out, /note: 2 symbolic links inside the folders were skipped, not followed/);
  });
});

test('hostile: a device named as a ticket file or the configuration is refused', LIMIT, async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows has no /dev/zero to name as an input');
    return;
  }
  await withFiles(GOOD, async (dir) => {
    const config = await fast(() => cli(['t.csv', '--config', '/dev/zero'], dir));
    assert.equal(config.code, 2);
    assert.match(config.err, /is not a regular file/);
    const input = await fast(() => cli(['/dev/zero', '--config', 'sla.json'], dir));
    assert.equal(input.code, 2);
    assert.match(input.err, /is not a regular file/);
  });
});

test('hostile: a file or a folder that cannot be opened stops the run with its reason, and is never passed over', async (t) => {
  if (process.platform === 'win32') {
    t.skip('Windows does not take away read access with chmod');
    return;
  }
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    t.skip('the root user can read a file without read access');
    return;
  }
  await withFiles({ ...GOOD, 'x/a.csv': GOOD['t.csv'], 'x/locked/b.csv': GOOD['t.csv'] }, async (dir) => {
    await chmod(resolve(dir, 't.csv'), 0o000);
    await chmod(resolve(dir, 'x/locked'), 0o000);
    try {
      const r = await cli(['t.csv', '--config', 'sla.json'], dir);
      assert.equal(r.code, 2);
      assert.match(r.err, /t\.csv: cannot be read \(EACCES\)/);
      const folder = await cli(['x', '--config', 'sla.json'], dir);
      assert.equal(folder.code, 2);
      assert.match(folder.err, /x\/locked: cannot be read \(EACCES\)/);
    } finally {
      await chmod(resolve(dir, 't.csv'), 0o644);
      await chmod(resolve(dir, 'x/locked'), 0o755);
    }
  });
});
