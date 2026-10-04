// The ten rules and the result. Each rule names the points of the public pages it rests on (src/data.js), and says where
// it is the tool's own choice; docs/method.md says exactly what each rule looks at and what it cannot see. A rule whose
// level is "off" is not reported. The checks themselves are in src/analyse.js.

import { LEVELS } from './data.js';
import { plural } from './size.js';

export const RULES = [
  {
    id: 'first-response-missed',
    key: 'firstResponseMissed',
    title: 'a first response that came after its target',
    basis: ['goalsByPriority', 'calendarHours', 'slaConsequence'],
    own: 'a time equal to the target meets it; a ticket resolved with no first response is measured up to its resolution, which is then its first response',
    rule: () => 'a ticket whose cover time from creation to first response, with paused time taken out when pausedClocks names firstResponse, is longer than the firstResponse target of its priority'
  },
  {
    id: 'resolution-missed',
    key: 'resolutionMissed',
    title: 'a resolution that came after its target',
    basis: ['goalsByPriority', 'pauseConditions', 'slaConsequence'],
    own: 'a time equal to the target meets it; paused time comes out of the resolution clock by default and out of the first response clock only when pausedClocks names it',
    rule: () => 'a resolved ticket whose cover time from creation to resolution, with paused time taken out when pausedClocks names resolution, is longer than the resolution target of its priority'
  },
  {
    id: 'first-response-overdue',
    key: 'firstResponseOverdue',
    title: 'an open ticket with no first response, past its target',
    basis: ['goalsByPriority', 'calendarHours'],
    own: 'the time of an open ticket is counted up to --as-of and never up to the clock of the machine; an overdue ticket counts as missed in the summary, because it can no longer meet its target',
    rule: () => 'an open ticket with no first response whose cover time from creation up to --as-of is longer than the firstResponse target of its priority'
  },
  {
    id: 'resolution-overdue',
    key: 'resolutionOverdue',
    title: 'an open ticket past its resolution target',
    basis: ['goalsByPriority', 'calendarHours'],
    own: 'the time of an open ticket is counted up to --as-of and never up to the clock of the machine; an overdue ticket counts as missed in the summary, because it can no longer meet its target',
    rule: () => 'an open ticket whose cover time from creation up to --as-of is longer than the resolution target of its priority'
  },
  {
    id: 'first-response-at-risk',
    key: 'firstResponseAtRisk',
    title: 'an open ticket with no first response, close to its target',
    basis: ['goalsByPriority', 'slaConsequence'],
    own: 'the share of the target that makes a ticket at risk, 80% by default, is the tool\'s own choice and is set with warnAt',
    rule: (c) => `an open ticket with no first response that has used ${c.warnAt}% or more of the firstResponse target of its priority by --as-of, and not more than all of it`
  },
  {
    id: 'resolution-at-risk',
    key: 'resolutionAtRisk',
    title: 'an open ticket close to its resolution target',
    basis: ['goalsByPriority', 'slaConsequence'],
    own: 'the share of the target that makes a ticket at risk, 80% by default, is the tool\'s own choice and is set with warnAt',
    rule: (c) => `an open ticket that has used ${c.warnAt}% or more of the resolution target of its priority by --as-of, and not more than all of it`
  },
  {
    id: 'invalid-timestamp',
    key: 'invalidTimestamp',
    title: 'a timestamp that is missing or cannot be read',
    basis: ['timestampOffset'],
    own: 'a timestamp with no offset is refused unless defaultOffset is set, seconds may be left out and a space may stand for the T; a ticket with a timestamp the tool cannot read is not judged against any target',
    rule: () => 'a ticket with no creation time, or with a creation, first response, resolution, pause or status time that is not an RFC 3339 timestamp with Z or an offset'
  },
  {
    id: 'timestamps-out-of-order',
    key: 'timestampsOutOfOrder',
    title: 'timestamps of a ticket in an order that cannot be',
    basis: ['timestampOffset', 'goalsByPriority'],
    own: 'a ticket whose times cannot be in that order is not judged, rather than judged on times that are wrong; a time after --as-of means the export is newer than --as-of',
    rule: () => 'a ticket with a first response, a resolution or a pause before its creation, a pause that ends before it starts, or a time after --as-of'
  },
  {
    id: 'unknown-priority',
    key: 'unknownPriority',
    title: 'a ticket whose priority the SLA does not name',
    basis: ['goalsByPriority'],
    own: 'priorities are compared as whole lowercase words, so "P1 - Urgent" and "p1 urgent" are one priority, and aliases name other spellings; a ticket with no target is not judged',
    rule: () => 'a ticket with no priority, or with a priority that is neither a priority of the configuration nor one of its aliases'
  },
  {
    id: 'duplicate-ticket',
    key: 'duplicateTicket',
    title: 'a ticket with no id or an id read before',
    basis: ['csvFormat', 'jsonRepeatedNames'],
    own: 'the first copy of a ticket is judged and every later copy is reported and left out, so a ticket is never counted twice in the summary',
    rule: () => 'a ticket with no id, or with an id that a ticket read before it already has, in the same file or in another'
  }
];

export const ruleById = (id) => RULES.find((r) => r.id === id);

// True when a level is at or above another.
export const atOrAbove = (level, min) => LEVELS.indexOf(level) >= LEVELS.indexOf(min);

// The result: the run fails when a finding is at the level error. { pass, errors, byLevel, text }.
export function decide(findings) {
  const byLevel = { error: 0, warning: 0, notice: 0 };
  for (const f of findings) byLevel[f.level] += 1;
  const below = ['warning', 'notice'].filter((l) => byLevel[l]).map((l) => plural(byLevel[l], l));
  const text = byLevel.error ? `FAIL - ${plural(byLevel.error, 'error')}${below.length ? ` (and ${below.join(', ')})` : ''}` : `PASS - no error${below.length ? ` (${below.join(', ')})` : ''}`;
  return { pass: byLevel.error === 0, errors: byLevel.error, byLevel, text };
}
