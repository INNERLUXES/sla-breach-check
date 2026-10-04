# Sources

The public pages the checks of this tool are based on, each with a short note in this project's own words on what the
page says and which checks lean on it. Nothing here is a copy of a page: read the page itself for its exact wording.
src/data.js holds the same pages and the points the reports show, and test/data.test.js checks that every page there
is listed here. Each page was fetched and read before it was listed.

## Service Level Objectives (Site Reliability Engineering, Google)

https://sre.google/sre-book/service-level-objectives/

The chapter of the Google SRE book on service level indicators, objectives and agreements. An indicator is a measured
quantity of the service, an objective is a target value or range for an indicator, and an agreement is a contract
with users that names the consequences of missing the objectives in it, often a rebate or a penalty. The chapter
argues for percentiles over averages, because an average can look healthy while a part of the requests is many times
slower than the rest, and it warns against targets that are tighter or more numerous than the team can keep. The
missed and overdue rules are the consequence side of the agreement made visible for each ticket, and the summary of
each priority reports the median and the 90th percentile rather than the mean.

## Set up SLA goals (Jira Service Management Cloud, Atlassian Support)

https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-goals/

Atlassian's page on the goals of an SLA in Jira Service Management. Each goal has a time target for the work item,
a calendar that sets the working hours in which time is counted against the target, and a filter of the work items it
applies to; goals can be grouped by priority to give each priority its own targets. This is the shape of the
`priorities` key of the configuration: a priority with a first response target and a resolution target, each counted
in the cover of that priority (`first-response-missed`, `resolution-missed`, the overdue and at risk rules,
`unknown-priority`).

## Set up SLA calendars (Jira Service Management Cloud, Atlassian Support)

https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-calendars/

The page on SLA calendars. A calendar has a name and a time zone, working days, one or more time slots per day, for
instance one before and one after a lunch break, and a list of holidays; a new calendar starts with the hours from
nine to five. Goals are tracked against the times and days the agents work. The `timezone`, `workingDays`,
`workingHours` (a list of spans, so a lunch break is two spans) and `holidays` keys follow this shape, and every
duration of the reports is cover time counted in that calendar.

## Set up SLA conditions (Jira Service Management Cloud, Atlassian Support)

https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-conditions/

The page on the conditions of an SLA: the events on which its measurement starts, pauses and stops, set for each SLA
so the time is counted at the right moments. The tool starts both clocks at the creation of a ticket, stops them at
the first response and the resolution, and takes paused time out through the intervals or the status history of the
export, on the clocks that `pausedClocks` names (`resolution-missed`, `resolution-overdue`).

## RFC 3339, Date and Time on the Internet: Timestamps

https://www.rfc-editor.org/rfc/rfc3339

The profile of ISO 8601 for timestamps on the internet: a full date, the letter T and a full time with an optional
fraction, then Z or a numeric offset from UTC. It allows a space in place of the T for readability, writes a leap
second as second 60, and uses an offset of minus zero for a time in UTC whose local offset is unknown. It explains that
a local time with no stated relation to UTC is read wrongly in most of the world, which is why the tool refuses a
timestamp with no offset unless the configuration names one (`invalid-timestamp`).

## RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files

https://www.rfc-editor.org/rfc/rfc4180

The memo that writes down the common CSV format and registers its media type. Records are lines ended by a line break,
the last one optionally without it, there may be a header line, fields are separated by commas, every record should
have the same number of fields, spaces belong to the field, and a field that holds a line break, a quote or a comma is
enclosed in double quotes with each quote inside doubled. The CSV reader follows these rules and refuses the forms that
break them, so a stray quote cannot shift the fields of a ticket (docs/method.md, `duplicate-ticket` for the record of
one ticket).

## RFC 8259, The JSON Data Interchange Format

https://www.rfc-editor.org/rfc/rfc8259

The JSON standard. Its section on objects notes that when the names in an object are not unique, programs that read
it behave in different ways: some keep the last value, some fail, some keep every pair. The readers of the
configuration and of a JSON export refuse a repeated name instead of keeping one of the values, so a result never
depends on which value a library would keep (`duplicate-ticket` leans on the same idea for a ticket given twice).

## Workflow commands for GitHub Actions (GitHub Docs)

https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands

The page that describes the `::error`, `::warning` and `::notice` commands with their `file`, `line`, `col` and
`title` properties, which turn a line of output into an annotation on a file. `--format github` writes one such
command per finding, with the ticket file and the line on which the ticket starts.

## Intl.DateTimeFormat() constructor (MDN Web Docs)

https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat

The reference of the constructor the tool uses to read a named time zone without a dependency. Its `timeZone` option
takes a name of the IANA database such as `America/New_York`, `UTC` or an offset, throws a RangeError for a zone it
does not know, and falls back to the zone of the machine only when no zone is given; `hourCycle` set to `h23` gives
hours from 0 to 23. The tool always names the zone and the locale, so the zone of the machine is never read, and a zone
the runtime does not know is an error of the configuration (docs/method.md).

## Time Zone Database (IANA)

https://www.iana.org/time-zones

The home of the tz database, which holds the history of local time for places around the world as rules that let
software work out the offset from UTC at any instant. It is updated from time to time as governments change zone
boundaries, offsets and daylight saving rules. This is why a named zone can give a different result after an update
of Node, and why the examples use a fixed offset (docs/limits.md).
