import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { asciiLower, capped, cleanTexts, collectFiles, decodeText, displayPath, fileError, flat, grouped, inspectPath, isBinary, lineStarts, listText, normalizePhrase, plural, positionOf, readBounded, readTextFile, safeText } from '../src/index.js';
import { withFiles } from './helpers.js';

// The small helpers: numbers and lists, text cleaning, words, lines and columns, and the files the tool reads.

test('size: grouped numbers, lists and plurals', () => {
  assert.equal(grouped(1234567), '1,234,567');
  assert.equal(listText([]), '');
  assert.equal(listText(['a']), 'a');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(listText(['a', 'b', 'c']), 'a, b and c');
  assert.equal(listText(['a', 'b', 'c', 'd'], 2), 'a, b and 2 more');
  assert.equal(plural(1, 'file'), '1 file');
  assert.equal(plural(2, 'file'), '2 files');
  assert.equal(plural(2, 'query', 'queries'), '2 queries');
});

test('text: control, line separator and direction characters become spaces; long text is cut; every text of a value is cleaned', () => {
  assert.equal(safeText(`a${String.fromCharCode(27)}b${String.fromCharCode(0x202e)}c${String.fromCharCode(0x2028)}d${String.fromCharCode(0x9b)}e`), 'a b c d e');
  assert.equal(safeText('x'.repeat(20), 10), 'xxxxxxx...');
  assert.equal(flat(' a \n\t b '), 'a b');
  assert.deepEqual(cleanTexts({ a: [`x${String.fromCharCode(7)}`], b: 1, c: null }), { a: ['x '], b: 1, c: null });
  assert.deepEqual(capped(Array.from({ length: 25 }, (_, i) => `p${i}`)).slice(-2), ['p19', 'and 5 more']);
});

test('words: lowercase for A to Z only, and phrases in their compared form', () => {
  assert.equal(asciiLower('ABC-xyz'), 'abc-xyz');
  assert.equal(normalizePhrase("N/A, Don't know!"), 'n a dont know');
  assert.equal(normalizePhrase('P1 - Urgent'), 'p1 urgent');
  assert.equal(normalizePhrase('  On   Hold '), 'on hold');
  assert.equal(normalizePhrase('--'), '');
});

test('lines: LF, CRLF and a lone CR each end a line; positions count from 1', () => {
  const starts = lineStarts('a\nb\r\nc\rd');
  assert.deepEqual(starts, [0, 2, 5, 7]);
  assert.deepEqual(positionOf(starts, 6), { line: 3, column: 2 });
});

test('files: a path relative to the base with forward slashes, and an error that names the file', async () => {
  const base = resolve('base');
  assert.equal(displayPath(resolve(base, 'a/b.csv'), base), 'a/b.csv');
  assert.equal(displayPath(base, base), '.');
  assert.ok(displayPath(resolve(base, '../x.csv'), base).endsWith('/x.csv'));
  assert.equal(fileError('a.csv', 'why').message, 'a.csv: why');
  assert.equal(fileError('a.csv', 'why').reason, 'why');
  await withFiles({ 'a.csv': 'hello', 'd/b.csv': 'x' }, async (dir) => {
    assert.equal((await readBounded(resolve(dir, 'a.csv'), 10)).toString(), 'hello');
    await assert.rejects(readBounded(resolve(dir, 'a.csv'), 2), /5 bytes is over the 2 byte limit/);
    await assert.rejects(readBounded(resolve(dir, 'none.csv'), 2), /no such file/);
    await assert.rejects(readBounded(resolve(dir, 'd'), 2), /is a folder|cannot be read/);
    assert.deepEqual(await inspectPath('a.csv', dir), { full: resolve(dir, 'a.csv'), shown: 'a.csv', folder: false });
    await assert.rejects(inspectPath('d', dir), /d: is a folder; give the file itself/);
    assert.deepEqual(await inspectPath('d', dir, true), { full: resolve(dir, 'd'), shown: 'd', folder: true });
    await assert.rejects(inspectPath('none', dir), /none: no such file/);
  });
});

test('files: a text file is read as UTF-8 without its byte order mark; UTF-16 and binary files are refused', async () => {
  const bom = Buffer.from([0xef, 0xbb, 0xbf]);
  assert.equal(decodeText(Buffer.concat([bom, Buffer.from('a,b')])), 'a,b');
  assert.equal(isBinary(Buffer.from([65, 0, 66])), true);
  assert.equal(isBinary(Buffer.from('plain')), false);
  assert.equal(decodeText(Buffer.from([0xc3, 0x28])), null, 'bytes that are not UTF-8');
  await withFiles({ 'u8.csv': Buffer.concat([bom, Buffer.from('x\n')]), 'u16.csv': Buffer.from([0xff, 0xfe, 0x61, 0]), 'bin.csv': Buffer.from([0x61, 0, 0x62]), 'latin1.csv': Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x0a]) }, async (dir) => {
    const r = await readTextFile('u8.csv', dir, 100);
    assert.deepEqual({ file: r.file, size: r.size, text: r.text }, { file: 'u8.csv', size: 5, text: 'x\n' });
    await assert.rejects(readTextFile('u16.csv', dir, 100), /u16.csv: is UTF-16; only UTF-8 is read/);
    await assert.rejects(readTextFile('bin.csv', dir, 100), /bin.csv: holds binary data \(a null byte\); only text is read/);
    await assert.rejects(readTextFile('u8.csv', dir, 2), /u8.csv: 5 bytes is over the 2 byte limit/);
    await assert.rejects(readTextFile('latin1.csv', dir, 100), /latin1.csv: is not valid UTF-8; only UTF-8 text is read/);
  });
});

test('files: a folder is walked in the order of its paths, with the patterns, and a folder with nothing to read is an error', async () => {
  const patterns = { files: ['**/*.csv'], exclude: ['**/old/*.csv'] };
  await withFiles({ 'x/b.csv': 'x', 'x/a.csv': 'x', 'x/sub/c.csv': 'x', 'x/old/s.csv': 'x', 'x/notes.md': 'x', 'x/node_modules/m.csv': 'x', 'x/.git/g.csv': 'x', 'one.txt': 'x', 'empty/readme.md': 'x' }, async (dir) => {
    const r = await collectFiles(['x', 'one.txt', 'x/a.csv'], dir, patterns);
    assert.deepEqual(r.files.map((f) => f.shown), ['x/a.csv', 'x/b.csv', 'x/sub/c.csv', 'one.txt'], 'a file named directly is read whatever its name, and once');
    assert.deepEqual(r.named, ['x', 'one.txt', 'x/a.csv']);
    assert.equal(r.skippedLinks, 0);
    await assert.rejects(collectFiles(['empty'], dir, patterns), /empty: no file in this folder matches \*\*\/\*\.csv outside \*\*\/old\/\*\.csv/);
    await assert.rejects(collectFiles(['x'], dir, patterns, { maxFiles: 2, maxEntries: 100, maxDepth: 32 }), /more than 2 ticket files/);
    await assert.rejects(collectFiles(['x'], dir, patterns, { maxFiles: 10, maxEntries: 3, maxDepth: 32 }), /x: more than 3 files and folders to look at/);
    await assert.rejects(collectFiles(['x'], dir, patterns, { maxFiles: 10, maxEntries: 100, maxDepth: 0 }), /folders nested more than 0 deep/);
    await assert.rejects(collectFiles(['none'], dir, patterns), /none: no such file/);
  });
});
