# 3. Count time only inside the cover calendar

## Status

Accepted

## Context

A target such as "first response within 4 hours" means 4 hours of the time the team covers, not 4 hours of the clock.
A ticket raised on Friday evening under a business calendar is not late on Saturday morning. Help desks keep a
calendar for this: a time zone, working days, one or more time slots per day (a morning and an afternoon around
lunch), and holidays. Some priorities run around the clock instead. Time in which a ticket waits on the customer is
not counted either, on the clocks the agreement names.

Counting this by walking the minutes from creation to resolution is simple but slow for a ticket open for months, and
it repeats the same work for every ticket. Counting it with the calendar days of the export as one table makes each
ticket a few lookups.

A day of cover time is a different length under each calendar, so a target in days would mean something else under
each of them.

## Decision

1. Each priority has two targets, first response and resolution, in hours and minutes of cover time, and a cover:
   `business` (the calendar of the configuration) or `24x7` (every hour of every day). There is no target in days.
2. The calendar is built once per run over the local days the timestamps reach: for each day, the instant it starts
   in the zone of the calendar, its windows of cover as instants, and the cover time before it. The cover time between
   two instants is the difference of two lookups.
3. Paused time is taken out of the clocks that `pausedClocks` names, the resolution clock by default, and only the part
   of a pause inside the cover counts. Pauses come from intervals in the export or from a status history and its
   paused statuses; overlapping pauses count once.
4. A time equal to the target meets it. A clock that has stopped is met or missed; a clock still running is counted up
   to `--as-of` and is overdue, at risk or open.
5. A run whose timestamps reach over more than 36,600 local days is refused, because a timestamp with a wrong year
   would otherwise make the table large.

## Consequences

- The result follows the calendar of the agreement, and the README and the reports say "of cover time" every time a
  duration is shown.
- A run judges a hundred thousand tickets in a second or two, and a ticket open for decades costs no more than one
  open for an hour.
- The calendar has one set of hours for every working day. A team whose hours differ from day to day, or whose
  calendar differs by priority, runs the tool once per calendar (docs/limits.md).
