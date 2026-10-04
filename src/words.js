// Words compared as the tool compares them: the letters A to Z lowered whatever the locale, an apostrophe dropped, every
// other character that is not a letter or a digit read as a space, and runs of spaces as one. Used for the priorities of
// the tickets, the paused statuses and the column names of a CSV header.

// Lowercase for the letters A to Z only, so the result does not depend on the locale.
export const asciiLower = (text) => String(text).replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));

// A phrase in the form it is compared in: "P1 - Urgent" is "p1 urgent", "On Hold" is "on hold".
export function normalizePhrase(text) {
  return asciiLower(text).replace(/'/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
