# Secure defaults

The default run is the safe run. Nothing in the first section needs a flag, and none of it can be switched off. The rest
of the document is about what the tool cannot do for you: where the export comes from, where the output goes, and who
may change the configuration.

## How the tool behaves by default

- **Reads, never follows.** The tool reads the files and folders it is given and the configuration named with
  `--config`. It follows no symbolic link, fetches no web address, refuses an argument that looks like an address,
  connects to no help desk, starts no program and writes nothing to disk.
- **Reads no clock.** "Now" comes from `--as-of` and nowhere else, every time zone is named, and timestamps without an
  offset are refused unless the configuration gives one
  ([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)).
- **Every rule on from the first run.** A missed target, an overdue ticket and every input problem are errors; a ticket
  at risk is a warning.
- **Fail closed on what it cannot read.** An input that cannot be read stops the run with exit code `2` and no result:
  a missing file, a link, a folder with no ticket file, a file over its limit, a binary file, UTF-16, bytes that are
  not UTF-8, a CSV record with the wrong number of fields or a stray quote, a header without a column the tool needs,
  JSON that is not valid, open tickets with no `--as-of`. A ticket the tool cannot judge is an error of its own, never
  passed over.
- **Unknown keys are errors.** A key in the configuration that the tool does not know stops the run, with its line and
  a suggestion, so a typo such as `firstReponse` cannot leave a target out. A key named twice stops the run.
- **A ticket counts once.** A ticket with no id, or an id read before, is reported and the copy is left out.
- **No regular expression from the input.** No pattern is built from the export or the configuration; file patterns are
  matched by hand, and the CSV reader reads each character once.
- **No prototype tricks.** Objects are built with own properties, and tickets and priorities are looked up in `Map`
  and arrays, so `__proto__` is only a name.
- **Clean output.** Text from the input, file names included, has control characters, line separators and direction
  controls removed and its length capped before it reaches a report or an error message. The GitHub format escapes
  `%`, CR and LF in a message and also `:` and `,` in a property, so a text cannot end a workflow command early or
  start another one.
- **The same input gives the same output.** No clock, no zone of the machine, no locale and no random number; folders
  are walked in the order of their names by code unit, and case is changed for the letters A to Z only.
- **No dependencies.** Node 22 or newer and nothing else.

## Settings that make the check stricter

- **`"warnAt": 50`.** Open tickets show up as at risk from half of their target.
- **`"rules": { "firstResponseAtRisk": "error", "resolutionAtRisk": "error" }`.** A ticket close to its target fails the
  run, for a check that should warn before a breach rather than after.
- **`"pausedClocks": []`.** No pause stops a clock, for an agreement that does not allow pauses.
- **A fixed offset as `timezone`.** The result never moves with an update of the time zone database.

## Running it in a pipeline

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
    with:
      node-version: 22
  - name: SLA breach check
    env:
      EXPORTED_AT: ${{ vars.TICKETS_EXPORTED_AT }}
    run: npx --yes github:INNERLUXES/sla-breach-check exports/tickets.csv --config support/sla.json --as-of "$EXPORTED_AT" --format github
```

- Pass the time the export was taken as `--as-of`, from the job that made the export. The tool does not read the time
  of the runner.
- Give the job read access to the contents and nothing more. The tool needs no secret and no help desk account.
- Pin every action to a full commit, as above, and pin the tool to a release commit or a tag you have read, because
  `npx` runs what it downloads.
- Do not hide the exit code with a trailing `|| true`.
- Findings name tickets and their priorities. Post the output only where the people who may read the tickets read it,
  and keep exports with customer data out of public repositories.

## Protecting the export and the configuration

The configuration holds the targets, the calendar and the paused statuses, and each of them moves every result. Keep it
in the repository, put its path in `CODEOWNERS` with the people who own the agreement, and require their review in
branch protection. Review a change that raises a target, adds a holiday, widens the working hours, adds a paused
status, adds a clock to `pausedClocks`, adds a pattern to `exclude`, or sets a rule to off or lower like a change to
code: each of them can let a breach pass.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline and before every release, with
`ssdf-repo-check` pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries, the SSDF gate in ci.yml and release.yml |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS with Node 22 and 24, `npm run test:coverage`, hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |
