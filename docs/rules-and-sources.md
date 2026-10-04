# Rules and sources

Every rule rests on points of public pages, written in this project's own words; this document lists them, with the
choices that are the tool's own. The same points are in src/data.js and are shown by `--explain`; research/sources.md
has a longer note on each page.

## Rules

### `first-response-missed`

- An SLA holds a time target for each goal, the goals can be grouped by priority, and a calendar sets the working hours in which time counts against the target. ([Set up SLA goals (Jira Service Management Cloud, Atlassian Support)](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-goals/))
- An SLA calendar has a time zone, working days, one or more time slots per day such as a morning and an afternoon around lunch, and holidays, and only that time is counted. ([Set up SLA calendars (Jira Service Management Cloud, Atlassian Support)](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-calendars/))
- An SLO is a target value for a measured level of service, and an SLA is an agreement with users that says what happens when the objectives in it are missed. ([Service Level Objectives (Site Reliability Engineering, Google)](https://sre.google/sre-book/service-level-objectives/))
- The tool's own choice: a time equal to the target meets it; a ticket resolved with no first response is measured up to its resolution, which is then its first response.

### `resolution-missed`

- An SLA holds a time target for each goal, the goals can be grouped by priority, and a calendar sets the working hours in which time counts against the target. ([Set up SLA goals (Jira Service Management Cloud, Atlassian Support)](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-goals/))
- An SLA starts, pauses and stops counting on conditions of its own, so the time a request spends in a paused state is not counted. ([Set up SLA conditions (Jira Service Management Cloud, Atlassian Support)](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-conditions/))
- An SLO is a target value for a measured level of service, and an SLA is an agreement with users that says what happens when the objectives in it are missed. ([Service Level Objectives (Site Reliability Engineering, Google)](https://sre.google/sre-book/service-level-objectives/))
- The tool's own choice: a time equal to the target meets it; paused time comes out of the resolution clock by default and out of the first response clock only when pausedClocks names it.

### `first-response-overdue`

- An SLA holds a time target for each goal, the goals can be grouped by priority, and a calendar sets the working hours in which time counts against the target. ([Set up SLA goals (Jira Service Management Cloud, Atlassian Support)](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-goals/))
- An SLA calendar has a time zone, working days, one or more time slots per day such as a morning and an afternoon around lunch, and holidays, and only that time is counted. ([Set up SLA calendars (Jira Service Management Cloud, Atlassian Support)](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-calendars/))
- The tool's own choice: the time of an open ticket is counted up to --as-of and never up to the clock of the machine; an overdue ticket counts as missed in the summary, because it can no longer meet its target.

### `resolution-overdue`

- An SLA holds a time target for each goal, the goals can be grouped by priority, and a calendar sets the working hours in which time counts against the target. ([Set up SLA goals (Jira Service Management Cloud, Atlassian Support)](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-goals/))
- An SLA calendar has a time zone, working days, one or more time slots per day such as a morning and an afternoon around lunch, and holidays, and only that time is counted. ([Set up SLA calendars (Jira Service Management Cloud, Atlassian Support)](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-calendars/))
- The tool's own choice: the time of an open ticket is counted up to --as-of and never up to the clock of the machine; an overdue ticket counts as missed in the summary, because it can no longer meet its target.

### `first-response-at-risk`

- An SLA holds a time target for each goal, the goals can be grouped by priority, and a calendar sets the working hours in which time counts against the target. ([Set up SLA goals (Jira Service Management Cloud, Atlassian Support)](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-goals/))
- An SLO is a target value for a measured level of service, and an SLA is an agreement with users that says what happens when the objectives in it are missed. ([Service Level Objectives (Site Reliability Engineering, Google)](https://sre.google/sre-book/service-level-objectives/))
- The tool's own choice: the share of the target that makes a ticket at risk, 80% by default, is the tool's own choice and is set with warnAt.

### `resolution-at-risk`

- An SLA holds a time target for each goal, the goals can be grouped by priority, and a calendar sets the working hours in which time counts against the target. ([Set up SLA goals (Jira Service Management Cloud, Atlassian Support)](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-goals/))
- An SLO is a target value for a measured level of service, and an SLA is an agreement with users that says what happens when the objectives in it are missed. ([Service Level Objectives (Site Reliability Engineering, Google)](https://sre.google/sre-book/service-level-objectives/))
- The tool's own choice: the share of the target that makes a ticket at risk, 80% by default, is the tool's own choice and is set with warnAt.

### `invalid-timestamp`

- A timestamp carries Z or an offset from UTC, because a local time with no offset is read wrongly in most of the world. ([RFC 3339, Date and Time on the Internet: Timestamps](https://www.rfc-editor.org/rfc/rfc3339))
- The tool's own choice: a timestamp with no offset is refused unless defaultOffset is set, seconds may be left out and a space may stand for the T; a ticket with a timestamp the tool cannot read is not judged against any target.

### `timestamps-out-of-order`

- A timestamp carries Z or an offset from UTC, because a local time with no offset is read wrongly in most of the world. ([RFC 3339, Date and Time on the Internet: Timestamps](https://www.rfc-editor.org/rfc/rfc3339))
- An SLA holds a time target for each goal, the goals can be grouped by priority, and a calendar sets the working hours in which time counts against the target. ([Set up SLA goals (Jira Service Management Cloud, Atlassian Support)](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-goals/))
- The tool's own choice: a ticket whose times cannot be in that order is not judged, rather than judged on times that are wrong; a time after --as-of means the export is newer than --as-of.

### `unknown-priority`

- An SLA holds a time target for each goal, the goals can be grouped by priority, and a calendar sets the working hours in which time counts against the target. ([Set up SLA goals (Jira Service Management Cloud, Atlassian Support)](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-goals/))
- The tool's own choice: priorities are compared as whole lowercase words, so "P1 - Urgent" and "p1 urgent" are one priority, and aliases name other spellings; a ticket with no target is not judged.

### `duplicate-ticket`

- Each record is a line of fields separated by commas, every record has as many fields as the others, and a field that holds a comma, a quote or a line break is quoted with the quote doubled. ([RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files](https://www.rfc-editor.org/rfc/rfc4180))
- When an object repeats a name the behaviour of the software that reads it cannot be predicted, so the readers of this tool refuse a repeated name. ([RFC 8259, The JSON Data Interchange Format](https://www.rfc-editor.org/rfc/rfc8259))
- The tool's own choice: the first copy of a ticket is judged and every later copy is reported and left out, so a ticket is never counted twice in the summary.

## The summary, the readers, the time zone and the output

- A percentile shows the shape of a distribution where an average hides a slow tail, so a report gives the median and a high percentile rather than the mean. ([Service Level Objectives (Site Reliability Engineering, Google)](https://sre.google/sre-book/service-level-objectives/))
- A line of output such as ::error file=...,line=...::message becomes an annotation on that file and line in the run. ([Workflow commands for GitHub Actions (GitHub Docs)](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands))
- Intl.DateTimeFormat takes an IANA time zone name or an offset as its timeZone, throws a RangeError for a zone it does not know, and uses the zone of the machine only when none is named. ([Intl.DateTimeFormat() constructor (MDN Web Docs)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat))
- The time zone database holds the history of local time for places around the world and is updated when governments change offsets or daylight saving rules. ([Time Zone Database (IANA)](https://www.iana.org/time-zones))

## Pages

| Page | Address |
| --- | --- |
| Service Level Objectives (Site Reliability Engineering, Google) | https://sre.google/sre-book/service-level-objectives/ |
| Set up SLA goals (Jira Service Management Cloud, Atlassian Support) | https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-goals/ |
| Set up SLA calendars (Jira Service Management Cloud, Atlassian Support) | https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-calendars/ |
| Set up SLA conditions (Jira Service Management Cloud, Atlassian Support) | https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-conditions/ |
| RFC 3339, Date and Time on the Internet: Timestamps | https://www.rfc-editor.org/rfc/rfc3339 |
| RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files | https://www.rfc-editor.org/rfc/rfc4180 |
| RFC 8259, The JSON Data Interchange Format | https://www.rfc-editor.org/rfc/rfc8259 |
| Workflow commands for GitHub Actions (GitHub Docs) | https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands |
| Intl.DateTimeFormat() constructor (MDN Web Docs) | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat |
| Time Zone Database (IANA) | https://www.iana.org/time-zones |

## What is the tool's own

The pages say what an SLA and an SLO are, why a report gives percentiles, how a help desk groups goals by priority, keeps a calendar of working hours and holidays and pauses its clocks, and how timestamps, CSV and JSON are written; they do not say how to judge an export against an agreement. Counting time with a table of the calendar days of a run, the targets in hours and minutes only, a time equal to the target meeting it, the resolution as the first response of a ticket closed with no reply, paused time taken out of the resolution clock by default, the share that makes a ticket at risk, the nearest rank method for percentiles, the input problems that keep a ticket from being judged, and the level of every rule are the tool's own choices. The levels, the share and the clocks a pause stops can be changed in the configuration (docs/inputs.md), and docs/method.md says exactly how each is used.
