/**
 * Shared intelligence constants — safe for client-side import.
 * Keep this file free of any server-only dependencies (fs, better-sqlite3, etc.).
 */

export const REVIEW_CONFIDENCE_THRESHOLD = 65;

export const DIGITAL_KEYWORDS = [
  'digital', 'download', 'ebook', 'e-book', 'course', 'pdf',
  'template', 'printable', 'software', 'instant-download',
  'membership', 'access', 'license',
];

export const BUNDLE_KEYWORDS = [
  'bundle', 'pack', 'kit', 'set', 'combo', 'duo', 'trio',
  'collection', 'variety',
];
