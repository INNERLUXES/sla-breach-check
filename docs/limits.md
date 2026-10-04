# Limits

The tool reads a ticket export and an SLA and counts what the timestamps say. It does not connect to a help desk, it
does not read the clock, and it sees nothing that is not in the export. A run with no finding means the tickets of the
export met their targets as the export describes them, counted in the calendar of the configuration; it does not mean
the agreement with the customer was kept. Every report ends with a sentence that says so.

## What it cannot see

- **What the export leaves out.** A reply sent by phone and never logged, a ticket merged into another, a resolution
  that was reopened and resolved again, a priority changed during the life of a ticket: the tool sees the fields of the
  export as they are at the moment of the export. A ticket whose priority changed is judged on the priority the export
  gives it, for its whole life.
- **Changes after the export.** The time of an open ticket is counted up to `--as-of`. A ticket answered after the
  export was taken, but before `--as-of`, is still counted as unanswered. Give the time of the export as `--as-of`.
- **The help desk's own rules.** Help desks differ in what starts, pauses and stops a clock: some stop the first
  response clock on an automatic reply, some count an internal note, some pause on more statuses. The tool counts from
  creation to the timestamps it is given; export the timestamps your agreement means.
- **Calendars that differ by day or by priority.** The calendar has one set of hours for every working day, one time
  zone and one list of holidays. A team with shorter Fridays, or with a calendar per priority or per customer, runs the
  tool once per calendar, with the tickets of that calendar.
- **Holidays of part of a day.** A holiday is a whole local date. A half day off is not read.
- **Clock changes.** A named zone follows the time zone database that comes with Node, and counts a short or long day
  as it is. A working hour that a clock change skips or repeats is placed one way or the other, which can move a
  window of cover by an hour on that day. A fixed offset has no clock change.
- **The future of a zone.** The time zone database changes when governments change offsets or daylight saving rules,
  and two versions of Node can carry two versions of it. A named zone can give a different result after an update for
  dates the change touches. Use a fixed offset where the output must never move.
- **Timestamps with no offset.** They are refused unless `defaultOffset` is set; the tool never guesses the zone of an
  export.
- **Business days as a unit.** A target is in hours and minutes of cover time. A target written in business days is
  converted by the team, as hours of the calendar.
- **Whether the targets are right.** The tool compares the export with the configuration. Whether the configuration is
  the agreement the customer signed is for the people who wrote both.

## Size limits

Past a limit, the input is refused with exit code `2` and no result, or, where the limit is on the work and not the
input, the report says so in a note.

| What | Limit |
| --- | --- |
| a ticket file | 32 MB |
| all the files of a run | 128 MB |
| tickets in a run | 500,000 |
| files read in a run | 5,000 |
| files and folders looked at in a walk | 100,000 |
| folders nested in a walk | 32 deep |
| paths on the command line | 100 |
| CSV | 1,000 fields in a record, 65,536 characters in a field, 500,001 records in a file |
| JSON export | nesting 32 deep, 20,000,000 values, 65,536 characters in a string |
| paused intervals or status entries of one ticket | 1,000 each |
| local calendar days the timestamps of a run reach | 36,600 |
| configuration file | 1 MB; 100 priorities; 500 entries in a list; 120 characters for an entry; 200 for a file pattern |
| findings of one rule | 500 listed; the rest are counted in a note and still count for the result |
| problems of the input | 20 listed; the rest are counted |

The tests judge a hundred thousand tickets, build a calendar of a named zone over a century of days, read runs of a
million quotes and line breaks, a JSON export nested a hundred thousand deep and a hundred broken files, each with a
time check.
