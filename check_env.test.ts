import { it, expect } from 'vitest';
it('checks for ReadableStream', () => {
  expect(typeof ReadableStream).not.toBe('undefined');
  expect(typeof TextDecoder).not.toBe('undefined');
  expect(typeof TextEncoder).not.toBe('undefined');
});
