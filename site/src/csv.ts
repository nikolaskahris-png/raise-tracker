// RFC 4180 CSV parser. Strict: every row must have exactly as many fields as the header.

export type CsvRow = { readonly line: number; readonly get: (column: string) => string };

export class CsvError extends Error {}

function splitRecords(text: string): { fields: string[]; line: number }[] {
  const records: { fields: string[]; line: number }[] = [];
  let field = '';
  let fields: string[] = [];
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else {
        if (c === '\n') line++;
        field += c;
      }
      continue;
    }
    if (c === '"') {
      if (field.length > 0) throw new CsvError(`line ${line}: quote inside an unquoted field`);
      inQuotes = true;
    } else if (c === ',') {
      fields.push(field); field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      fields.push(field); field = '';
      records.push({ fields, line: recordLine });
      fields = [];
      line++;
      recordLine = line;
    } else {
      field += c;
    }
  }
  if (inQuotes) throw new CsvError(`line ${line}: unterminated quoted field`);
  if (field.length > 0 || fields.length > 0) { fields.push(field); records.push({ fields, line: recordLine }); }
  return records;
}

export function parseCsv(text: string, file: string): { header: readonly string[]; rows: CsvRow[] } {
  const records = splitRecords(text);
  const first = records[0];
  if (!first) throw new CsvError(`${file}: empty file`);
  const header = first.fields;
  const index = new Map<string, number>();
  header.forEach((h, i) => {
    if (index.has(h)) throw new CsvError(`${file}: duplicate column ${h}`);
    index.set(h, i);
  });
  const rows: CsvRow[] = [];
  for (const rec of records.slice(1)) {
    if (rec.fields.length === 1 && rec.fields[0] === '') continue; // blank line
    if (rec.fields.length !== header.length) {
      throw new CsvError(`${file} line ${rec.line}: ${rec.fields.length} fields, header has ${header.length}`);
    }
    const fields = rec.fields;
    rows.push({
      line: rec.line,
      get: (column: string) => {
        const i = index.get(column);
        if (i === undefined) throw new CsvError(`${file}: no column ${column}`);
        return fields[i] ?? '';
      },
    });
  }
  return { header, rows };
}
