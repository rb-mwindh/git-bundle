import {describe, it, expect} from '@jest/globals';
import {formatFileSize} from './format-file-size.js';

describe('formatFileSize', () => {
  it('formats zero bytes', () => {
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('formats bytes without decimal places', () => {
    expect(formatFileSize(512)).toBe('512 B');
  });

  it('formats kilobytes with one decimal place', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
  });

  it('formats megabytes with one decimal place', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
  });

  it('formats gigabytes with one decimal place', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('respects custom fraction digits', () => {
    expect(formatFileSize(1536, 2)).toBe('1.50 KB');
  });

  it('throws on negative numbers', () => {
    expect(() => formatFileSize(-100)).toThrow('sizeInBytes must be a non-negative finite number');
  });

  it('throws on non-finite numbers', () => {
    expect(() => formatFileSize(Infinity)).toThrow('sizeInBytes must be a non-negative finite number');
    expect(() => formatFileSize(NaN)).toThrow('sizeInBytes must be a non-negative finite number');
  });
});

