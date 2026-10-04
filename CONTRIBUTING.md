# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux, Windows and macOS with Node 22 and 24, the tests with coverage, the repository checks, CodeQL, and a secure development check of the repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, with `!` for a breaking change.

## Changing a rule

1. Describe the change in docs/method.md first: what the rule looks at and what it can and cannot see. Where the tool makes its own choice, say so in `own` in src/rules.js and say why.
2. Keep the rules conservative. A finding must point at something a reader can check in the export: a ticket on a line, its timestamps, its priority, and the target of the configuration. Never add a rule that guesses what a status or a text means.
3. A run must never pass because something could not be read: an input that cannot be read stops the run with exit code `2`, and a ticket that cannot be judged is an error of its own.
4. Never read the clock, the time zone of the machine or the locale ([decision 1](docs/decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)). "Now" is `--as-of`.
5. Add a test with the export written inline (`csv()`, `reportOf()` and `rulesOfRow()` in test/helpers.js check rows after a small SLA), small enough that the result can be worked out by hand, with a near miss on each side: a second under the target and a second over it.
6. A rule id, once released, keeps its meaning: pipelines and other tools read it from the JSON output and the GitHub annotations.

## Changing how time is counted

1. Every duration is cover time in the calendar of the configuration, and a pause takes out only the cover time inside it ([decision 3](docs/decisions/0003-count-time-only-inside-the-cover-calendar.md)). A change to this changes the result of many tickets; describe it in a decision first.
2. Keep src/calendar.js the one place where cover time is counted, src/zone.js the one place where a named zone is read, and src/time.js the one place where timestamps and dates are read. The rules and the report read their results.
3. Dates are worked out with day numbers, never with the Date object; `Intl.DateTimeFormat` is used in src/zone.js only, always with a named zone and the locale `en-US`.

## Changing a reader

1. The CSV reader follows RFC 4180 and the JSON reader RFC 8259, and nothing more. A new form gets a test of the form itself and of the same form broken, which must stop the run with its line.
2. Keep the work bounded: one pass over each file, the limits of docs/limits.md, and a hostile test with a large input and a time check.
3. A field the tool needs that no ticket has, or a CSV header without it, stops the run, so a misspelt column cannot leave every ticket without a value.

## Changing the configuration file

1. A new key is added to `KEYS` (or `PRIORITY_KEYS`) in src/config.js, documented in docs/inputs.md and tested with a good value and a bad one. Every key the tool does not know stays an error, and a key named twice stays refused.
2. A list of the configuration keeps the array form and `replace`, `add` and `remove`; removing an entry that is not there stays an error.
3. Never add a key that takes a regular expression. File patterns are matched by hand in src/glob.js.

## Changing a source

1. Every point the reports show is in src/data.js, written in this project's own words, with the page it comes from. A short phrase of a page may be named; a long quotation may not.
2. research/sources.md lists every page with a note on what it says, and docs/rules-and-sources.md lists every rule with its points. A test checks all three against each other.

## Changing a reader of files

1. The tool reads; it never follows. A symbolic link named on the command line is refused, a link inside a folder is skipped, and nothing but the files named, the files a walk matches and the configuration is opened.
2. A time check in a test widens under coverage: read `process.env.NODE_V8_COVERAGE`, which the test runner sets only when coverage is on, and allow four times the time. Never read the flags of the process for this, because they hold the coverage flags of the runner in every run. Run `npm run test:coverage` before you open the pull request.
3. An export written with LF and with CRLF line ends, with or without a byte order mark, must give the same output. The example files are stored as written (`.gitattributes`), and a test reads them both ways.

## Tests that depend on the system

A test that depends on the operating system (a symbolic link, a device, file permissions, a character that a file name cannot hold on every system) is guarded with `process.platform`, says why in its `t.skip`, and asserts no line of its own: a line is asserted only in a test that runs on every system, and is worked out there with `lineOf()` of test/helpers.js or from the text itself, never written by hand. `test/repo.test.js` fails when a guarded test asserts a line. Every other test builds its paths with `resolve()` from names with forward slashes.

A test never reads the clock, the time zone of the machine or the locale. Every moment in a test is written out, in the made-up year of the examples ([decision 2](docs/decisions/0002-made-up-timestamps-in-a-year-no-one-can-mistake.md)); a test of a named zone checks that the zone agrees with itself, not with a table written by hand.

## Rules for the code

- No runtime dependencies and no development dependencies. Node 22 or newer and nothing else; the tests use `node:test`.
- The tool reads the files and the configuration it is given and writes only to standard output and standard error. It opens no network connection and runs no program.
- Text from the input, file names included, goes through `safeText` before it reaches the output or an error message.
- Source files stay ASCII; write any other character as a Unicode escape, or build it from its code point.
- Never commit a real secret, even as a fixture. `npm run check` fails on anything that looks like a credential.
- No prose file carries a date, and no file holds a number that reads like a year. Version numbers (Node 22, 1.0.0) and the numbers of a standard (RFC 3339, RFC 4180) are fine. The timestamps of examples and tests are in the made-up year 3001 only.
- Examples and tests use made-up help desks, tickets and customers, never an export of a real one.
- Plain words in the documents: `npm run check` fails on a short list of words that say little.

## Before you open the pull request

```
npm test
npm run test:coverage
npm run check
npm run example
```
