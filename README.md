# sla-breach-check

Reads a support ticket export, in CSV or JSON, and the SLA of a team: the first response and resolution targets of each priority and the cover calendar they are counted in (a time zone, working days, working hours and holidays, or cover around the clock). It counts the time of every ticket inside the cover hours, without the time it was paused, and reports the tickets that missed a target, the open tickets already past a target or close to one at a moment you name, and the tickets it cannot judge because their timestamps or priority are missing or wrong. For each priority it gives the tickets met and missed, the share met, and the median and 90th percentile of the time to first response and to resolution. Each finding has the file and the line, and the tool exits with a code a pipeline can act on.

A service level agreement is a promise with consequences: the Google SRE book describes it as a contract with users that says what happens when the objectives in it are missed, and argues for percentiles over averages, because an average hides the slow tail (https://sre.google/sre-book/service-level-objectives/). Help desks count the time of such a promise in a calendar of working hours, per priority, and stop the clock while a ticket waits on the customer (https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-calendars/, https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-conditions/). A dashboard shows this for today; this tool checks an export the same way on every run, so a monthly report, a customer review or a pipeline gets an answer that can be saved, compared and explained line by line.

- **Missed targets.** A first response or a resolution that took more cover time than the target of its priority is an error. A time equal to the target meets it.
- **Open tickets as of a moment.** An open ticket past its target as of `--as-of` is an error; one that has used 80% of its target or more is a warning. The tool never reads the clock: "now" is `--as-of`.
- **Cover time.** Business cover counts the working hours of the working days in the time zone of the calendar, with a lunch break if you give two spans, and leaves the holidays out; 24x7 cover counts every hour. Paused time, from intervals or a status history, is taken out of the resolution clock.
- **Input problems.** A ticket with a missing or unreadable timestamp, a timestamp with no offset, a first response or resolution before its creation, a priority the SLA does not name, no id or an id read before is an error and is not judged.
- **A summary per priority.** Tickets, met, missed, open, at risk, the share met, the median and the 90th percentile, in cover time.
- **Everything explained.** `--explain` shows the rule and the public sources behind each finding, and where a rule is the tool's own choice.
- Reports as text, JSON and GitHub workflow annotations, with an exit code for a pipeline: `0` no error, `1` an error, `2` usage or input error.
- Plain JavaScript, no dependencies.

```
npm test
```

```
tests 147
pass 144
fail 0
skipped 3
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a symbolic link, a device or file permissions (a file named through a symbolic link and links inside a folder, `/dev/zero` named as an input, and a file and a folder with no read access); they are guarded with `process.platform`, run on Linux and macOS, and none of them asserts a line. `npm run test:coverage` runs the same tests with coverage; their time limits are four times wider when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/sla-breach-check.git
cd sla-breach-check
node bin/sla-breach-check.js examples/breaching --config examples/sla.json --as-of 3001-03-10T15:00:00+01:00
```

Or without a clone, on your own export:

```
npx --yes github:INNERLUXES/sla-breach-check exports/tickets.csv --config sla.json --as-of <the time of the export>
```

`examples/` holds two made-up exports of a made-up help desk and its SLA. `examples/clean` meets every target. `examples/breaching` holds one problem of most kinds, in a CSV file and a JSON file. `examples/sla.json` gives urgent tickets 30 minutes to a first response and 4 hours to a resolution around the clock, and the other priorities their targets in working hours from 09:00 to 12:30 and 13:30 to 17:30 at +01:00, Monday to Friday, with one holiday. The dates of the examples are made up, in the year 3001, so that no one takes them for real ones ([decision 2](docs/decisions/0002-made-up-timestamps-in-a-year-no-one-can-mistake.md)).

## Usage

```
sla-breach-check <ticket-file-or-folder>... --config <sla.json> [--as-of <timestamp>] [options]
```

```
--config <file>           the SLA and the settings, in strict JSON: priorities with their targets and cover,
                          timezone, workingDays, workingHours, holidays, the field names of the export, the paused
                          statuses, warnAt and the level of the rules (--print-defaults shows a sample)
--as-of <timestamp>       the moment open tickets are measured up to, with Z or an offset; needed when a ticket
                          is open
--format <name>           text, json or github (default: text); github writes workflow commands that GitHub shows
                          as annotations on the ticket files
--json                    the same as --format json
--min-severity <level>    the lowest level of a finding that is shown: notice, warning, error (default: minSeverity of
                          the configuration, else notice)
--explain                 show the rule and the public sources behind each finding
--print-defaults          print the built-in configuration with sample priorities and exit
--help                    show the usage
--version                 show the version
```

A file named on the command line is read whatever its name. A folder is walked, and the files whose path matches `**/*.csv` or `**/*.json` are read, in the order of their paths; `.git` and `node_modules` are not entered, and a symbolic link is skipped, not followed. The path in the report is relative to the folder you run the command in, with forward slashes on every system, followed by the line on which the ticket starts.

The report of the breaching example starts with what was read, the SLA, the calendar, the moment and the counts, then the findings, errors first, then a table per clock and priority, then what was read:

```
sla-breach-check: examples/breaching
input: examples/breaching (2 files, 15 tickets: 11 resolved, 4 open)
sla: examples/sla.json (Juniper Desk support SLA): first response / resolution: urgent 30m / 4h (24x7); high 1h / 8h; normal 4h / 24h; low 8h / 40h
cover: mon, tue, wed, thu and fri, 09:00-12:30 and 13:30-17:30, at +01:00; 1 holiday (3001-03-05); paused statuses pending and waiting on customer; pauses stop the resolution clock; at risk from 80% of a target
as of: 3001-03-10T15:00:00+01:00
rules: first-response-missed (error); resolution-missed (error); first-response-overdue (error); resolution-overdue (error); first-response-at-risk (warning); resolution-at-risk (warning); invalid-timestamp (error); timestamps-out-of-order (error); unknown-priority (error); duplicate-ticket (error)
findings: 12 (10 error, 2 warning)

Findings (12)

  ERROR    first-response-missed    examples/breaching/phone.json:15
           ticket JD-302 (high): the first response came after 1h 10m of cover time, 10m past the target of 1h

  ERROR    invalid-timestamp        examples/breaching/phone.json:23
           ticket JD-303: resolved "3001-02-30T10:00:00+01:00" names a date that does not exist

  ERROR    first-response-missed    examples/breaching/tickets.csv:2
           ticket JD-201 (urgent): the first response came after 55m of cover time, 25m past the target of 30m

  ERROR    resolution-missed        examples/breaching/tickets.csv:3
           ticket JD-202 (high): resolved after 10h 10m of cover time, 2h 10m past the target of 8h

  ERROR    resolution-overdue       examples/breaching/tickets.csv:5
           ticket JD-204 (low) is not resolved after 41h 30m of cover time up to --as-of, 1h 30m past the target of 40h

  ERROR    first-response-overdue   examples/breaching/tickets.csv:6
           ticket JD-205 (high) has no first response after 1h 15m of cover time up to --as-of, 15m past the target of 1h

  ERROR    unknown-priority         examples/breaching/tickets.csv:8
           ticket JD-207: priority "P5" is not a priority of the SLA, which names urgent, high, normal and low

  ERROR    invalid-timestamp        examples/breaching/tickets.csv:9
           ticket JD-208: created "3001-03-04 10:20" has no offset; write Z or an offset such as +01:00 after the time, or set defaultOffset in the configuration

  ERROR    timestamps-out-of-order  examples/breaching/tickets.csv:10
           ticket JD-209: first_response "3001-03-04T09:40:00+01:00" is before created "3001-03-04T10:00:00+01:00"

  ERROR    duplicate-ticket         examples/breaching/tickets.csv:11
           ticket JD-202 was read before, at examples/breaching/tickets.csv:3; this copy is not judged

  WARNING  resolution-at-risk       examples/breaching/tickets.csv:7
           ticket JD-206 (normal) is not resolved yet: 20h of the 24h target used up to --as-of (83%), 4h left

  WARNING  first-response-at-risk   examples/breaching/tickets.csv:12
           ticket JD-210 (high) has no first response yet: 55m of the 1h target used up to --as-of (91%), 5m left

First response, in cover time

  priority  target  tickets  met  missed  open  at risk  met share  median  p90
  urgent    30m     2        1    1       0     0        50%        20m     55m
  high      1h      4        1    2       1     1        33.3%      1h      1h 10m
  normal    4h      3        3    0       0     0        100%       1h      3h 45m
  low       8h      1        1    0       0     0        100%       1h      1h

Resolution, in cover time

  priority  target  tickets  met  missed  open  at risk  met share  median  p90
  urgent    4h      2        2    0       0     0        100%       2h 30m  3h 30m
  high      8h      4        1    1       2     0        50%        3h      10h 10m
  normal    24h     3        2    0       1     1        100%       9h 30m  16h
  low       40h     1        0    1       0     0        0%         -       -

Read: examples/breaching

  tickets  15: 11 resolved, 4 open; 5 not judged for an input problem
  files    examples/breaching/phone.json (json, 3 tickets) and examples/breaching/tickets.csv (csv, 12 tickets)
  paused   2 judged tickets with paused time

This report measures the timestamps of the ticket export it was given against the SLA of the configuration. It does not connect to a help desk, read the clock or see changes made after the export; the time of an open ticket is counted up to --as-of, inside the cover calendar (docs/limits.md).

RESULT: FAIL - 10 errors (and 2 warnings)
```

With `--explain`, each finding also shows the rule, the points of the public pages it rests on and, where there is one, the tool's own choice:

```
  ERROR    resolution-missed        examples/breaching/tickets.csv:3
           ticket JD-202 (high): resolved after 10h 10m of cover time, 2h 10m past the target of 8h
           rule: a resolved ticket whose cover time from creation to resolution, with paused time taken out when pausedClocks names resolution, is longer than the resolution target of its priority
           basis: an SLA holds a time target for each goal, the goals can be grouped by priority, and a calendar sets the working hours in which time counts against the target (Set up SLA goals (Jira Service Management Cloud, Atlassian Support), https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-goals/)
           basis: an SLA starts, pauses and stops counting on conditions of its own, so the time a request spends in a paused state is not counted (Set up SLA conditions (Jira Service Management Cloud, Atlassian Support), https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-conditions/)
           basis: an SLO is a target value for a measured level of service, and an SLA is an agreement with users that says what happens when the objectives in it are missed (Service Level Objectives (Site Reliability Engineering, Google), https://sre.google/sre-book/service-level-objectives/)
           the tool's own choice: a time equal to the target meets it; paused time comes out of the resolution clock by default and out of the first response clock only when pausedClocks names it
```

The clean example passes:

```
sla-breach-check: examples/clean
input: examples/clean (1 file, 8 tickets: 6 resolved, 2 open)
sla: examples/sla.json (Juniper Desk support SLA): first response / resolution: urgent 30m / 4h (24x7); high 1h / 8h; normal 4h / 24h; low 8h / 40h
cover: mon, tue, wed, thu and fri, 09:00-12:30 and 13:30-17:30, at +01:00; 1 holiday (3001-03-05); paused statuses pending and waiting on customer; pauses stop the resolution clock; at risk from 80% of a target
as of: 3001-03-10T15:00:00+01:00
rules: first-response-missed (error); resolution-missed (error); first-response-overdue (error); resolution-overdue (error); first-response-at-risk (warning); resolution-at-risk (warning); invalid-timestamp (error); timestamps-out-of-order (error); unknown-priority (error); duplicate-ticket (error)
findings: 0

Findings (0)

  none

First response, in cover time

  priority  target  tickets  met  missed  open  at risk  met share  median  p90
  urgent    30m     2        2    0       0     0        100%       15m     25m
  high      1h      2        2    0       0     0        100%       25m     1h
  normal    4h      3        3    0       0     0        100%       2h      3h 45m
  low       8h      1        1    0       0     0        100%       3h      3h

Resolution, in cover time

  priority  target  tickets  met  missed  open  at risk  met share  median  p90
  urgent    4h      2        2    0       0     0        100%       2h 45m  3h 10m
  high      8h      2        1    0       1     0        100%       5h 40m  5h 40m
  normal    24h     3        2    0       1     0        100%       8h 30m  9h 30m
  low       40h     1        1    0       0     0        100%       17h     17h

Read: examples/clean

  tickets  8: 6 resolved, 2 open; 0 not judged for an input problem
  files    examples/clean/tickets.csv (csv, 8 tickets)
  paused   1 judged ticket with paused time

This report measures the timestamps of the ticket export it was given against the SLA of the configuration. It does not connect to a help desk, read the clock or see changes made after the export; the time of an open ticket is counted up to --as-of, inside the cover calendar (docs/limits.md).

RESULT: PASS - no error
```

## What it checks

| Rule | Key | Default level | Finds |
| --- | --- | --- | --- |
| `first-response-missed` | `rules.firstResponseMissed` | error | a ticket whose first response took more cover time than its target; a ticket resolved with no first response is measured to its resolution |
| `resolution-missed` | `rules.resolutionMissed` | error | a resolved ticket whose resolution took more cover time, without paused time, than its target |
| `first-response-overdue` | `rules.firstResponseOverdue` | error | an open ticket with no first response, past its target as of `--as-of` |
| `resolution-overdue` | `rules.resolutionOverdue` | error | an open ticket past its resolution target as of `--as-of` |
| `first-response-at-risk` | `rules.firstResponseAtRisk` | warning | an open ticket with no first response that has used `warnAt` (80%) or more of its target |
| `resolution-at-risk` | `rules.resolutionAtRisk` | warning | an open ticket that has used `warnAt` or more of its resolution target |
| `invalid-timestamp` | `rules.invalidTimestamp` | error | a ticket with no creation time, or a timestamp that is not RFC 3339 with Z or an offset, or names a date that does not exist |
| `timestamps-out-of-order` | `rules.timestampsOutOfOrder` | error | a first response, resolution or pause before the creation, a pause that ends before it starts, a time after `--as-of` |
| `unknown-priority` | `rules.unknownPriority` | error | a ticket with no priority, or one that is neither a priority of the SLA nor an alias |
| `duplicate-ticket` | `rules.duplicateTicket` | error | a ticket with no id, or an id read before; only the first copy is judged |

A ticket with an input problem is reported and not judged, so it counts in no target and no percentile. [docs/method.md](docs/method.md) says exactly what each rule looks at and what it cannot see, and [docs/rules-and-sources.md](docs/rules-and-sources.md) gives the points of the public pages each rule rests on.

## Cover time

Every duration is cover time. Under business cover, the calendar counts the spans of `workingHours` on the days of `workingDays` in the zone of `timezone`, and leaves out the dates of `holidays`; a priority with `"cover": "24x7"` counts every hour of every day. With the example calendar, a high ticket created on Monday at 16:50 and answered on Tuesday at 09:20 took 1 hour (40 minutes on Monday, 20 on Tuesday), which meets its target exactly; one created on Tuesday at 12:00 and answered at 14:10 took 1 hour 10 minutes, because the lunch break does not count.

Two clocks start at the creation of each ticket. The first response clock stops at the first response, or at the resolution of a ticket closed with no reply; the resolution clock stops at the resolution. A clock that has stopped is met or missed. A clock still running is counted up to `--as-of` and is overdue, at risk or open. Paused time is taken out of the resolution clock by default (`pausedClocks`): from intervals in the `paused` column, or from a `history` of statuses, where a pause runs from an entry with a paused status (`pending`, `on hold`, `waiting on customer`) to the next entry with another status.

The tool reads no clock and no time zone of the machine ([decision 1](docs/decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)): a run with open tickets and no `--as-of` stops with exit code `2`, and a timestamp with no offset is an input problem unless `defaultOffset` is set. The calendar is built once per run over the days the export reaches ([decision 3](docs/decisions/0003-count-time-only-inside-the-cover-calendar.md)).

## The configuration file

```json
{
  "name": "Juniper Desk support SLA",
  "priorities": {
    "urgent": { "firstResponse": "30m", "resolution": "4h", "cover": "24x7", "aliases": ["P1"] },
    "high": { "firstResponse": "1h", "resolution": "8h", "aliases": ["P2"] },
    "normal": { "firstResponse": "4h", "resolution": "24h", "aliases": ["P3"] },
    "low": { "firstResponse": "8h", "resolution": "40h", "aliases": ["P4"] }
  },
  "timezone": "+01:00",
  "workingDays": ["mon", "tue", "wed", "thu", "fri"],
  "workingHours": ["09:00-12:30", "13:30-17:30"],
  "holidays": ["3001-03-05"],
  "pausedStatuses": ["pending", "waiting on customer"]
}
```

`priorities` is required: each priority has a `firstResponse` and a `resolution` target in hours and minutes of cover time (`30m`, `4h`, `1h30m`), a `cover` of `business` (the default) or `24x7`, and `aliases` for the other names the export uses; names are compared as whole lowercase words. `timezone` is a fixed offset such as `+01:00` or `Z` (the default), or a name of the time zone database such as `Europe/Berlin`, read through `Intl.DateTimeFormat`. The configuration also names the columns of the export (`fields`), the paused statuses and clocks, the share of a target from which a ticket is at risk (`warnAt`, 80), the offset of timestamps written without one (`defaultOffset`), the file patterns of a folder (`files`, `exclude`), the level of every rule and the minimum severity. A list is a JSON array that replaces the built-in list, or an object with `replace`, `add` and `remove`. A key the tool does not know is an error with its line and a suggestion, and a key named twice is refused. [docs/inputs.md](docs/inputs.md) describes every key, and `--print-defaults` writes the whole default configuration out with sample priorities.

## The ticket export

A CSV export has a header row, and the tool finds its columns by name (`id`, `priority`, `created`, `first_response`, `resolved`, and optionally `paused` and `history`); other columns are left alone. A JSON export is a list of ticket objects or an object with a `tickets` list. Timestamps are RFC 3339: `3001-03-02T09:30:00+01:00`, or with `Z`; a space may stand for the `T` and the seconds may be left out. A CSV file with a stray quote, a record with the wrong number of fields, or a header without a needed column stops the run with its line, so a broken export never passes.

## Formats

- `text`: for a terminal: what was read, the SLA, the calendar, the moment, the counts, the findings with the file and line, a table per clock with a row per priority, the files read, the notes, the notice and the result. With `--explain` also the rule, the points of the public pages and the tool's own choice behind each finding.
- `json` (or `--json`): the whole report: the input, `--as-of`, the configuration, the summary per priority with its durations in seconds, every finding with its file, line, ticket, priority and the cover time used, the target and the paused time in seconds, the totals, the result, the notes and the notice.
- `github`: one workflow command per finding, `::error`, `::warning` or `::notice` with the file and line, which GitHub shows as an annotation on the export in the pull request, then a summary line. The characters a command gives a meaning to are escaped. The first two findings of the CSV file of the breaching example:

```
::error file=examples/breaching/tickets.csv,line=2,title=sla-breach-check first-response-missed::ticket JD-201 (urgent): the first response came after 55m of cover time, 25m past the target of 30m
::error file=examples/breaching/tickets.csv,line=3,title=sla-breach-check resolution-missed::ticket JD-202 (high): resolved after 10h 10m of cover time, 2h 10m past the target of 8h
```

## Exit codes

`0`: no finding at the level error. `1`: at least one finding at the level error; a rule can be raised to error or lowered to warning or notice in the configuration. `2`: a usage or input error: no path, no `--config`, an unknown option, an option given twice, an `--as-of` that is not a timestamp with an offset, open tickets with no `--as-of`, a URL in place of a path, a file or folder that cannot be read, a symbolic link named on the command line, a folder with no file that matches, a file over its limit, a binary, UTF-16 or invalid UTF-8 file, a CSV file with a stray quote, a quoted field that is not closed or a record with the wrong number of fields, a header or a JSON export without a needed field, JSON that is not valid, timestamps that reach over more than 36,600 days, or a configuration with an unknown key, a key named twice or a value of the wrong kind. With exit code `2` the tool gives no result and prints the problems on standard error.

## Limits

The tool reads an export, not a help desk: it sees the timestamps the export holds at the moment it was taken, and nothing about replies that were never logged, priorities that changed during the life of a ticket or tickets that were reopened. It never reads the clock, so give the time of the export as `--as-of`. The calendar has one set of hours for every working day, whole-day holidays and one time zone; a team with a calendar per priority or per customer runs the tool once per calendar. A named zone follows the time zone database of Node and can move when that database changes; a fixed offset never moves. [docs/limits.md](docs/limits.md) lists what it cannot see, with the size limits: 32 MB for a file, 128 MB and 500,000 tickets for a run, 36,600 calendar days, 500 findings listed per rule. [docs/threat-model.md](docs/threat-model.md) lists the risks of reading exports that hold customer text and their controls, and [docs/secure-defaults.md](docs/secure-defaults.md) the defaults and how to run the tool in a pipeline.

## Architecture

Plain ES modules in `src/`, with no dependencies.

| File | Job |
| --- | --- |
| `src/cli.js` | the command line, the usage and the exit codes |
| `src/check.js` | reads the configuration and the files, runs the checks and builds the report of the run |
| `src/files.js`, `src/glob.js` | the bounded reading of files and folders with no link followed, and the file patterns |
| `src/csv.js`, `src/json.js`, `src/tickets.js` | the strict CSV and JSON readers, and the tickets of an export with their pauses and status history |
| `src/time.js`, `src/zone.js` | timestamps, dates and durations worked out with day numbers, and the time zone of the calendar |
| `src/calendar.js` | cover time: the business calendar of a run, 24x7 cover and paused time |
| `src/analyse.js` | the input problems of each ticket, the two clocks of each ticket and the summary per priority |
| `src/config.js`, `src/defaults.js` | the configuration file over the defaults |
| `src/rules.js` | the ten rules and the result |
| `src/report.js`, `src/text.js`, `src/size.js`, `src/words.js` | the text, JSON and GitHub output, the cleaning of text from the input, number formats, and words compared as words |
| `src/data.js` | the public pages and the points the checks rest on, in this project's own words |
| `tools/check.mjs`, `tools/example.mjs` | the repository checks, and the examples with their real output |

## Where the facts come from

| Fact | Source |
| --- | --- |
| An SLA names the consequences of missing its objectives; percentiles show what an average hides | Google SRE book, https://sre.google/sre-book/service-level-objectives/ |
| SLA goals hold a time target, are grouped by priority and count time in a calendar | Atlassian Support, https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-goals/ |
| A calendar has a time zone, working days, time slots per day and holidays | Atlassian Support, https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-calendars/ |
| An SLA starts, pauses and stops counting on conditions | Atlassian Support, https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-conditions/ |
| A timestamp carries Z or an offset; a local time without one is read wrongly | RFC 3339, https://www.rfc-editor.org/rfc/rfc3339 |
| Records, fields, quotes and line breaks of CSV | RFC 4180, https://www.rfc-editor.org/rfc/rfc4180 |
| Repeated names in a JSON object | RFC 8259, https://www.rfc-editor.org/rfc/rfc8259 |
| Annotations from workflow commands | GitHub Docs, https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands |
| A named time zone through Intl.DateTimeFormat | MDN Web Docs, https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat |
| The time zone database changes with the rules of governments | IANA, https://www.iana.org/time-zones |

[research/sources.md](research/sources.md) has a note on each page, in this project's own words.

## Background

An SLA report usually comes from the help desk itself, as a number on a dashboard that is hard to check and changes by the minute. Checking the export against the written agreement, in the agreed calendar and at a named moment, gives a result that a support lead, a customer and an auditor can each recompute and trace to a ticket and a line. How support and maintenance are run around such agreements is described on the page [Software Maintenance and Support](https://innerluxes.dev/software-development/maintenance-and-support).

## License

MIT
