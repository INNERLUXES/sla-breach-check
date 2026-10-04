// Runs the README examples, checks that they report what the README shows, and writes the reports of the two made-up
// ticket sets to examples/output. CI runs it and then fails if those files changed, so the example output in the
// repository is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// The moment the examples are measured up to. The tool reads no clock, so the examples name it; the year is made up and
// far from any real one (docs/decisions/0002-made-up-timestamps-in-a-year-no-one-can-mistake.md).
export const AS_OF = '3001-03-10T15:00:00+01:00';

// The arguments of the examples; every path is relative to the root of the repository.
export const BREACHING = ['examples/breaching', '--config', 'examples/sla.json', '--as-of', AS_OF];
export const CLEAN = ['examples/clean', '--config', 'examples/sla.json', '--as-of', AS_OF];

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the breaching set: the counts, one finding of every rule, the summary rows and the result.
export const EXPECTED = [
  'input: examples/breaching (2 files, 15 tickets: 11 resolved, 4 open)',
  'findings: 12 (10 error, 2 warning)',
  'ticket JD-201 (urgent): the first response came after 55m of cover time, 25m past the target of 30m',
  'ticket JD-202 (high): resolved after 10h 10m of cover time, 2h 10m past the target of 8h',
  'ticket JD-204 (low) is not resolved after 41h 30m of cover time up to --as-of, 1h 30m past the target of 40h',
  'ticket JD-205 (high) has no first response after 1h 15m of cover time up to --as-of, 15m past the target of 1h',
  'ticket JD-206 (normal) is not resolved yet: 20h of the 24h target used up to --as-of (83%), 4h left',
  'ticket JD-210 (high) has no first response yet: 55m of the 1h target used up to --as-of (91%), 5m left',
  'ticket JD-207: priority "P5" is not a priority of the SLA',
  'ticket JD-208: created "3001-03-04 10:20" has no offset',
  'ticket JD-209: first_response "3001-03-04T09:40:00+01:00" is before created',
  'ticket JD-202 was read before, at examples/breaching/tickets.csv:3; this copy is not judged',
  'ticket JD-302 (high): the first response came after 1h 10m of cover time, 10m past the target of 1h',
  'ticket JD-303: resolved "3001-02-30T10:00:00+01:00" names a date that does not exist',
  '  high      1h      4        1    2       1     1        33.3%      1h      1h 10m',
  '  tickets  15: 11 resolved, 4 open; 5 not judged for an input problem',
  'RESULT: FAIL - 10 errors (and 2 warnings)'
];
// Tickets that meet their targets, or are judged as met once their paused time is taken out, are not reported.
export const UNWANTED = ['RESULT: PASS', 'JD-203', 'JD-211', 'JD-301'];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const breaching = await run(BREACHING);
  process.stdout.write(breaching.out);
  expect('breaching set', breaching, 1, EXPECTED, UNWANTED);

  const clean = await run(CLEAN);
  expect('clean set', clean, 0, ['input: examples/clean (1 file, 8 tickets: 6 resolved, 2 open)', 'findings: 0', 'RESULT: PASS - no error'], ['  WARNING  ', '  ERROR  ', '  NOTICE  ', 'RESULT: FAIL']);

  // One file of the set can be named on its own, and only the errors can be shown.
  expect('breaching, the CSV file alone', await run(['examples/breaching/tickets.csv', '--config', 'examples/sla.json', '--as-of', AS_OF]), 1, ['sla-breach-check: examples/breaching/tickets.csv', 'findings: 10 (8 error, 2 warning)'], ['JD-302']);
  expect('breaching, errors only', await run([...BREACHING, '--min-severity', 'error']), 1, ['findings: 10 (10 error); 2 below error not shown'], ['WARNING']);
  // Open tickets with no --as-of stop the run: the tool reads no clock to measure them by.
  expect('breaching, no --as-of', await run(['examples/breaching', '--config', 'examples/sla.json']), 2, ['4 tickets are open; give --as-of <timestamp>'], [], 'err');

  // The README shows the whole report of the breaching set, the --explain lines of one finding, the GitHub annotations
  // of the first findings of the CSV file and the report of the clean set.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  if (!readme.includes(breaching.out)) problems.push('README: the sample output of the breaching set differs from a real run');
  if (!readme.includes(clean.out)) problems.push('README: the sample output of the clean set differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  await writeFile(resolve(root, 'examples/output/breaching.txt'), breaching.out);
  await writeFile(resolve(root, 'examples/output/clean.txt'), clean.out);
  const explain = await run([...BREACHING, '--explain']);
  if (explain.code !== 1) problems.push(`explain: exit code ${explain.code}, expected 1`);
  const lines = explain.out.split('\n');
  const at = lines.findIndex((l) => l.includes('resolution-missed') && l.includes('tickets.csv:3'));
  const sample = lines.slice(at, at + 7).join('\n');
  if (at < 0 || !readme.includes(sample)) problems.push('README: the --explain sample of the missed resolution differs from a real run');
  await writeFile(resolve(root, 'examples/output/breaching-explain.txt'), explain.out);
  const github = await run([...BREACHING, '--format', 'github']);
  if (github.code !== 1) problems.push(`github: exit code ${github.code}, expected 1`);
  for (const l of github.out.split('\n').filter((x) => x.includes('tickets.csv,line=2,') || x.includes('tickets.csv,line=3,'))) if (!readme.includes(l)) problems.push('README: the GitHub sample differs from a real run');
  await writeFile(resolve(root, 'examples/output/breaching-github.txt'), github.out);
  const json = await run([...BREACHING, '--json', '--explain']);
  if (json.code !== 1) problems.push(`json: exit code ${json.code}, expected 1`);
  await writeFile(resolve(root, 'examples/output/breaching.json'), json.out);
  const defaults = await run(['--print-defaults']);
  if (defaults.code !== 0) problems.push(`--print-defaults: exit code ${defaults.code}, expected 0`);
  await writeFile(resolve(root, 'examples/output/defaults.json'), defaults.out);

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
