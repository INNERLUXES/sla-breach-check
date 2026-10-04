# A breaching set

The made-up exports of the same made-up help desk for the same week, one in CSV from the email and portal queue and
one in JSON from the phone queue, with `examples/sla.json`. They hold one problem of most kinds: a first reply that
came too late around the clock, a first reply that came too late even with the lunch break left out, a resolution past
its target, an open ticket past its resolution target and one with no first reply past its target, two open tickets
close to their targets, a priority the SLA does not name, a creation time with no offset, a first reply before the
ticket was created, a resolution on a date that does not exist, and a ticket exported twice. A phone ticket that waited
two days on the customer meets its target only because the status history pauses its clock.
