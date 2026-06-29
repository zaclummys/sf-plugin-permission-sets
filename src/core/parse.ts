import { parseDocument } from 'yaml';
import { Finding, yamlError, emptyFileWarning } from './finding.js';

/**
 * Read one file's text into a plain object. Reports invalid YAML and duplicate
 * keys (uniqueKeys), and treats an empty document as a warning.
 */
export function parseFile(text: string, file: string): { data?: unknown; findings: Finding[] } {
    const doc = parseDocument(text, { uniqueKeys: true });

    if (doc.errors.length > 0) {
        return {
            findings: doc.errors.map((err) => yamlError(err.message, file, err.linePos?.[0]?.line)),
        };
    }

    const data = doc.toJS() as unknown;
    if (data == null) {
        return { findings: [emptyFileWarning(file)] };
    }

    return { data, findings: [] };
}
