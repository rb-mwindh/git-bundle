/**
 * Formats a number of bytes as a human-readable file size (B, KB, MB, GB).
 * Throws an error if the input is not a non-negative finite number.
 */
export function formatFileSize(sizeInBytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(sizeInBytes) || sizeInBytes < 0) {
    throw new Error('sizeInBytes must be a non-negative finite number');
  }

  if (sizeInBytes === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];

  let value = sizeInBytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  const digits = unitIndex === 0 ? 0 : fractionDigits;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

