import {describe, it, expect} from '@jest/globals';
import {formatDate} from './format-date.js';

describe('formatDate', () => {
  it('returns "unknown" for undefined', () => {
    expect(formatDate(undefined)).toBe('unknown');
  });

  it('returns "unknown" for null', () => {
    expect(formatDate(null as never)).toBe('unknown');
  });

  it('formats a valid date', () => {
    const date = new Date('2026-04-06');
    const result = formatDate(date);
    expect(result).toMatch(/April 6, 2026/);
  });
});

