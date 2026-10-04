# Changes

## 1.0.0

First release.

- Reads a support ticket export in CSV (RFC 4180, with a header row) or JSON (a list of tickets, or an object with a `tickets` list) and an SLA in a configuration file, and reports the tickets that missed their targets, the open tickets past or close to them, and the tickets it cannot judge.
- Ten rules: `first-response-missed`, `resolution-missed`, `first-response-overdue`, `resolution-overdue`, `first-response-at-risk`, `resolution-at-risk`, `invalid-timestamp`, `timestamps-out-of-order`, `unknown-priority` and `duplicate-ticket`, each with a level of its own (`error`, `warning`, `notice` or `off`) and the points of the public pages it rests on.
- Targets per priority for the first response and the resolution, in hours and minutes of cover time, with business cover or 24x7 cover, and aliases for the names a help desk uses. A time equal to the target meets it.
- A cover calendar with a time zone (a fixed offset, or a name of the time zone database read through `Intl.DateTimeFormat`), working days, one or more spans of working hours a day and holidays, built once per run over the days the export reaches.
- Paused time from intervals in the export or from a status history and its paused statuses, taken out of the clocks `pausedClocks` names.
- Reads no clock: the time of an open ticket is counted up to `--as-of`, and a run with open tickets and no `--as-of` stops. Timestamps need Z or an offset, or the `defaultOffset` of the configuration.
- A summary per priority with the tickets judged, met, missed, open and at risk, the share met, and the median and the 90th percentile by the nearest rank method.
- A configuration file in strict JSON over documented defaults: the priorities, the calendar, the field names of the export, the paused statuses and clocks, the share that makes a ticket at risk, the file patterns of a folder, the level of every rule and the minimum severity; a key the tool does not know is an error with its line and a suggestion, and a key named twice is refused.
- Reports as text, JSON and GitHub workflow commands (`--format github`) that show each finding as an annotation on the ticket file and line, `--min-severity` to hide the findings below a level, and `--explain` to show the rule and the sources behind each finding. Exit code `0` when no finding is at the level error, `1` when one is, `2` for a usage or input error, with no result.
- Follows no symbolic link, fetches nothing, connects to no help desk, writes nothing to disk, and refuses binary, UTF-16 and invalid UTF-8 input; every input has a size limit.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate of the repository.
