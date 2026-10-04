# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "sla-breach-check security", or use private vulnerability reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up export and configuration that show the problem, the command you ran, what you expected and what happened. Use made-up tickets, customers and names, never an export of a real help desk, and never a real key, token or password, even a revoked one.

## Scope

In scope:

- an input that makes the tool read a file other than the exports and the configuration it was given, follow a symbolic link, or read a file a pattern of the configuration leaves out
- an input that makes the tool open a network connection, fetch a web address, run a program, load a module or evaluate any part of a file
- an input that makes the tool write a file
- an input that makes the tool hang, take very long or use unbounded memory, such as a very large file, a very long line, very many tickets, files or pauses, long runs of quotes, JSON nested very deep, or timestamps far apart
- binary, UTF-16 or invalid UTF-8 input that the tool reads as if it were text
- an input that the tool fails to read and passes over without an error, such as a quoted field that is not closed, a record with the wrong number of fields, or an unknown key or a key named twice in the configuration
- a run that passes although a ticket of the export missed its target as docs/method.md counts it, or a ticket counted twice or not at all
- a result that changes with the clock, the time zone or the locale of the machine
- text from the export or a file name that rewrites the terminal through control or direction characters, starts or ends a GitHub workflow command, or is shown unescaped in the output
- a name such as `__proto__` that changes how objects behave inside the tool

Out of scope: the forms docs/limits.md says the tool does not read, whether the export holds the timestamps the agreement means, whether the configuration is the agreement, a change of a named time zone that comes with a new version of Node, who may change the export or the configuration in your repository, and where your pipeline keeps the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
