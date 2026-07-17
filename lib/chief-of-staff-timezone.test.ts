import { describe, it, expect } from 'vitest';
import { isValidTimeZone, getOrganizationLocalDate } from './chief-of-staff-timezone';

describe('isValidTimeZone', () => {
  it('accepts a real IANA timezone', () => {
    expect(isValidTimeZone('Africa/Johannesburg')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('America/Los_Angeles')).toBe(true);
  });

  it('rejects an invalid timezone identifier', () => {
    expect(isValidTimeZone('Not/A_Zone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('rejects non-string input safely', () => {
    // @ts-expect-error deliberately testing runtime guard against bad input
    expect(isValidTimeZone(null)).toBe(false);
    // @ts-expect-error deliberately testing runtime guard against bad input
    expect(isValidTimeZone(undefined)).toBe(false);
  });
});

describe('getOrganizationLocalDate', () => {
  it('maps 04:30 UTC to the correct Johannesburg (UTC+2) local date', () => {
    const instant = new Date('2026-07-17T04:30:00Z');
    expect(getOrganizationLocalDate(instant, 'Africa/Johannesburg')).toBe('2026-07-17');
  });

  it('computes correctly across a UTC midnight boundary', () => {
    // 23:30 UTC on the 16th is 01:30 local on the 17th in Johannesburg.
    const instant = new Date('2026-07-16T23:30:00Z');
    expect(getOrganizationLocalDate(instant, 'Africa/Johannesburg')).toBe('2026-07-17');
  });

  it('produces a different calendar date for a timezone behind UTC', () => {
    // 04:30 UTC is still the previous evening in Los Angeles (UTC-7/8).
    const instant = new Date('2026-07-17T04:30:00Z');
    expect(getOrganizationLocalDate(instant, 'America/Los_Angeles')).toBe('2026-07-16');
  });

  it('is timezone-sensitive: the same instant yields different dates in different zones', () => {
    const instant = new Date('2026-07-17T04:30:00Z');
    const joburg = getOrganizationLocalDate(instant, 'Africa/Johannesburg');
    const losAngeles = getOrganizationLocalDate(instant, 'America/Los_Angeles');
    expect(joburg).not.toBe(losAngeles);
  });

  it('throws for an unrecognized timezone rather than silently defaulting', () => {
    expect(() => getOrganizationLocalDate(new Date(), 'Not/A_Zone')).toThrow();
  });
});
