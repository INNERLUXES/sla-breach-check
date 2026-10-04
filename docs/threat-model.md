# Threat model

## What the tool touches

- It reads the files and folders named on the command line and the configuration file named with `--config`. In a
  folder it opens only the files whose path matches the patterns of the configuration. Nothing else is opened.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, connects to no help desk, follows no symbolic link, evaluates nothing it reads,
  starts no program and reads no clock.

## What the input may hold

Ticket exports come from a help desk and hold text that customers wrote: subjects, names, statuses, sometimes ids that
customers chose. The configuration lives in a repository that many people change. In a pipeline that checks every
pull request, both may be written by whoever opened the pull request.

Through the inputs, a person can try to:

- make the tool read another file: a file or a folder named through a symbolic link that points at a key file, a link
  inside a folder, a file swapped for a link between the walk and the read, a path with `..` in a pattern;
- make the tool fetch something: a path written as a web address;
- make a breach pass: a timestamp with no offset read in a convenient zone, a stray quote in a CSV field that swallows
  the rest of the file, a record with a missing field that moves every value one column, a misspelt column so that no
  ticket has a first response, the same ticket twice so a met copy hides a missed one, a priority the SLA does not
  name, times in an order that cannot be, a pause that covers the whole life of a ticket;
- move the result through the configuration: a key named twice, an unknown key that looks like a known one
  (`firstReponse` for `firstResponse`), a rule set to off, a wider calendar, a new paused status, a pattern in
  `exclude` that leaves an export out;
- make the result depend on the machine: no `--as-of`, so that "now" would be the clock of the runner, or a calendar
  read in the zone of the runner;
- exhaust the memory or the time: thousands of files, a file of gigabytes, a line of megabytes, long runs of quotes,
  JSON nested very deep, a ticket open for thousands of years, thousands of pauses;
- slip in something that is not text: a binary file named `.csv`, a file in UTF-16, bytes that are not UTF-8;
- rewrite the terminal or break the output: control characters, ANSI escapes, direction controls and line separators
  in a file name, an id, a priority or a timestamp;
- start a second workflow command: a text that holds `::error`, `%`, a comma, a colon or a line break, which the
  GitHub format writes into a command;
- change how objects behave: an id, a priority or a key named `__proto__`, `constructor` or `toString`.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A symbolic link makes the tool read another file | A path named on the command line is looked at without following a link, and a link is refused; inside a folder a link is skipped and counted; each file is opened with `O_NOFOLLOW` where the system has it and its type is taken from the open handle, so a file swapped for a link is refused. A test names a file and the configuration through a link and puts links in a folder |
| The tool fetches a web address | No module of the network is imported; a path that looks like an address is refused. A test checks the imports of src |
| A breach passes | A timestamp needs Z or an offset, or `defaultOffset`; a stray quote, text after a closing quote, a quoted field that is not closed and a record with the wrong number of fields stop the run with their line; a header without a needed column, or a JSON export in which no ticket has a needed key, stops the run; an id read twice, an unknown priority, an unreadable timestamp and times out of order are errors of their own, and such a ticket is not judged; a pause only takes out cover time inside it, and only from the clocks `pausedClocks` names |
| A key named twice or an unknown key moves the result | The JSON readers refuse a repeated key; an unknown key, in the configuration, in a priority, in `fields` or in `rules`, stops the run with its line and a suggestion; two priorities or aliases that compare the same are refused |
| The configuration leaves files out | `exclude` is a key like any other; a folder in which no file matches is an error, and the report lists every file read with its number of tickets. Review a change to `files` and `exclude` like a change to code (docs/secure-defaults.md) |
| The result depends on the machine | The tool reads no clock, no zone of the machine and no locale; open tickets with no `--as-of` stop the run; every zone is named; a test fails if src reads the clock or the zone of the machine ([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)) |
| The memory or the time is exhausted | Files have size limits checked on the open handle before they are read, and a run has limits on its files, its bytes, its tickets and the entries it walks; the CSV reader reads each character once and finds the end of a quoted field with one search per doubled quote; the JSON reader limits its depth and its values; the calendar is built once over at most 36,600 days and each ticket is judged with a few lookups; pauses per ticket are capped; findings are capped per rule. Tests check the time, with limits that widen under coverage only |
| A pattern from the input is slow | No regular expression is built from the export or the configuration; file patterns are matched by hand with work bounded by the product of their lengths; a test looks for `new RegExp` in src |
| A binary or UTF-16 file is read as text | A null byte, a UTF-16 byte order mark or bytes that are not valid UTF-8 stop the run with exit code `2` |
| Text from the input rewrites the terminal | Every text, file names included, goes through `safeText`, which removes control, line separator and direction characters and caps the length. A test puts ANSI escapes and direction controls in a file name, an id, a priority and a timestamp, in every format |
| A text starts a second workflow command | The GitHub format escapes `%`, CR and LF in a message and `:` and `,` in a property; a line break never reaches a command. A test writes `::error` and `%` into an id and a comma and a colon into the file name |
| `__proto__` changes how objects behave | The JSON readers define own properties; tickets and priorities are looked up in `Map` and in arrays, never as keys of a plain object. A test uses `__proto__`, `constructor`, `toString` and `hasOwnProperty` as ids, priorities, keys and priority names |
| A device or a pipe hangs the tool | A path that is not a regular file or a folder is refused before it is read, and a walk reads regular files only |
| The tool leaves files behind | Nothing is written to disk; there is no cache, no temporary file and no log. A test checks that a run leaves the folder as it was |

## Out of scope

Whether the export holds the timestamps the agreement means, whether the configuration is the agreement the customer
signed, whether `--as-of` is the time the export was taken, who may change the export or the configuration in your
repository, and where your pipeline keeps the output.
