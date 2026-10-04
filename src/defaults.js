// The built-in configuration: the cover calendar, the names of the fields of a ticket, the paused statuses, the share of
// a target that makes a ticket at risk, the files read in a folder and the level of every rule. The targets of the
// priorities have no default: they are the agreement itself, so a run needs a configuration that names them.
// docs/inputs.md describes every key, and --print-defaults writes all of this out with a sample set of priorities.

// The time zone of the cover calendar: an offset such as +01:00, Z, or a name such as Europe/Berlin.
export const DEFAULT_TIMEZONE = 'Z';

// The offset given to a timestamp written without one. None: such a timestamp is an input problem.
export const DEFAULT_OFFSET = null;

export const DEFAULT_WORKING_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
export const DEFAULT_WORKING_HOURS = ['09:00-17:00'];
export const DEFAULT_HOLIDAYS = [];

// The kinds of cover a priority can have: the calendar above, or every hour of every day.
export const COVER_KINDS = ['business', '24x7'];
export const DEFAULT_COVER = 'business';

// The fields of a ticket and the column (CSV) or key (JSON) each is read from.
export const DEFAULT_FIELDS = { id: 'id', priority: 'priority', created: 'created', firstResponse: 'first_response', resolved: 'resolved', paused: 'paused', history: 'history' };

// The fields every ticket file must have; paused and history may be left out.
export const REQUIRED_FIELDS = ['id', 'priority', 'created', 'firstResponse', 'resolved'];

// The statuses of a status history that stop the clock, compared as whole lowercase words.
export const DEFAULT_PAUSED_STATUSES = ['pending', 'on hold', 'waiting on customer'];

// The clocks a pause stops: the time to first response, the time to resolution, or both.
export const CLOCKS = ['firstResponse', 'resolution'];
export const DEFAULT_PAUSED_CLOCKS = ['resolution'];

// An open ticket that has used this share of a target (in percent) or more is at risk.
export const DEFAULT_WARN_AT = 80;

// The files read in a folder named on the command line, and the files left out.
export const DEFAULT_FILES = ['**/*.csv', '**/*.json'];
export const DEFAULT_EXCLUDE = [];

// Folders a walk never enters.
export const SKIPPED_FOLDERS = ['.git', 'node_modules'];

export const DEFAULT_RULES = {
  firstResponseMissed: 'error',
  resolutionMissed: 'error',
  firstResponseOverdue: 'error',
  resolutionOverdue: 'error',
  firstResponseAtRisk: 'warning',
  resolutionAtRisk: 'warning',
  invalidTimestamp: 'error',
  timestampsOutOfOrder: 'error',
  unknownPriority: 'error',
  duplicateTicket: 'error'
};

// The lowest level of a finding that is shown.
export const DEFAULT_MIN_SEVERITY = 'notice';

// A sample set of priorities for --print-defaults: a starting point to change, not a default.
export const SAMPLE_PRIORITIES = {
  urgent: { firstResponse: '1h', resolution: '8h', cover: '24x7' },
  high: { firstResponse: '2h', resolution: '16h' },
  normal: { firstResponse: '4h', resolution: '40h' },
  low: { firstResponse: '8h', resolution: '80h' }
};
