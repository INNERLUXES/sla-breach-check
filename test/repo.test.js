import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KEYS, PRIORITY_KEYS, RULES } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
const HOMEPAGE = 'https://innerluxes.dev/software-development/maintenance-and-support';
const DECISIONS = ['docs/decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md', 'docs/decisions/0002-made-up-timestamps-in-a-year-no-one-can-mistake.md', 'docs/decisions/0003-count-time-only-inside-the-cover-calendar.md'];
const docFiles = async () => ['README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'research/sources.md', ...(await readdir(resolve(root, 'docs'), { recursive: true })).filter((f) => f.endsWith('.md')).map((f) => `docs/${f.split('\\').join('/')}`)];
const YEAR = /\b(?:19|20)\d{2}\b/;
// A full date. The only dates in the repository are the made-up timestamps of the examples, the tests and the samples of
// the documents, all in the year 3001 (docs/decisions/0002-made-up-timestamps-in-a-year-no-one-can-mistake.md).
const DATE = /\d{4}-\d{2}-\d{2}/g;
const MADE_UP_YEAR = '3001';

// Every file of a folder of the repository, with forward slashes.
async function filesOf(dir) {
  const out = [];
  const walk = async (rel) => {
    for (const e of await readdir(resolve(root, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  };
  await walk(dir);
  return out.sort();
}

// Every text file of the repository that is committed.
async function allFiles() {
  const out = [];
  const walk = async (rel) => {
    for (const e of await readdir(resolve(root, rel || '.'), { withFileTypes: true })) {
      if (['.git', 'node_modules', 'coverage', 'dist'].includes(e.name)) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  };
  await walk('');
  return out.sort();
}

test('package.json: a zero-dependency Node 22 ES module with the bin, the scripts, the author and the homepage', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.name, 'sla-breach-check');
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(pkg.homepage, HOMEPAGE);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.author, 'INNERLUXES <info@innerluxes.dev>');
  assert.equal(pkg.repository.url, 'git+https://github.com/INNERLUXES/sla-breach-check.git');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.bin['sla-breach-check'], 'bin/sla-breach-check.js');
  for (const k of ['sla', 'slo', 'support', 'help-desk', 'itsm']) assert.ok(pkg.keywords.includes(k), k);
  for (const script of ['test', 'check', 'example', 'test:coverage']) assert.ok(pkg.scripts[script], script);
  const lock = JSON.parse(await read('package-lock.json'));
  assert.deepEqual(Object.keys(lock.packages), ['']);
  assert.equal(lock.version, pkg.version);
  assert.ok((await read('bin/sla-breach-check.js')).startsWith('#!/usr/bin/env node\n'));
});

test('README: one link to the maintenance and support page, in the closing Background section, with the agreed anchor text', async () => {
  const readme = await read('README.md');
  const parts = readme.split(/^## /m);
  const background = parts.find((p) => p.startsWith('Background'));
  assert.ok(background, 'a Background section');
  assert.ok(background.includes(`[Software Maintenance and Support](${HOMEPAGE})`));
  assert.equal(readme.split('innerluxes.dev/').length - 1, 1, 'the README links to the site once');
  assert.equal(parts.at(-1).split('\n')[0], 'License');
  assert.equal(parts.at(-2).split('\n')[0], 'Background');
});

test('README: the npm test block shows the summary counts with no symbol in front, and they add up', async () => {
  const readme = await read('README.md');
  const block = /```\n(tests (\d+)\npass (\d+)\nfail (\d+)\nskipped (\d+))\n```/.exec(readme);
  assert.ok(block, 'the npm test block');
  const [, , tests, pass, fail, skipped] = block.map(Number);
  assert.equal(pass + fail + skipped, tests);
  assert.equal(fail, 0);
  assert.ok(tests > 100);
});

test('README: what it checks, how to run it with npx or node, the options, the example output and the limits', async () => {
  const readme = await read('README.md');
  for (const heading of ['## Quick start', '## Usage', '## What it checks', '## Cover time', '## The configuration file', '## The ticket export', '## Formats', '## Exit codes', '## Limits']) assert.ok(readme.includes(`\n${heading}\n`), heading);
  assert.match(readme, /npx --yes github:INNERLUXES\/sla-breach-check/);
  assert.match(readme, /node bin\/sla-breach-check\.js examples\/breaching --config examples\/sla\.json --as-of 3001-03-10T15:00:00\+01:00/);
  for (const option of ['--config', '--as-of', '--format', '--json', '--min-severity', '--explain', '--print-defaults', '--help', '--version']) assert.ok(readme.includes(option), option);
  for (const r of RULES) assert.ok(readme.includes(`| \`${r.id}\` | \`rules.${r.key}\` |`), `README: ${r.id}`);
  assert.ok(readme.includes('https://sre.google/sre-book/service-level-objectives/'));
  assert.ok(readme.includes('https://www.rfc-editor.org/rfc/rfc3339'));
  assert.match(readme, /never reads the clock/);
});

test('README and documents: no number that reads like a year, no date in words, and full dates only in the made-up year of the samples', async () => {
  for (const file of await docFiles()) {
    const text = await read(file);
    assert.doesNotMatch(text, YEAR, file);
    assert.doesNotMatch(text, /\b(?:January|February|March|April|June|July|August|September|October|November|December)\s+\d/, file);
    for (const m of text.matchAll(DATE)) assert.equal(m[0].slice(0, 4), MADE_UP_YEAR, `${file}: ${m[0]}`);
  }
  for (const file of ['LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'research/sources.md', 'package.json', ...DECISIONS]) assert.doesNotMatch(await read(file), DATE, `${file} holds no date at all`);
  assert.match(await read('CHANGELOG.md'), /^## 1\.0\.0$/m);
});

test('README and documents: plain ASCII, with no emoji and no decorative character', async () => {
  for (const file of [...(await docFiles()), '.github/pull_request_template.md', '.github/CODEOWNERS', 'package.json']) {
    const text = await read(file);
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), file);
  }
});

test('every file: none of the words this project keeps out of its prose, and no name of a tool that wrote it', async () => {
  // Built from pieces, so that this file does not hold the words; a word is matched at its start.
  const words = [['har', 'ness'], ['del', 'v'], ['lever', 'ag'], ['seam', 'less'], ['rob', 'ust'], ['cutting', '-edg'], ['un', 'lock'], ['em', 'power'], ['ele', 'vat'], ['stream', 'lin'], ['game', '-changer'], ['tap', 'estr'], ['re', 'alm'], ['further', 'more'], ['more', 'over'], ['in today', "'s"]].map((p) => p.join(''));
  const banned = new RegExp(`\\b(?:${words.join('|')})`, 'i');
  const names = new RegExp(`${['cla', 'ude'].join('')}|${['anthro', 'pic'].join('')}|\\b${['A', 'I'].join('')}\\b|\\b${['assis', 'tant'].join('')}|\\b${['ch', 'at'].join('')}\\b|${['ses', 'sion'].join('')}|${['co-', 'authored'].join('')}`, 'i');
  for (const file of await allFiles()) {
    if (file === 'tools/check.mjs') continue;
    const text = await read(file);
    assert.doesNotMatch(text, banned, file);
    assert.doesNotMatch(text, names, file);
  }
});

test('LICENSE: MIT with the copyright line of INNERLUXES and no year', async () => {
  const license = await read('LICENSE');
  assert.ok(license.startsWith('MIT License\n\nCopyright (c) INNERLUXES\n'));
});

test('SECURITY.md: how to report, and no promise about reply times or fixes', async () => {
  const text = await read('SECURITY.md');
  assert.match(text, /info@innerluxes\.dev/);
  assert.match(text, /"sla-breach-check security"/);
  assert.doesNotMatch(text, /within\s+\d|business days|within a (?:day|week)|\d+\s*(?:hours|days)\b|we will|guarantee|respond within|reply within/i);
});

test('workflows: every action is pinned to a commit, the CI runs three systems, two Node versions and coverage, and the SSDF gate is there', async () => {
  for (const name of ['ci.yml', 'codeql.yml', 'release.yml']) {
    const text = await read(`.github/workflows/${name}`);
    assert.match(text, /^permissions:\n {2}contents: read$/m, name);
    const uses = [...text.matchAll(/^\s*- uses: (\S+)/gm)].map((m) => m[1]);
    assert.ok(uses.length > 0, name);
    for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `${name}: ${u}`);
  }
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(ci, /node: \[22, 24\]/);
  assert.match(ci, /run: npm run test:coverage/);
  assert.match(ci, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(ci, /repository: INNERLUXES\/ssdf-repo-check/);
  for (const s of [/npm ci/, /npm run check/, /npm run example/, /git diff --exit-code -- examples/]) assert.match(ci, s);
});

test('release workflow: the SSDF gate, then a tgz, a CycloneDX SBOM, SHA256SUMS and a provenance attestation named for this package', async () => {
  const release = await read('.github/workflows/release.yml');
  assert.match(release, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(release, /ref: dfda194a3ed35623b8b420df05e110b66d984586 # v1\.0\.0/);
  assert.ok(release.indexOf('ssdf-repo-check.js') < release.indexOf('npm pack'), 'the gate runs before the package is made');
  assert.match(release, /npm pack --pack-destination dist/);
  assert.match(release, /npm sbom --sbom-format cyclonedx > dist\/sla-breach-check\.cdx\.json/);
  assert.match(release, /sha256sum \* > SHA256SUMS/);
  assert.match(release, /actions\/attest-build-provenance@/);
  assert.match(release, /tags: \['v\*'\]/);
});

test('repository files: Dependabot for actions and npm, CodeQL, CODEOWNERS, a pull request template and the line-end rules', async () => {
  const dependabot = await read('.github/dependabot.yml');
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(await read('.github/workflows/codeql.yml'), /security-extended/);
  assert.match(await read('.github/CODEOWNERS'), /^\* @innerluxesdev$/m);
  assert.match(await read('.github/CODEOWNERS'), /^\/src\/calendar\.js @innerluxesdev$/m);
  assert.match(await read('.github/pull_request_template.md'), /npm run example/);
  const attributes = await read('.gitattributes');
  assert.match(attributes, /^\* text=auto eol=lf$/m);
  assert.match(attributes, /^examples\/clean\/\*\* -text$/m);
  assert.match(attributes, /^examples\/breaching\/\*\* -text$/m);
  assert.match(attributes, /^examples\/output\/\*\* -text$/m);
  assert.match(await read('.gitignore'), /^\.env$/m);
});

test('the repository names no other tool of the organization outside the SSDF gate', async () => {
  for (const file of ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/workflows/release.yml', '.github/CODEOWNERS', '.github/pull_request_template.md', 'package.json', 'src/cli.js', 'src/check.js']) {
    assert.doesNotMatch(await read(file), /tenant-scope-check|system-of-record-check|review-latency-check|core-hours-overlap-check|handover-check|delivery-metrics|kb-gap-finder|release-gate-check/i, file);
  }
});

test('docs: every rule and key is described, and the documents of the set are there and linked', async () => {
  const method = await read('docs/method.md');
  for (const r of RULES) assert.ok(method.includes(`### \`${r.id}\``), `docs/method.md: ${r.id}`);
  const inputs = await read('docs/inputs.md');
  const keys = (obj, path = '') => Object.entries(obj).flatMap(([k, v]) => (typeof v === 'object' ? [`${path}${k}`, ...keys(v, `${path}${k}.`)] : [`${path}${k}`]));
  for (const k of keys(KEYS)) assert.ok(inputs.includes(`\`${k}\``), `docs/inputs.md: ${k}`);
  for (const k of Object.keys(PRIORITY_KEYS)) assert.ok(inputs.includes(`\`priorities.<name>.${k}\``), `docs/inputs.md: priorities.<name>.${k}`);
  const readme = await read('README.md');
  for (const f of ['docs/method.md', 'docs/rules-and-sources.md', 'docs/limits.md', 'docs/inputs.md', 'docs/secure-defaults.md', 'docs/threat-model.md', 'research/sources.md']) assert.ok(readme.includes(`(${f}`), f);
  for (const f of ['docs/inputs.md', 'docs/secure-defaults.md', 'docs/threat-model.md', ...DECISIONS, 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md']) assert.ok((await read(f)).length > 500, f);
  assert.match(await read('docs/secure-defaults.md'), /NIST SP 800-218/);
  const threats = await read('docs/threat-model.md');
  for (const t of ['workflow command', '__proto__', 'symbolic link', 'regular expression', 'clock', 'binary', 'quote', 'offset']) assert.match(threats, new RegExp(t.replace(/[_.]/g, '.'), 'i'), t);
  for (const t of ['cover time', '24x7', 'holiday', '--as-of', 'paused', 'nearest rank', 'RFC 4180', 'RFC 3339']) assert.ok(method.toLowerCase().includes(t.toLowerCase()), `docs/method.md: ${t}`);
  const limits = await read('docs/limits.md');
  for (const t of ['help desk', 'time zone database', 'clock change', 'calendar days', 'export']) assert.ok(limits.includes(t), `docs/limits.md: ${t}`);
  for (const d of DECISIONS) assert.match(await read(d), /^# \d\. .+\n\n## Status\n\nAccepted\n\n## Context\n[\s\S]+\n## Decision\n[\s\S]+\n## Consequences\n/, d);
});

test('src imports no network, process or code evaluation module, and calls none of them', async () => {
  const forbidden = /from 'node:(?:net|http|https|http2|dgram|dns|tls|child_process|worker_threads|cluster|vm|inspector)'|\bfetch\(|XMLHttpRequest|WebSocket\(|\beval\(|new Function\(|\brequire\(|\bimport\(/;
  for (const file of await readdir(resolve(root, 'src'))) assert.doesNotMatch(await read(`src/${file}`), forbidden, file);
});

test('src builds no regular expression from text it reads: no new RegExp anywhere in src', async () => {
  for (const file of await readdir(resolve(root, 'src'))) {
    const text = await read(`src/${file}`);
    if (file === 'text.js') {
      // The one pattern built at run time is made of fixed code points.
      assert.equal(text.split('new RegExp(').length - 1, 1, file);
      assert.match(text, /new RegExp\(`\[\$\{span\(0, 0x1f\)\}/);
    } else assert.ok(!text.includes('new RegExp('), file);
  }
});

test('src reads only what it is given: the file system is used in src/files.js only, never follows a link, and writes nothing', async () => {
  for (const file of await readdir(resolve(root, 'src'))) {
    const text = await read(`src/${file}`);
    if (file === 'files.js') {
      assert.match(text, /import \{ lstat, open, readdir \} from 'node:fs\/promises'/);
      assert.match(text, /O_NOFOLLOW/);
      assert.match(text, /e\.isSymbolicLink\(\)\) skippedLinks \+= 1/, 'a link inside a folder is skipped');
      assert.doesNotMatch(text, /writeFile|appendFile|mkdir|mkdtemp|rename\(|unlink|realpath|readlink|opendir|symlink\(|'w'/, 'nothing is followed and nothing is written');
    } else if (file === 'cli.js') assert.match(text, /import \{ readFileSync \} from 'node:fs'/);
    else assert.doesNotMatch(text, /from 'node:fs/, file);
  }
});

test('src reads no clock, no random number, no locale and no time zone of the machine; a named zone is read in src/zone.js only', async () => {
  for (const file of await readdir(resolve(root, 'src'))) {
    const text = await read(`src/${file}`);
    assert.doesNotMatch(text, /Date\.now\(|new Date\(|\bDate\.UTC\(|Date\.parse\(|performance\.now|Math\.random|process\.hrtime|getTimezoneOffset|resolvedOptions|toLocale(?:Date|Time)String|toLocaleLowerCase|toLocaleUpperCase|localeCompare|\.get(?:UTC)?(?:Hours|Minutes|Date|Day|Month|FullYear)\(|process\.env\.TZ/, file);
    for (const m of text.matchAll(/toLocaleString\(([^)]*)\)/g)) assert.equal(m[1], "'en-US'", `${file}: toLocaleString always names its locale`);
    if (file === 'zone.js') {
      assert.equal(text.split('new Intl.').length - 1, 1, 'one formatter');
      assert.match(text, /new Intl\.DateTimeFormat\('en-US', \{ timeZone: text, hourCycle: 'h23',/);
    } else assert.doesNotMatch(text, /new Intl\.|Intl\.supportedValuesOf/, file);
  }
});

test('tests: a test file that makes a link, names a device or changes permissions guards it with process.platform, and a guarded test asserts no line', async () => {
  const files = (await readdir(resolve(root, 'test'))).filter((f) => f.endsWith('.test.js'));
  let guarded = 0;
  for (const f of files) {
    const text = await read(`test/${f}`);
    if (/symlink\(|chmod\(|\/dev\/(?:null|zero)/.test(text.replace(/\/\/.*$/gm, ''))) {
      assert.match(text, /process\.platform/, `${f} uses a link, a device or permissions`);
      guarded += 1;
    }
    for (const block of text.split(/\ntest\(/).filter((b) => /if \(process\.platform/.test(b))) {
      assert.doesNotMatch(block, /\.line\b|lineOf\(|positionOf\(|line \d|:\d+\b|line=\d/, `${f}: a test guarded by the system asserts a line`);
    }
  }
  assert.ok(guarded >= 1);
});

test('tests: every test that is skipped on a system says why, and the guards name a system', async () => {
  for (const f of (await readdir(resolve(root, 'test'))).filter((n) => n.endsWith('.test.js'))) {
    const text = await read(`test/${f}`);
    for (const m of text.matchAll(/\bt\.skip\(([^)]*)\)/g)) assert.match(m[1], /\S+\s+\S+\s+\S+/, `${f}: skip without a reason`);
    for (const m of text.matchAll(/process\.platform (?:===|!==) '([a-z0-9]+)'/g)) assert.ok(['win32', 'linux', 'darwin'].includes(m[1]), m[1]);
  }
});

test('tests: a time limit in a test widens under coverage through NODE_V8_COVERAGE, never through the flags of the process', async () => {
  const hostile = await read('test/hostile.test.js');
  assert.match(hostile, /const COVERAGE = Boolean\(process\.env\.NODE_V8_COVERAGE\);/);
  assert.match(hostile, /const limit = COVERAGE \? ms \* 4 : ms;/);
  for (const f of (await readdir(resolve(root, 'test'))).filter((n) => n.endsWith('.js'))) {
    const text = await read(`test/${f}`);
    assert.doesNotMatch(text, new RegExp(['exec', 'Argv'].join('')), f);
    if (/Date\.now\(\) - start/.test(text)) assert.ok(text.includes('COVERAGE ? ms * 4 : ms'), `${f}: a time check that does not widen under coverage`);
  }
});

test('tests and examples: no number that reads like a year, and every date in the made-up year', async () => {
  for (const f of [...(await filesOf('test')), ...(await filesOf('examples')), ...(await filesOf('tools')), ...(await filesOf('src'))]) {
    const text = await read(f);
    assert.doesNotMatch(text, YEAR, f);
    for (const m of text.matchAll(DATE)) assert.equal(m[0].slice(0, 4), MADE_UP_YEAR, `${f}: ${m[0]}`);
  }
  for (const f of await filesOf('src')) assert.doesNotMatch(await read(f), DATE, `${f} holds no date at all`);
});

test('the examples are made up: no address, no token-shaped string, no web link, ASCII, LF line ends', async () => {
  const tokenShape = new RegExp(`${['gh', 'p_'].join('')}[A-Za-z0-9]{20}|${['github', '_pat_'].join('')}|${['AK', 'IA'].join('')}[0-9A-Z]{16}`);
  const files = await filesOf('examples');
  for (const f of files) {
    const text = await read(f);
    assert.doesNotMatch(text, tokenShape, f);
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), f);
    assert.ok(!text.includes('@'), `${f} holds no email address`);
    if (!f.startsWith('examples/output/')) {
      assert.doesNotMatch(text, /https?:\/\//i, `${f} holds no web link`);
      assert.ok(!text.includes('\r'), `${f} keeps LF line ends`);
    }
  }
  const outputs = (await filesOf('examples/output')).map((f) => f.split('/').at(-1));
  assert.deepEqual(outputs, ['breaching-explain.txt', 'breaching-github.txt', 'breaching.json', 'breaching.txt', 'clean.txt', 'defaults.json']);
  assert.deepEqual((await filesOf('examples/clean')).map((f) => f.slice('examples/clean/'.length)), ['README.md', 'tickets.csv']);
  assert.deepEqual((await filesOf('examples/breaching')).map((f) => f.slice('examples/breaching/'.length)), ['README.md', 'phone.json', 'tickets.csv']);
});
