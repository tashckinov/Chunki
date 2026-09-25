import { describe, it, expect } from 'vitest';
import { extractOfferId } from './offerId.js';

describe('extractOfferId', () => {
  it('leaves a bare offerId untouched', () => {
    expect(extractOfferId('45b347bb-4063-4175-b018-69df351313a3')).toBe('45b347bb-4063-4175-b018-69df351313a3');
  });

  it('extracts the offerId from a full product link', () => {
    const link = 'https://app.lava.top/products/224c1c3c-3604-4420-84ab-bad09bd1ebd7/45b347bb-4063-4175-b018-69df351313a3';
    expect(extractOfferId(link)).toBe('45b347bb-4063-4175-b018-69df351313a3');
  });

  it('returns null for null/undefined/empty input', () => {
    expect(extractOfferId(null)).toBeNull();
    expect(extractOfferId(undefined)).toBeNull();
    expect(extractOfferId('')).toBeNull();
  });
});
