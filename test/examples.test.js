import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AS_OF, BREACHING, CLEAN, EXPECTED, UNWANTED, run } from '../tools/example.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');

test('examples: the breaching set fails with the report that is saved in examples/output', async () => {
  const r = await run(BREACHING);
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('breaching.txt'));
  for (const e of EXPECTED) assert.ok(r.out.includes(e), e);
  for (const u of UNWANTED) assert.ok(!r.out.includes(u), u);
});

test('examples: the clean set passes with the report that is saved', async () => {
  const r = await run(CLEAN);
  assert.equal(r.code, 0);
  assert.equal(r.out, await saved('clean.txt'));
  assert.match(r.out, /\nfindings: 0\n/);
});

test('examples: --explain, JSON, the GitHub commands and the defaults are the reports that are saved', async () => {
  assert.equal((await run([...BREACHING, '--explain'])).out, await saved('breaching-explain.txt'));
  assert.equal((await run([...BREACHING, '--json', '--explain'])).out, await saved('breaching.json'));
  assert.equal((await run([...BREACHING, '--format', 'github'])).out, await saved('breaching-github.txt'));
  assert.equal((await run(['--print-defaults'])).out, await saved('defaults.json'));
});

test('examples: the rules that fire on the breaching set, each on the line built for it', async () => {
  const report = JSON.parse((await run([...BREACHING, '--json'])).out);
  const byRule = {};
  for (const f of report.findings) (byRule[f.rule] ??= []).push(`${f.at} ${f.ticket}`);
  // The place of the n-th line that holds needle, and the ticket of the finding. A JSON ticket starts on the line of
  // its opening brace, the line before its id.
  const at = async (rel, needle, ticket, n = 1) => {
    const lines = (await readFile(resolve(root, 'examples/breaching', rel), 'utf8')).split('\n');
    let seen = 0;
    const index = lines.findIndex((l) => l.includes(needle) && (seen += 1) === n);
    return `examples/breaching/${rel}:${rel.endsWith('.json') ? index : index + 1} ${ticket}`;
  };
  assert.deepEqual(byRule, {
    'first-response-missed': [await at('phone.json', '"id": "JD-302"', 'JD-302'), await at('tickets.csv', 'JD-201,', 'JD-201')],
    'invalid-timestamp': [await at('phone.json', '"id": "JD-303"', 'JD-303'), await at('tickets.csv', 'JD-208,', 'JD-208')],
    'resolution-missed': [await at('tickets.csv', 'JD-202,', 'JD-202')],
    'resolution-overdue': [await at('tickets.csv', 'JD-204,', 'JD-204')],
    'first-response-overdue': [await at('tickets.csv', 'JD-205,', 'JD-205')],
    'unknown-priority': [await at('tickets.csv', 'JD-207,', 'JD-207')],
    'timestamps-out-of-order': [await at('tickets.csv', 'JD-209,', 'JD-209')],
    'duplicate-ticket': [await at('tickets.csv', 'JD-202,', 'JD-202', 2)],
    'resolution-at-risk': [await at('tickets.csv', 'JD-206,', 'JD-206')],
    'first-response-at-risk': [await at('tickets.csv', 'JD-210,', 'JD-210')]
  });
  // The phone ticket that waited on the customer meets its target only because the wait is not counted.
  const strict = await withConfig({ pausedStatuses: [] }, async (args) => JSON.parse((await run([...args, '--json'])).out));
  assert.ok(strict.findings.some((f) => f.ticket === 'JD-301' && f.rule === 'resolution-missed'));
});

// Runs the breaching set with the example configuration changed, from a copy in a temporary folder.
async function withConfig(change, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'sla-breach-check-config-'));
  try {
    const config = JSON.parse(await readFile(resolve(root, 'examples/sla.json'), 'utf8'));
    await writeFile(resolve(dir, 'sla.json'), JSON.stringify({ ...config, ...change }));
    return await fn(['examples/breaching', '--config', resolve(dir, 'sla.json'), '--as-of', AS_OF]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('examples: the same files written with CRLF line ends give the same output', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'sla-breach-check-crlf-'));
  try {
    await cp(resolve(root, 'examples'), resolve(dir, 'examples'), { recursive: true });
    for (const sub of ['examples/breaching', 'examples/clean', 'examples']) {
      for (const f of (await readdir(resolve(dir, sub))).filter((n) => n.endsWith('.csv') || n.endsWith('.json'))) {
        const t = (await readFile(resolve(dir, sub, f), 'utf8')).split('\r\n').join('\n');
        await writeFile(resolve(dir, sub, f), t.split('\n').join('\r\n'));
      }
    }
    assert.equal((await run([...BREACHING, '--explain'], dir)).out, await saved('breaching-explain.txt'));
    assert.equal((await run(CLEAN, dir)).out, await saved('clean.txt'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
