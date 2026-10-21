import { describe, expect, it } from 'vitest';
import type {
  PartialDate,
  PartialDateInput,
  PartialDateIssueCode,
} from '../src/types/partial-date';
import {
  PartialDateValidationError,
  buildDateInterval,
  calculateAgeRange,
  comparePartialDates,
  downgradeIssueSeverityForApproximate,
  isLeapYear,
  normalizePartialDate,
  validatePartialDate,
} from '../src/utils/date';

function requiredDate(input: PartialDateInput): PartialDate {
  const date = normalizePartialDate(input);
  if (!date) {
    throw new Error('Expected a normalized partial date');
  }
  return date;
}

function issueCodes(input: PartialDateInput): PartialDateIssueCode[] {
  try {
    normalizePartialDate(input);
    return [];
  } catch (error) {
    if (error instanceof PartialDateValidationError) {
      return error.issues.map((issue) => issue.code);
    }
    throw error;
  }
}

describe('normalizePartialDate', () => {
  it('returns null for an empty or absent date', () => {
    expect(normalizePartialDate(null)).toBeNull();
    expect(normalizePartialDate(undefined)).toBeNull();
    expect(normalizePartialDate({})).toBeNull();
    expect(normalizePartialDate({ dateText: '   ' })).toBeNull();
  });

  it('keeps missing month and day as null instead of fabricating them', () => {
    const date = requiredDate({
      year: 1902,
      dateText: '光绪二十八年',
      calendar: 'LUNAR',
    });

    expect(date).toEqual({
      year: 1902,
      month: null,
      day: null,
      dateText: '光绪二十八年',
      precision: 'YEAR',
      approximate: false,
      calendar: 'LUNAR',
    });
  });

  it('keeps a text-only date without inventing numeric components', () => {
    expect(requiredDate({ dateText: ' 约民国十年 ' })).toEqual({
      year: null,
      month: null,
      day: null,
      dateText: '约民国十年',
      precision: 'UNKNOWN',
      approximate: false,
      calendar: 'UNKNOWN',
    });
  });

  it('infers precision only from the components that are present', () => {
    expect(requiredDate({ year: 1902, month: 5 }).precision).toBe('MONTH');
    expect(requiredDate({ year: 1902, month: 5, day: 12 }).precision).toBe('DAY');
    expect(requiredDate({ year: 1902, precision: 'UNKNOWN' }).precision).toBe('UNKNOWN');
  });

  it('rejects month without year and day without month', () => {
    expect(issueCodes({ month: 5 })).toContain('MONTH_WITHOUT_YEAR');
    expect(issueCodes({ year: 1902, day: 5 })).toContain('DAY_WITHOUT_MONTH');
    expect(issueCodes({ month: 5, day: 6 })).toContain('DAY_WITHOUT_YEAR');
  });

  it('accepts a real leap day and rejects invalid leap days', () => {
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2004)).toBe(true);

    expect(requiredDate({ year: 2000, month: 2, day: 29 }).precision).toBe('DAY');
    expect(issueCodes({ year: 1900, month: 2, day: 29 })).toContain('INVALID_DAY_FOR_MONTH');
    expect(issueCodes({ year: 2001, month: 2, day: 29 })).toContain('INVALID_DAY_FOR_MONTH');
  });

  it('rejects impossible solar days but allows lunar day 30', () => {
    expect(issueCodes({ year: 2001, month: 4, day: 31 })).toContain('INVALID_DAY_FOR_MONTH');
    expect(requiredDate({ year: 1902, month: 2, day: 30, calendar: 'LUNAR' }).precision).toBe('DAY');
  });

  it('validates ranges and precision consistency', () => {
    expect(issueCodes({ year: 10000 })).toContain('YEAR_OUT_OF_RANGE');
    expect(issueCodes({ year: 1902.5 })).toContain('YEAR_NOT_INTEGER');
    expect(issueCodes({ year: 1902, month: 13 })).toContain('MONTH_OUT_OF_RANGE');
    expect(issueCodes({ year: 1902, month: 5, day: 0 })).toContain('DAY_OUT_OF_RANGE');
    expect(issueCodes({ year: 1902, precision: 'DAY' })).toContain('PRECISION_REQUIRES_DAY');
    expect(issueCodes({ year: 1902, month: 5, precision: 'YEAR' })).toContain('PRECISION_CONFLICT');
    expect(
      issueCodes({ year: 1902, month: 5, day: 6, precision: 'MONTH' }),
    ).toContain('PRECISION_CONFLICT');
  });

  it('reports every validation issue without throwing from validatePartialDate', () => {
    const issues = validatePartialDate({ month: 13, day: 32 });
    const codes = issues.map((issue) => issue.code);

    expect(codes).toContain('MONTH_OUT_OF_RANGE');
    expect(codes).toContain('DAY_OUT_OF_RANGE');
    expect(codes).toContain('MONTH_WITHOUT_YEAR');
    expect(issues.every((issue) => issue.message.length > 0)).toBe(true);
  });
});

describe('buildDateInterval', () => {
  it('expands year and month precision to bounded intervals', () => {
    expect(buildDateInterval(requiredDate({ year: 1900 }))).toMatchObject({
      start: { year: 1900, month: 1, day: 1 },
      end: { year: 1900, month: 12, day: 31 },
    });
    expect(buildDateInterval(requiredDate({ year: 2000, month: 2 }))).toMatchObject({
      start: { year: 2000, month: 2, day: 1 },
      end: { year: 2000, month: 2, day: 29 },
    });
    expect(buildDateInterval(requiredDate({ year: 2001, month: 2 }))).toMatchObject({
      start: { year: 2001, month: 2, day: 1 },
      end: { year: 2001, month: 2, day: 28 },
    });
  });

  it('keeps an exact day as a single-day interval', () => {
    expect(buildDateInterval(requiredDate({ year: 1978, month: 12, day: 17 }))).toMatchObject({
      start: { year: 1978, month: 12, day: 17 },
      end: { year: 1978, month: 12, day: 17 },
    });
  });

  it('returns an unbounded interval when the year is unknown', () => {
    expect(buildDateInterval(requiredDate({ dateText: '约民国十年' }))).toMatchObject({
      start: null,
      end: null,
    });
    expect(buildDateInterval(null)).toMatchObject({ start: null, end: null });
  });

  it('rejects invalid date objects before interval construction', () => {
    const invalid: PartialDate = {
      year: 1900,
      month: 4,
      day: 31,
      dateText: null,
      precision: 'DAY',
      approximate: false,
      calendar: 'SOLAR',
    };

    expect(() => buildDateInterval(invalid)).toThrow(PartialDateValidationError);
  });
});

describe('comparePartialDates', () => {
  it('compares exact dates with certainty', () => {
    const earlier = requiredDate({ year: 1900, month: 12, day: 31 });
    const later = requiredDate({ year: 1901, month: 1, day: 1 });

    expect(comparePartialDates(earlier, later)).toMatchObject({
      relation: 'BEFORE',
      certain: true,
    });
    expect(comparePartialDates(later, earlier)).toMatchObject({
      relation: 'AFTER',
      certain: true,
    });
    expect(comparePartialDates(earlier, earlier)).toMatchObject({
      relation: 'SAME',
      certain: true,
    });
  });

  it('returns SAME for the same known interval but not as an exact day', () => {
    expect(
      comparePartialDates(requiredDate({ year: 1900 }), requiredDate({ year: 1900 })),
    ).toMatchObject({ relation: 'SAME', certain: false });
  });

  it('detects overlap between a month and a year', () => {
    expect(
      comparePartialDates(
        requiredDate({ year: 1900, month: 5 }),
        requiredDate({ year: 1900 }),
      ),
    ).toMatchObject({ relation: 'OVERLAPS', certain: false });
  });

  it('returns UNKNOWN when either year is missing', () => {
    expect(
      comparePartialDates(requiredDate({ dateText: '光绪年间' }), requiredDate({ year: 1900 })),
    ).toMatchObject({ relation: 'UNKNOWN', certain: false });
  });

  it('marks approximate comparisons as uncertain', () => {
    expect(
      comparePartialDates(
        requiredDate({ year: 1900, month: 1, day: 1, approximate: true }),
        requiredDate({ year: 1900, month: 1, day: 1 }),
      ),
    ).toMatchObject({ relation: 'SAME', certain: false });

    expect(
      comparePartialDates(
        requiredDate({ year: 1900, approximate: true }),
        requiredDate({ year: 2000 }),
      ),
    ).toMatchObject({ relation: 'BEFORE', certain: false });
  });
});

describe('calculateAgeRange', () => {
  it('computes an exact age from exact dates', () => {
    expect(
      calculateAgeRange(
        requiredDate({ year: 1900, month: 1, day: 1 }),
        requiredDate({ year: 1970, month: 1, day: 1 }),
      ),
    ).toEqual({ min: 70, max: 70, approximate: false, certain: true });
  });

  it('handles a leap-day birth', () => {
    const birth = requiredDate({ year: 2000, month: 2, day: 29 });

    expect(
      calculateAgeRange(birth, requiredDate({ year: 2001, month: 2, day: 28 })),
    ).toMatchObject({ min: 0, max: 0 });
    expect(
      calculateAgeRange(birth, requiredDate({ year: 2001, month: 3, day: 1 })),
    ).toMatchObject({ min: 1, max: 1 });
  });

  it('returns a range when month or day is missing', () => {
    expect(
      calculateAgeRange(requiredDate({ year: 1900 }), requiredDate({ year: 1901 })),
    ).toEqual({ min: 0, max: 1, approximate: false, certain: false });
  });

  it('returns null when the year is missing', () => {
    expect(
      calculateAgeRange(requiredDate({ dateText: '光绪年间' }), requiredDate({ year: 1901 })),
    ).toBeNull();
    expect(
      calculateAgeRange(requiredDate({ year: 1900 }), requiredDate({ dateText: '卒年不详' })),
    ).toBeNull();
  });

  it('marks approximate age ranges as uncertain', () => {
    expect(
      calculateAgeRange(
        requiredDate({ year: 1900, approximate: true }),
        requiredDate({ year: 1970 }),
      ),
    ).toEqual({ min: 69, max: 70, approximate: true, certain: false });
  });
});

describe('downgradeIssueSeverityForApproximate', () => {
  it('downgrades ERROR to WARNING only when a date is approximate', () => {
    const approximate = requiredDate({ year: 1900, approximate: true });
    const exact = requiredDate({ year: 1900 });

    expect(downgradeIssueSeverityForApproximate('ERROR', approximate)).toBe('WARNING');
    expect(downgradeIssueSeverityForApproximate('ERROR', exact)).toBe('ERROR');
    expect(downgradeIssueSeverityForApproximate('ERROR', exact, approximate)).toBe('WARNING');
    expect(downgradeIssueSeverityForApproximate('ERROR', null)).toBe('ERROR');
  });

  it('leaves non-error severities unchanged', () => {
    const approximate = requiredDate({ year: 1900, approximate: true });
    expect(downgradeIssueSeverityForApproximate('WARNING', approximate)).toBe('WARNING');
    expect(downgradeIssueSeverityForApproximate('INFO', approximate)).toBe('INFO');
  });
});
