// The public pages the checks rest on, and what each says, written in this project's own words. research/sources.md
// lists the same pages with a longer note on each, and test/data.test.js checks that every page here is listed there and
// that every rule names points that exist. The code in src/ uses these constants and never writes a reason of its own
// in a report.

export const SOURCES = [
  { id: 'sreSlo', title: 'Service Level Objectives (Site Reliability Engineering, Google)', url: 'https://sre.google/sre-book/service-level-objectives/' },
  { id: 'jsmGoals', title: 'Set up SLA goals (Jira Service Management Cloud, Atlassian Support)', url: 'https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-goals/' },
  { id: 'jsmCalendars', title: 'Set up SLA calendars (Jira Service Management Cloud, Atlassian Support)', url: 'https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-calendars/' },
  { id: 'jsmConditions', title: 'Set up SLA conditions (Jira Service Management Cloud, Atlassian Support)', url: 'https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-conditions/' },
  { id: 'rfc3339', title: 'RFC 3339, Date and Time on the Internet: Timestamps', url: 'https://www.rfc-editor.org/rfc/rfc3339' },
  { id: 'rfc4180', title: 'RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files', url: 'https://www.rfc-editor.org/rfc/rfc4180' },
  { id: 'rfc8259', title: 'RFC 8259, The JSON Data Interchange Format', url: 'https://www.rfc-editor.org/rfc/rfc8259' },
  { id: 'githubCommands', title: 'Workflow commands for GitHub Actions (GitHub Docs)', url: 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands' },
  { id: 'mdnDateTimeFormat', title: 'Intl.DateTimeFormat() constructor (MDN Web Docs)', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat/DateTimeFormat' },
  { id: 'ianaTz', title: 'Time Zone Database (IANA)', url: 'https://www.iana.org/time-zones' }
];

export const source = (id) => SOURCES.find((s) => s.id === id);

// What a page says, in this project's own words. Each point names its page.
export const POINTS = {
  slaConsequence: { source: 'sreSlo', text: 'an SLO is a target value for a measured level of service, and an SLA is an agreement with users that says what happens when the objectives in it are missed' },
  percentiles: { source: 'sreSlo', text: 'a percentile shows the shape of a distribution where an average hides a slow tail, so a report gives the median and a high percentile rather than the mean' },
  goalsByPriority: { source: 'jsmGoals', text: 'an SLA holds a time target for each goal, the goals can be grouped by priority, and a calendar sets the working hours in which time counts against the target' },
  calendarHours: { source: 'jsmCalendars', text: 'an SLA calendar has a time zone, working days, one or more time slots per day such as a morning and an afternoon around lunch, and holidays, and only that time is counted' },
  pauseConditions: { source: 'jsmConditions', text: 'an SLA starts, pauses and stops counting on conditions of its own, so the time a request spends in a paused state is not counted' },
  timestampOffset: { source: 'rfc3339', text: 'a timestamp carries Z or an offset from UTC, because a local time with no offset is read wrongly in most of the world' },
  csvFormat: { source: 'rfc4180', text: 'each record is a line of fields separated by commas, every record has as many fields as the others, and a field that holds a comma, a quote or a line break is quoted with the quote doubled' },
  jsonRepeatedNames: { source: 'rfc8259', text: 'when an object repeats a name the behaviour of the software that reads it cannot be predicted, so the readers of this tool refuse a repeated name' },
  githubAnnotations: { source: 'githubCommands', text: 'a line of output such as ::error file=...,line=...::message becomes an annotation on that file and line in the run' },
  intlTimeZone: { source: 'mdnDateTimeFormat', text: 'Intl.DateTimeFormat takes an IANA time zone name or an offset as its timeZone, throws a RangeError for a zone it does not know, and uses the zone of the machine only when none is named' },
  tzChanges: { source: 'ianaTz', text: 'the time zone database holds the history of local time for places around the world and is updated when governments change offsets or daylight saving rules' }
};

// The page of a point.
export const pointPage = (key) => source(POINTS[key].source);

// The levels of a finding, from the lowest. A finding at the level error makes the run fail.
export const LEVELS = ['notice', 'warning', 'error'];

// The sentence every report ends with, before the result.
export const NOTICE = 'This report measures the timestamps of the ticket export it was given against the SLA of the configuration. It does not connect to a help desk, read the clock or see changes made after the export; the time of an open ticket is counted up to --as-of, inside the cover calendar (docs/limits.md).';
