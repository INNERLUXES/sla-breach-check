// A small strict CSV reader, as RFC 4180 writes the format: records end at a line break (CR LF, LF or CR), fields are
// separated by commas, and a field that holds a comma, a quote or a line break is enclosed in double quotes with each
// quote inside doubled. A quote inside a field that does not start with one, text after the closing quote of a field,
// and a quoted field that is not closed are refused with their line and column, so a stray quote never swallows the
// rest of a file. A line with nothing on it is passed over. The reader goes over the text once; the end of a quoted
// field is found with one search per doubled quote.

import { lineStarts, positionOf } from './json.js';

export const CSV_LIMITS = { maxFields: 1000, maxFieldLength: 65536, maxRecords: 500001 };

export class CsvError extends Error {
  constructor(reason, offset) {
    super(reason);
    this.reason = reason;
    this.offset = offset;
  }
}

// Reads a CSV text: [{ line, fields }], with the line on which each record starts.
export function parseCsv(text, limits = CSV_LIMITS) {
  const lim = { ...CSV_LIMITS, ...limits };
  const rows = [];
  const n = text.length;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  const newlinesIn = (from, to) => {
    let count = 0;
    for (let k = from; k < to; k += 1) {
      const c = text.charCodeAt(k);
      if (c === 10 || (c === 13 && text.charCodeAt(k + 1) !== 10)) count += 1;
    }
    return count;
  };
  while (i < n) {
    const c0 = text.charCodeAt(i);
    if (c0 === 10 || c0 === 13) {
      i += c0 === 13 && text.charCodeAt(i + 1) === 10 ? 2 : 1;
      line += 1;
      continue;
    }
    const start = line;
    const fields = [];
    for (;;) {
      let value;
      if (text.charCodeAt(i) === 34) {
        const open = i;
        i += 1;
        value = '';
        for (;;) {
          const q = text.indexOf('"', i);
          if (q < 0) throw new CsvError('a quoted field that is not closed', open);
          line += newlinesIn(i, q);
          value += text.slice(i, q);
          if (value.length > lim.maxFieldLength) throw new CsvError(`a field longer than ${lim.maxFieldLength.toLocaleString('en-US')} characters`, open);
          if (text.charCodeAt(q + 1) === 34) {
            value += '"';
            i = q + 2;
            continue;
          }
          i = q + 1;
          break;
        }
        const c = text.charCodeAt(i);
        if (i < n && c !== 44 && c !== 10 && c !== 13) throw new CsvError('text after the closing quote of a field; a quote inside a quoted field is written twice', i);
      } else {
        let j = i;
        while (j < n) {
          const c = text.charCodeAt(j);
          if (c === 44 || c === 10 || c === 13) break;
          if (c === 34) throw new CsvError('a quote inside a field that does not start with a quote; enclose the field in quotes and write the quote twice', j);
          j += 1;
        }
        if (j - i > lim.maxFieldLength) throw new CsvError(`a field longer than ${lim.maxFieldLength.toLocaleString('en-US')} characters`, i);
        value = text.slice(i, j);
        i = j;
      }
      fields.push(value);
      if (fields.length > lim.maxFields) throw new CsvError(`a record with more than ${lim.maxFields.toLocaleString('en-US')} fields`, i);
      if (i >= n) break;
      const c = text.charCodeAt(i);
      if (c === 44) {
        i += 1;
        if (i >= n) {
          fields.push('');
          break;
        }
        continue;
      }
      i += c === 13 && text.charCodeAt(i + 1) === 10 ? 2 : 1;
      line += 1;
      break;
    }
    rows.push({ line: start, fields });
    if (rows.length > lim.maxRecords) throw new CsvError(`more than ${lim.maxRecords.toLocaleString('en-US')} records`, i);
  }
  return rows;
}

// The reason of a CsvError with its line and column, for an error message.
export function csvProblem(error, text) {
  if (!(error instanceof CsvError)) return error.message;
  const pos = positionOf(lineStarts(text), Math.min(error.offset, text.length));
  return `line ${pos.line}, column ${pos.column}: ${error.reason}`;
}
