# 1. Read no clock, and keep dates out of the repository

## Status

Accepted

## Context

An SLA report is about time, and the easy way to measure an open ticket is to take the time of the machine as "now".
Doing so would make the same export give a different result every minute: a pipeline that passed in the morning would
fail in the afternoon with no change to the export, two people running the check on the same file would see two
answers, and the output could never be saved and compared. It would also tie the result to the clock of a CI runner,
which nobody looks at, rather than to the moment the export was taken, which is the moment the data describes.

The same goes for the time zone and the locale of the machine. A cover calendar of 09:00 to 17:00 read in the zone of
the runner would count other hours on every runner, and a timestamp with no offset would name a different instant on
each of them.

## Decision

1. The tool reads no clock, no time zone of the machine and no locale. "Now" comes from `--as-of` and from nowhere
   else. A run with an open ticket and no `--as-of` stops with exit code `2` and asks for it; a run in which every
   ticket is resolved needs none.
2. Every time zone is named: the calendar names its zone in the configuration, as a fixed offset or as a name of the
   time zone database, and every timestamp carries Z or an offset, or takes `defaultOffset` from the configuration.
   A timestamp with neither is an input problem of its ticket.
3. Dates are worked out by hand with day numbers, not with the Date object of JavaScript, so no part of the code can
   reach the clock by accident. A test fails if `src` calls the clock, reads the zone of the machine or builds a date
   from it.
4. No prose file of this repository holds a date or a number that reads like a year: not the licence, not the
   changelog, not the documents, not the comments of the code. `npm run check` and a test fail on any number that
   reads like a year. The made-up timestamps the examples need are the subject of
   [decision 2](0002-made-up-timestamps-in-a-year-no-one-can-mistake.md).

## Consequences

- The same export, configuration and `--as-of` give the same output on every machine and on every day, so the output
  of a run can be saved in the repository (`examples/output`) and compared on every change.
- A pipeline that checks the export of the day passes the time of the export, or of the run, as `--as-of`; the tool
  does not guess it. docs/secure-defaults.md shows how.
- A named zone is read through the time zone database that comes with Node. Two versions of Node with different
  versions of that database can give different offsets for a zone whose rules changed; a fixed offset never moves
  (docs/limits.md).
