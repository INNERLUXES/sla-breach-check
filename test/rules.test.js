import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOUR, INPUT_RULES, InputError, MINUTE, analyse, atOrAbove, decide, pausesOfHistory, percentile, ruleById } from '../src/index.js';
import { HEADER, T, configOf, csv, findingsOf, ms, reportOf, rulesOf, rulesOfRow } from './helpers.js';

// Every rule with the export written inline, small enough to work out by hand, with a near miss on each side. The SLA of
// test/helpers.js: urgent 30m / 4h around the clock, high 1h / 8h and normal 4h / 16h from 09:00 to 17:00 UTC on
// weekdays. The second day of the made-up month is a Monday.

const AS_OF = '10 15:00';

test('first-response-missed: a time equal to the target meets it, a second more misses it, and only cover time counts', () => {
  assert.deepEqual(rulesOfRow(['A', 'high', T('02 09:00'), T('02 10:00'), T('02 11:00')]), []);
  assert.deepEqual(rulesOfRow(['A', 'high', T('02 09:00'), '3001-03-02T10:00:01Z', T('02 11:00')]), ['first-response-missed']);
  assert.deepEqual(rulesOfRow(['A', 'high', T('02 16:30'), T('03 09:30'), T('03 11:00')]), [], 'the night does not count: one hour');
  assert.deepEqual(rulesOfRow(['A', 'high', T('06 16:30'), T('09 09:45'), T('09 11:00')]), ['first-response-missed'], 'the weekend does not count, but 1h 15m does');
  const r = reportOf(csv(['A', 'high', T('02 09:00'), T('02 10:25'), T('02 11:00')]), {}, { asOf: AS_OF });
  assert.equal(r.findings[0].found, 'ticket A (high): the first response came after 1h 25m of cover time, 25m past the target of 1h');
  assert.deepEqual([r.findings[0].clock, r.findings[0].usedSeconds, r.findings[0].targetSeconds, r.findings[0].pausedSeconds], ['firstResponse', 5100, 3600, 0]);
});

test('first-response-missed: a ticket resolved with no first response is measured to its resolution', () => {
  const r = reportOf(csv(['A', 'high', T('02 09:00'), null, T('02 12:00')]));
  assert.deepEqual(rulesOf(r), ['first-response-missed']);
  assert.match(r.findings[0].found, /; it was resolved with no first response, so the resolution is counted as the first response$/);
  assert.deepEqual(rulesOf(reportOf(csv(['A', 'high', T('02 09:00'), null, T('02 09:50')]))), []);
});

test('resolution-missed: cover time to resolution against the target, with paused time taken out of this clock only', () => {
  assert.deepEqual(rulesOfRow(['A', 'high', T('02 09:00'), T('02 09:10'), T('02 17:00')]), [], 'eight hours exactly');
  assert.deepEqual(rulesOfRow(['A', 'high', T('02 09:00'), T('02 09:10'), T('03 09:01')]), ['resolution-missed']);
  const paused = ['A', 'high', T('02 09:00'), T('02 09:10'), T('03 10:00'), `${T('02 12:00')}/${T('02 13:00')}`];
  assert.deepEqual(rulesOfRow(paused), [], 'nine hours less one paused');
  const r = reportOf(csv(['A', 'high', T('02 09:00'), T('02 09:10'), T('03 11:00'), `${T('02 12:00')}/${T('02 13:00')}`]));
  assert.equal(r.findings[0].found, 'ticket A (high): resolved after 9h of cover time, with 1h of paused cover time not counted, 1h past the target of 8h');
  assert.equal(r.findings[0].pausedSeconds, 3600);
  assert.deepEqual(rulesOfRow(['A', 'high', T('02 09:00'), T('02 11:00'), T('02 12:00'), `${T('02 09:30')}/${T('02 11:00')}`]), ['first-response-missed'], 'a pause does not stop the first response clock by default');
  assert.deepEqual(rulesOfRow(['A', 'high', T('02 09:00'), T('02 11:00'), T('02 12:00'), `${T('02 09:30')}/${T('02 11:00')}`], { pausedClocks: ['firstResponse', 'resolution'] }), [], 'unless pausedClocks names it');
});

test('pauses: from a status history, an entry with a paused status starts a pause and the next other status ends it', () => {
  const e = (t, status) => ({ ms: ms(t), status });
  const statuses = configOf().pausedStatuses;
  assert.deepEqual(pausesOfHistory([e('02 12:00', 'open'), e('02 10:00', 'Pending'), e('02 11:00', 'on hold')], statuses), [[ms('02 10:00'), ms('02 12:00')]], 'the entries are taken in the order of their times');
  assert.deepEqual(pausesOfHistory([e('02 10:00', 'Waiting on Customer')], statuses), [[ms('02 10:00'), null]], 'a pause still running');
  assert.deepEqual(pausesOfHistory([e('02 10:00', 'open'), e('02 11:00', 'solved')], statuses), []);
  const text = `${HEADER},history\nA,high,${T('02 09:00')},${T('02 09:10')},${T('03 11:00')},,${T('02 09:10')} open;${T('02 12:00')} pending;${T('02 13:00')} open\n`;
  const r = reportOf(text);
  assert.equal(rulesOf(r).join(), 'resolution-missed');
  assert.match(r.findings[0].found, /with 1h of paused cover time not counted/);
  assert.equal(r.summary.withPauses, 1);
  const open = `${HEADER},history\nA,high,${T('09 09:00')},${T('09 09:10')},,,${T('09 10:00')} pending\n`;
  assert.deepEqual(rulesOf(reportOf(open, {}, { asOf: AS_OF })), [], 'a pause still running stops the clock up to --as-of');
});

test('first-response-overdue, at risk and open: an open ticket with no first response, measured up to --as-of', () => {
  assert.deepEqual(rulesOfRow(['A', 'high', T('10 13:59'), null, null]), ['first-response-overdue']);
  assert.deepEqual(rulesOfRow(['A', 'high', T('10 14:00'), null, null]), ['first-response-at-risk'], 'all of the target used is at risk, not overdue');
  assert.deepEqual(rulesOfRow(['A', 'high', T('10 14:12'), null, null]), ['first-response-at-risk'], 'exactly 80%');
  assert.deepEqual(rulesOfRow(['A', 'high', '3001-03-10T14:12:01Z', null, null]), [], 'just under 80%');
  assert.deepEqual(rulesOfRow(['A', 'high', T('10 14:30'), null, null], { warnAt: 50 }), ['first-response-at-risk']);
  const r = reportOf(csv(['A', 'high', T('10 13:45'), null, null]), {}, { asOf: AS_OF });
  assert.equal(r.findings[0].found, 'ticket A (high) has no first response after 1h 15m of cover time up to --as-of, 15m past the target of 1h');
  const risk = reportOf(csv(['A', 'high', T('10 14:05'), null, null]), {}, { asOf: AS_OF });
  assert.equal(risk.findings[0].found, 'ticket A (high) has no first response yet: 55m of the 1h target used up to --as-of (91%), 5m left');
});

test('resolution-overdue and resolution-at-risk: an open ticket measured up to --as-of', () => {
  assert.deepEqual(rulesOfRow(['A', 'high', T('09 09:00'), T('09 09:10'), null]), ['resolution-overdue'], '8h on Monday and 6h on Tuesday');
  assert.deepEqual(rulesOfRow(['A', 'high', T('10 09:00'), T('10 09:10'), null]), [], 'six hours of eight: 75%');
  assert.deepEqual(rulesOfRow(['A', 'high', T('10 08:00'), T('10 09:10'), null], {}, '10 15:24'), ['resolution-at-risk']);
  const r = reportOf(csv(['A', 'high', T('09 09:00'), T('09 09:10'), null]), {}, { asOf: AS_OF });
  assert.equal(r.findings[0].found, 'ticket A (high) is not resolved after 14h of cover time up to --as-of, 6h past the target of 8h');
});

test('cover: urgent runs around the clock over the weekend, the others only in working hours', () => {
  assert.deepEqual(rulesOfRow(['A', 'urgent', T('07 10:00'), T('07 10:31'), T('07 12:00')]), ['first-response-missed']);
  assert.deepEqual(rulesOfRow(['A', 'high', T('07 10:00'), T('07 23:00'), T('09 10:00')]), [], 'a weekend ticket of a business priority starts its clock on Monday');
  assert.deepEqual(rulesOfRow(['A', 'P1', T('07 10:00'), T('07 10:20'), T('07 14:00')]), [], 'an alias');
});

test('invalid-timestamp: a ticket with no creation time, a time with no offset or a pause that cannot be read is reported and not judged', () => {
  assert.deepEqual(rulesOfRow(['A', 'high', null, T('02 09:00'), null]), ['invalid-timestamp']);
  const r = reportOf(csv(['A', 'high', '3001-03-02 09:00', T('02 10:00'), T('02 11:00')]));
  assert.equal(r.findings[0].found, 'ticket A: created "3001-03-02 09:00" has no offset; write Z or an offset such as +01:00 after the time, or set defaultOffset in the configuration');
  assert.equal(r.summary.notJudged, 1);
  assert.equal(r.summary.priorities.find((p) => p.name === 'high').tickets, 0);
  assert.deepEqual(rulesOfRow(['A', 'high', '3001-03-02 09:00', T('02 10:00'), T('02 11:00')], { defaultOffset: 'Z' }), [], 'with defaultOffset the time is read');
  assert.deepEqual(rulesOfRow(['A', 'high', T('02 09:00'), 'soon', null]), ['invalid-timestamp']);
  assert.deepEqual(rulesOfRow(['A', 'high', T('02 09:00'), T('02 09:10'), T('02 10:00'), 'later']), ['invalid-timestamp']);
  assert.match(reportOf(csv(['A', 'high', T('02 09:00'), T('02 09:10'), T('02 10:00'), 'later'])).findings[0].found, /the pause "later" in paused is not two timestamps joined by \//);
  assert.deepEqual(rulesOfRow(['A', 'high', T('02 09:00'), T('02 09:10'), T('02 10:00'), `x/${T('02 09:30')}`]), ['invalid-timestamp']);
  const history = reportOf(`${HEADER},history\nA,high,${T('02 09:00')},${T('02 09:10')},${T('02 10:00')},,pending;tomorrow pending\n`);
  assert.deepEqual(history.findings.map((f) => f.found), ['ticket A: the status entry "pending" in history is not a timestamp, a space and a status', 'ticket A: a status time in history "tomorrow" is not a timestamp as RFC 3339 writes it: the date as YYYY-MM-DD, T, the time as HH:MM:SS and Z or an offset such as +01:00']);
});

test('timestamps-out-of-order: a response, a resolution or a pause before the creation, a pause that ends before it starts, a time after --as-of', () => {
  assert.deepEqual(rulesOfRow(['A', 'high', T('02 10:00'), T('02 09:59'), null]), ['timestamps-out-of-order']);
  assert.deepEqual(rulesOfRow(['A', 'high', T('02 10:00'), null, T('02 09:00')]), ['timestamps-out-of-order']);
  assert.deepEqual(rulesOfRow(['A', 'high', T('02 10:00'), T('02 10:10'), T('02 12:00'), `${T('02 09:00')}/${T('02 11:00')}`]), ['timestamps-out-of-order']);
  assert.deepEqual(rulesOfRow(['A', 'high', T('02 10:00'), T('02 10:10'), T('02 12:00'), `${T('02 11:00')}/${T('02 10:30')}`]), ['timestamps-out-of-order']);
  const after = reportOf(csv(['A', 'high', T('02 10:00'), T('02 10:10'), T('10 16:00')]), {}, { asOf: AS_OF });
  assert.equal(after.findings[0].found, `ticket A: resolved "${T('10 16:00')}" is after --as-of ${T(AS_OF)}, so the export is newer than the time the report is made for`);
  assert.deepEqual(rulesOfRow(['A', 'high', T('02 10:00'), T('02 10:00'), T('02 10:00')]), [], 'times may be equal');
});

test('unknown-priority: no priority, or one the SLA does not name; names and aliases are compared as whole lowercase words', () => {
  const r = reportOf(csv(['A', 'P5', T('02 10:00'), null, T('02 10:10')], ['B', null, T('02 10:00'), null, T('02 10:10')]));
  assert.deepEqual(r.findings.map((f) => f.found), ['ticket A: priority "P5" is not a priority of the SLA, which names urgent, high and normal', 'ticket B has no priority, so it has no target; the SLA names urgent, high and normal']);
  for (const p of ['HIGH', ' high ', 'p3 normal', 'P3 - NORMAL', 'p1']) assert.deepEqual(rulesOfRow(['A', p, T('02 10:00'), T('02 10:10'), T('02 10:20')]), [], p);
});

test('duplicate-ticket: a ticket with no id, and every later copy of an id, in one file or across files', () => {
  const row = (id) => [id, 'high', T('02 10:00'), T('02 10:10'), T('02 10:20')];
  const r = reportOf({ 'a.csv': csv(row('A'), row(null), row('A')), 'b.csv': csv(row('A')) });
  assert.deepEqual(r.findings.map((f) => f.found), ['the ticket at line 3 has no id, so it cannot be told apart from the others; it is not judged', 'ticket A was read before, at a.csv:2; this copy is not judged', 'ticket A was read before, at a.csv:2; this copy is not judged']);
  assert.equal(r.summary.priorities.find((p) => p.name === 'high').tickets, 1, 'a ticket counts once');
});

test('summary: counts, the share met and the median and 90th percentile by the nearest rank, per priority', () => {
  const rows = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((m, i) => [`H${i}`, 'high', T('02 09:00'), `3001-03-02T${String(9 + Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00Z`, T('02 12:00')]);
  const r = reportOf(csv(...rows, ['O', 'high', T('10 14:30'), null, null], ['L', 'urgent', T('02 09:00'), T('02 09:10'), T('02 09:20')]), {}, { asOf: AS_OF });
  const high = r.summary.priorities.find((p) => p.name === 'high');
  assert.deepEqual({ ...high.firstResponse }, { target: '1h', targetSeconds: 3600, tickets: 11, met: 6, missed: 4, open: 1, atRisk: 0, share: 0.6, medianSeconds: 50 * 60, p90Seconds: 90 * 60 });
  assert.equal(high.resolution.met, 10);
  assert.equal(high.resolution.open, 1);
  assert.equal(r.summary.priorities.find((p) => p.name === 'normal').firstResponse.share, null, 'nothing judged');
  assert.equal(percentile([], 50), null);
  assert.equal(percentile([5], 90), 5);
  assert.equal(percentile([4, 1, 3, 2], 50), 2);
  assert.equal(percentile([4, 1, 3, 2], 90), 4);
  assert.deepEqual([r.summary.tickets, r.summary.resolved, r.summary.open, r.summary.notJudged], [12, 11, 1, 0]);
});

test('as of: open tickets need --as-of, a fully resolved export does not, and the tool never measures up to the clock', () => {
  assert.throws(() => reportOf(csv(['A', 'high', T('02 09:00'), null, null])), (e) => e instanceof InputError && /1 ticket is open; give --as-of <timestamp> to count its time up to that moment, since the tool reads no clock/.test(e.message));
  const done = reportOf(csv(['A', 'high', T('02 09:00'), T('02 09:10'), T('02 10:00')]));
  assert.equal(done.asOf, null);
  assert.equal(done.result.pass, true);
  const bad = reportOf(csv(['A', 'P9', T('02 09:00'), null, null]));
  assert.deepEqual(rulesOf(bad), ['unknown-priority'], 'an open ticket that is not judged needs no --as-of');
  const a = analyse([{ file: 'x.csv', tickets: [{ file: 'x.csv', line: 2, values: { id: 'A', priority: 'high', created: T('02 09:00'), firstResponse: null, resolved: null, paused: [], history: [] } }] }], configOf(), null);
  assert.equal(a.open, 1);
});

test('levels: a rule can be raised, lowered or turned off, and the minimum severity hides what is below it', () => {
  const row = ['A', 'high', T('10 14:05'), null, null];
  assert.equal(reportOf(csv(row), { rules: { firstResponseAtRisk: 'error' } }, { asOf: AS_OF }).result.pass, false);
  const off = reportOf(csv(row), { rules: { firstResponseAtRisk: 'off' } }, { asOf: AS_OF });
  assert.deepEqual(rulesOf(off), []);
  assert.ok(off.notes.includes('1 rule is off: first-response-at-risk'));
  const hidden = reportOf(csv(row), {}, { asOf: AS_OF, minSeverity: 'error' });
  assert.deepEqual(rulesOf(hidden), []);
  assert.equal(hidden.totals.hidden, 1);
  assert.equal(findingsOf(reportOf(csv(row), { rules: { firstResponseAtRisk: 'notice' } }, { asOf: AS_OF }))[0].level, 'notice');
});

test('rules: the input rules, the levels, the result and the rule lookup', () => {
  assert.deepEqual(INPUT_RULES, ['invalid-timestamp', 'timestamps-out-of-order', 'unknown-priority', 'duplicate-ticket']);
  assert.deepEqual(decide([]), { pass: true, errors: 0, byLevel: { error: 0, warning: 0, notice: 0 }, text: 'PASS - no error' });
  assert.equal(decide([{ level: 'warning' }, { level: 'notice' }]).text, 'PASS - no error (1 warning, 1 notice)');
  assert.equal(decide([{ level: 'error' }, { level: 'error' }, { level: 'warning' }]).text, 'FAIL - 2 errors (and 1 warning)');
  assert.equal(atOrAbove('error', 'warning'), true);
  assert.equal(atOrAbove('notice', 'warning'), false);
  assert.equal(ruleById('resolution-overdue').key, 'resolutionOverdue');
  assert.equal(HOUR / MINUTE, 60);
});
