# Method

This document says exactly what the tool reads, how it counts cover time, how each ticket is judged, and what each
rule looks at and cannot see. The names used here are the defaults; docs/inputs.md says how the configuration changes
them.

## What is read

The input is one or more paths and a configuration file. A file is read whatever its name. A folder is walked: its
files and subfolders in the order of their names (compared by code unit, so the order does not depend on the locale),
`.git` and `node_modules` left out, symbolic links skipped and counted in a note, and the files whose path relative to
the folder matches a pattern of `files` (`**/*.csv` and `**/*.json`) and none of `exclude` are read.

Each file is read as UTF-8, with or without a byte order mark, with LF, CR LF or CR line ends. A file that is binary,
UTF-16 or not valid UTF-8, a path that is a symbolic link, a device or a pipe, a folder with no file that matches, and
a file over 32 MB stop the run with exit code `2`, so a run never passes because something could not be read.

## The export

A file whose name ends in `.csv` is read as CSV, one whose name ends in `.json` as JSON; any other file by its first
character that is not a space (`[` or `{` for JSON).

- **CSV**, as RFC 4180 writes it: the first record is the header, records end at a line break, fields are separated by
  commas, and a field that holds a comma, a quote or a line break is enclosed in double quotes with each quote inside
  written twice. A line with nothing on it is passed over. A quote inside a field that does not start with one, text
  after a closing quote and a quoted field that is not closed stop the run with their line and column. Every record
  must have as many fields as the header.
- **JSON**, as RFC 8259 writes it, read strictly: a list of ticket objects, or an object whose `tickets` key holds that
  list. A name given twice in one object stops the run. Keys the tool does not use are left alone.

Columns and keys are found by the names in `fields`, compared without regard to case for a CSV header. The id, the
priority, the creation time, the first response and the resolution must be there: a CSV header without one of them, or
a JSON export in which no ticket has one of them, stops the run, so a misspelt column cannot leave every ticket without
a first response. Spaces around a value are dropped, and an empty value is no value.

- **Paused intervals** (`paused`): in a CSV cell, intervals separated by semicolons, each two timestamps joined by a
  slash, the end left empty for a pause that has not ended; in JSON, the same text, or a list of such texts or of
  objects with `start` and `end`.
- **Status history** (`history`): in a CSV cell, entries separated by semicolons, each a timestamp, a space and a
  status; in JSON, the same text, or a list of such texts or of objects with `at` and `status`. A pause starts at an
  entry whose status is one of `pausedStatuses` (compared as whole lowercase words) and ends at the next entry whose
  status is not; the entries are taken in the order of their times, and a pause still running at the end has no end.

## Timestamps

A timestamp is read as RFC 3339 writes it: the date `YYYY-MM-DD`, `T` (or a space, which RFC 3339 allows for
readability), the time `HH:MM:SS` with an optional fraction, and `Z` or an offset `+HH:MM` or `-HH:MM`. Seconds may be
left out. A fraction is kept to the millisecond. A leap second, `:60`, is read as the last second of its minute.
`-00:00` is read as UTC. A timestamp with no offset is an input problem of its ticket unless `defaultOffset` is set,
because a local time with no offset names a different instant in each zone. `--as-of` must carry Z or an offset
itself; `defaultOffset` does not apply to it.

Dates are worked out by hand with day numbers in the proleptic Gregorian calendar; the tool never builds a Date object
and never reads the clock.

## Cover time

Every duration the tool compares or shows is cover time: the part of an interval that falls inside the cover of the
priority.

- **24x7 cover** counts every millisecond.
- **Business cover** counts the working hours of the working days in the time zone of the calendar, without the
  holidays. The hours are one or more spans `HH:MM-HH:MM` that are the same on every working day; a span may end at
  `24:00`. Holidays are local dates of the calendar.

The time zone is a fixed offset or a name of the time zone database, read through `Intl.DateTimeFormat` with that zone
named, never the zone of the machine. The business calendar is built once per run over the local days that the
timestamps of the judged tickets and `--as-of` reach, with a day on each side: the instant each local day starts, its
windows of cover turned into instants, and the cover time before each day. The cover time from one instant to another
is the difference of two lookups; an instant is placed in its day by a binary search over the starts of the days, so a
clock change at midnight places it right. A local time that a clock change skips or repeats is placed one way or the
other (docs/limits.md). More than 36,600 local days stop the run.

Paused time is taken out of the clocks named in `pausedClocks`, the resolution clock by default. Pauses that overlap are
merged, a pause that has not ended runs to the resolution or, for an open ticket, to `--as-of`, and only the cover time
inside a pause is taken out.

## Judging a ticket

Every ticket is first read for input problems: an id, a known priority, a creation time, every timestamp readable, the
times in an order that can be, and an id not read before. A ticket with any of these problems is reported by the rule
of the problem and is not judged, so it counts in no target and no percentile; the summary counts it as not judged.

Every other ticket has two clocks, both starting at its creation:

- **first response** stops at the first response, or, for a ticket resolved with no first response, at the resolution;
- **resolution** stops at the resolution.

A clock that has stopped is met when its cover time, without the paused time of that clock, is at most the target of
the priority, and missed when it is longer. A clock still running is counted up to `--as-of`: it is overdue when its
cover time is longer than the target, at risk when it has used `warnAt` percent of the target or more, and open
otherwise. An overdue clock counts as missed in the summary, because it can no longer meet its target. Open tickets
need `--as-of`; with open tickets and no `--as-of` the run stops with exit code `2`.

## The summary

For each priority of the configuration, in their order, and for each clock: the tickets judged, the clocks met and
missed (overdue ones included), the clocks still open and the ones of them at risk, the share met (met divided by met
and missed, or `-` when there is none), and the median and the 90th percentile of the clocks that have stopped. A
percentile is taken by the nearest rank method: the smallest value with at least that share of the list at or below
it, so the value is always one of the measured times.

## Rules

### `first-response-missed`

A ticket whose first response clock stopped after more cover time than the `firstResponse` target of its priority.
The finding gives the cover time, the time past the target and the target. A ticket resolved with no first response is
measured to its resolution, and the finding says so. It cannot see a reply sent through a channel the export leaves
out.

### `resolution-missed`

A resolved ticket whose resolution clock stopped after more cover time than the `resolution` target of its priority.
The finding gives the paused cover time it did not count. A ticket that was reopened is measured to the resolution in
the export; the tool does not see the earlier ones.

### `first-response-overdue`

An open ticket with no first response whose cover time up to `--as-of` is longer than its `firstResponse` target. A
resolved ticket is never overdue.

### `resolution-overdue`

An open ticket whose cover time up to `--as-of`, without paused time, is longer than its `resolution` target.

### `first-response-at-risk`

An open ticket with no first response that has used `warnAt` percent (80 by default) or more of its `firstResponse`
target by `--as-of`, but not more than all of it. The finding gives the share used and the cover time left.

### `resolution-at-risk`

An open ticket that has used `warnAt` percent or more of its `resolution` target by `--as-of`, but not more than all of
it.

### `invalid-timestamp`

A ticket with no creation time, or with a creation, first response, resolution, pause or status time that is not an
RFC 3339 timestamp with Z or an offset (or with `defaultOffset` set), names a date or a time that does not exist, or a
pause or status entry that is not written in its form. The ticket is not judged.

### `timestamps-out-of-order`

A ticket with a first response, a resolution, a pause or a status time before its creation, a pause that ends before
it starts, or any time after `--as-of`, which means the export is newer than the moment the report is made for. Equal
times are fine. The ticket is not judged.

### `unknown-priority`

A ticket with no priority, or with one that is neither a priority of the configuration nor one of its aliases. Names
are compared as whole lowercase words, so `P1 - Urgent` and `p1 urgent` are one priority. The ticket is not judged.

### `duplicate-ticket`

A ticket with no id, or with an id that a ticket read before it already has, in the same file or in an earlier one.
The first copy is judged and every later copy is reported and left out, so a ticket never counts twice in the summary.

## Order and output

Findings are sorted by level (errors first), then by the order of the files, the line and the rule. Each rule lists at
most 500 findings; the rest are counted in a note and still count for the result. Text from the input is cleaned of
control and direction characters and its length is capped before it is shown.
