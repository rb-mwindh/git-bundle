/**
 * Formats a date as a long-form locale string (e.g., "April 6, 2026").
 * Returns "unknown" if the date is undefined or null.
 */
export function formatDate(d: Date | undefined): string {
  if (!d) {
    return 'unknown';
  }
  return new Date(d).toLocaleString('en-US', { dateStyle: "long"})
}

