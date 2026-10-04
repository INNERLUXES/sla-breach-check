# Inputs

## The ticket export

```
sla-breach-check <ticket-file-or-folder>... --config <sla.json> [--as-of <timestamp>] [options]
```

One or more paths, up to 100: CSV or JSON exports, folders of them, or both. A file is read whatever its name; a folder
is walked and the files that match `files` and not `exclude` are read (docs/method.md). Each path may be named once.

A CSV export has a header row; the columns the tool needs are found by name, and every other column is left alone:

```
id,priority,channel,created,first_response,resolved,paused
JD-201,P1,email,3001-03-02T22:10:00+01:00,3001-03-02T23:05:00+01:00,3001-03-03T01:40:00+01:00,
JD-203,normal,portal,3001-03-04T15:00:00+01:00,3001-03-06T10:15:00+01:00,3001-03-09T16:00:00+01:00,3001-03-06T11:00:00+01:00/3001-03-09T10:00:00+01:00
JD-205,high,email,3001-03-10T13:45:00+01:00,,,
```

A JSON export is a list of tickets, or an object whose `tickets` key holds the list. A paused interval or a status
history may be written as text, as in a CSV cell, or as a list:

```json
{
  "tickets": [
    {
      "id": "JD-301",
      "priority": "normal",
      "created": "3001-03-02T09:30:00+01:00",
      "first_response": "3001-03-02T10:00:00+01:00",
      "resolved": "3001-03-06T17:00:00+01:00",
      "history": [
        { "at": "3001-03-02T11:00:00+01:00", "status": "waiting on customer" },
        { "at": "3001-03-04T09:00:00+01:00", "status": "open" }
      ]
    }
  ]
}
```

| Field | Default column or key | Value |
| --- | --- | --- |
| id | `id` | any text; a JSON number is read as text |
| priority | `priority` | a priority of the configuration or one of its aliases |
| created | `created` | a timestamp |
| first response | `first_response` | a timestamp, or empty while there is none |
| resolved | `resolved` | a timestamp, or empty while the ticket is open |
| paused | `paused` | intervals `start/end` separated by `;`, the end empty while the pause runs; optional |
| history | `history` | entries `timestamp status` separated by `;`; optional |

The dates in these samples are made up, in the year 3001, as every date of this repository is
([decision 2](decisions/0002-made-up-timestamps-in-a-year-no-one-can-mistake.md)).

## --as-of

The moment open tickets are measured up to, as an RFC 3339 timestamp with Z or an offset. The tool reads no clock
([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)): with an open ticket and no
`--as-of`, the run stops with exit code `2`. A time in the export after `--as-of` is `timestamps-out-of-order`.

## The configuration file

`--config <file>` names the configuration file, which holds the SLA and the settings of the tool: one JSON object, read
strictly as RFC 8259 writes JSON, with no comments and no trailing comma. A key named twice in one object is refused,
and so is every key the tool does not know, with its line and a suggestion. `priorities` is required; every other key
is optional and changes one default.

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

A list is either a JSON array, which replaces the built-in list, or an object with `replace`, `add` and `remove`,
applied in that order. Removing an entry that is not on the list, or adding one that is, is an error.

| Key | Value | Default |
| --- | --- | --- |
| `name` | a text of 1 to 120 characters, shown in the report | none |
| `priorities` | an object of priority names, each with its targets (below) | none: required |
| `timezone` | the time zone of the calendar: an offset such as `+01:00` or `Z`, or a name of the time zone database such as `Europe/Berlin` | `"Z"` |
| `workingDays` | a list of `mon`, `tue`, `wed`, `thu`, `fri`, `sat`, `sun` | `mon` to `fri` |
| `workingHours` | a list of spans `HH:MM-HH:MM` that do not overlap; a span may end at `24:00` | `["09:00-17:00"]` |
| `holidays` | a list of dates `YYYY-MM-DD` in the zone of the calendar | `[]` |
| `defaultOffset` | the offset given to a timestamp of the export written without one, or `null` | `null` |
| `fields` | an object of the columns or keys of the export (below) | see below |
| `pausedStatuses` | a list of statuses of a status history that stop the clock, compared as whole lowercase words | `pending`, `on hold`, `waiting on customer` |
| `pausedClocks` | a list of the clocks a pause stops: `firstResponse`, `resolution` | `["resolution"]` |
| `warnAt` | the share of a target, in percent above 0 and at most 100, from which an open ticket is at risk | `80` |
| `files` | a list of file patterns; a file in a folder named on the command line is read when its path matches one | `["**/*.csv", "**/*.json"]` |
| `exclude` | a list of file patterns; a file that matches one is not read | `[]` |
| `rules` | an object of rule keys, each `error`, `warning`, `notice` or `off` | see below |
| `minSeverity` | `notice`, `warning` or `error`; findings below it are not shown | `notice` |

### Priorities

Each key of `priorities` is the name of a priority, 1 to 60 characters. Names and aliases are compared as whole
lowercase words, so `P1 - Urgent` and `p1 urgent` are the same, and no two of them may be the same.

| Key | Value | Default |
| --- | --- | --- |
| `priorities.<name>.firstResponse` | the target of the time to first response, in cover time: `30m`, `4h` or `1h30m` | none: required |
| `priorities.<name>.resolution` | the target of the time to resolution, in cover time | none: required |
| `priorities.<name>.cover` | `business` for the calendar, or `24x7` for every hour of every day | `business` |
| `priorities.<name>.aliases` | a list of other names of the priority in the export | `[]` |

A target is in hours and minutes only, up to 100,000 hours; a day of cover time is a different length under each
calendar, so there is no unit of days. A calendar with no working day or no working hours is refused when a priority
has business cover.

### Fields

| Key | Field | Default |
| --- | --- | --- |
| `fields.id` | the id of the ticket | `id` |
| `fields.priority` | the priority | `priority` |
| `fields.created` | the creation time | `created` |
| `fields.firstResponse` | the time of the first response | `first_response` |
| `fields.resolved` | the time of the resolution | `resolved` |
| `fields.paused` | the paused intervals | `paused` |
| `fields.history` | the status history | `history` |

Two fields may not name the same column.

### Rules

| Key | Rule | Default |
| --- | --- | --- |
| `rules.firstResponseMissed` | `first-response-missed` | `error` |
| `rules.resolutionMissed` | `resolution-missed` | `error` |
| `rules.firstResponseOverdue` | `first-response-overdue` | `error` |
| `rules.resolutionOverdue` | `resolution-overdue` | `error` |
| `rules.firstResponseAtRisk` | `first-response-at-risk` | `warning` |
| `rules.resolutionAtRisk` | `resolution-at-risk` | `warning` |
| `rules.invalidTimestamp` | `invalid-timestamp` | `error` |
| `rules.timestampsOutOfOrder` | `timestamps-out-of-order` | `error` |
| `rules.unknownPriority` | `unknown-priority` | `error` |
| `rules.duplicateTicket` | `duplicate-ticket` | `error` |

A rule that is `off` is not reported, and a note lists it. A ticket with an input problem is still not judged when the
rule of that problem is off.

### File patterns

A pattern is a path relative to the folder named on the command line, with forward slashes on every system. `*`
matches any run of characters inside one name, `?` matches one character, and `**` as a whole part matches any number
of folders. A pattern with no slash matches the file name in any folder, so `*.csv` is the same as `**/*.csv`.
Character classes (`[...]`), braces, `!`, a backslash, `..`, `.`, an empty part and a leading slash are refused. A
pattern is matched by hand and never turned into a regular expression.

`--min-severity` on the command line wins over `minSeverity`. `--print-defaults` writes the built-in configuration with
a sample set of priorities; read back with `--config`, it gives the defaults with those priorities.
