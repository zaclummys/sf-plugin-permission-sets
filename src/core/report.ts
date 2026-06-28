import { Finding } from './model.js';

/** Render findings as human-readable lines. Shared by check, validate, and plan. */
export function formatFindings(findings: Finding[]): string[] {
  return findings.map((finding) => {
    const where = finding.file ? `${finding.file}${finding.line ? `:${finding.line}` : ''} ` : '';
    return `${finding.level}: ${where}${finding.message}`;
  });
}

/** Count findings by level. */
export function countFindings(findings: Finding[]): { errors: number; warnings: number } {
  return {
    errors: findings.filter((f) => f.level === 'error').length,
    warnings: findings.filter((f) => f.level === 'warning').length,
  };
}
