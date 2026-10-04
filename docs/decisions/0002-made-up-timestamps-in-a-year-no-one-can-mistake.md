# 2. Made-up timestamps in a year no one can mistake

## Status

Accepted

## Context

[Decision 1](0001-read-no-clock-and-keep-dates-out-of-the-repository.md) keeps dates out of the repository, and
`npm run check` fails on any number that reads like a year, which it defines as a four-digit number that starts with
19 or 20. This tool cannot be shown or tested without dates: a ticket export is a list of timestamps, a holiday is a
date, and the README must show the real output of a real run, with its `--as-of`.

Three ways were weighed:

- Leave the example data and the tests out of the year check. The check of the related tools has no such exclusion,
  a path list of exceptions grows, and a real date could then slip into an example unnoticed.
- Weaken the check for every file, for instance to dates only. That would let a year back into the prose.
- Keep the check as it is for every file and write every timestamp in a year the check does not match and no reader
  can take for a real one.

## Decision

1. Every timestamp and every date in the repository is made up and lies in the year 3001: the example exports, the
   holidays of the example configuration, the `--as-of` of the examples, the tests and the samples in the README and
   in docs/inputs.md. The made-up week starts on a Monday, the second day of the third month.
2. The year check of `npm run check` stays as it is and runs over every file, example data and output included. No
   file is left out of it.
3. A test fails on a full date in any other year anywhere in the repository, and on any full date at all in the
   licence, the changelog, the contributing guide, the security policy, the note on sources, the decisions, the
   package file and the code in `src`.
4. The tool itself knows nothing of this year. It reads RFC 3339 timestamps from year 1 to 9999, and its tests cover
   the calendar rules (leap years, month lengths) around the made-up year as well as near day 0.

## Consequences

- The README shows the real output of the examples, with their dates, and a reader sees at once that the dates are
  made up.
- A real date pasted into an example or a test fails the test of the repository, so the example data cannot drift
  into describing a real week.
- A named time zone is projected far ahead by the time zone database, and its rules for that year are a guess of the
  database. The examples use a fixed offset (`+01:00`) for that reason, so their output does not move when the
  database changes; the tests of named zones check that a zone agrees with itself rather than with a table written by
  hand.
