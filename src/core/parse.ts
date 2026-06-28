import { parseDocument } from 'yaml';
import { Finding } from './model.js';

/**
 * Read one file's text into a plain object. Reports invalid YAML and duplicate
 * keys (uniqueKeys), and treats an empty document as a warning.
 */
export function parseFile(text: string, file: string): { data?: unknown; findings: Finding[] } {
  const doc = parseDocument(text, { uniqueKeys: true });

  if (doc.errors.length > 0) {
    return {
      findings: doc.errors.map((err) => ({
        level: 'error',
        code: 'YAML',
        message: err.message,
        file,
        line: err.linePos?.[0]?.line,
      })),
    };
  }

  const data = doc.toJS() as unknown;
  if (data === null || data === undefined) {
    return { findings: [{ level: 'warning', code: 'EMPTY_FILE', message: 'file is empty', file }] };
  }

  return { data, findings: [] };
}
