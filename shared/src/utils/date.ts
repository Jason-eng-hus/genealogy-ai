import {
  CALENDARS,
  PRECISIONS,
  type Calendar,
  type IssueSeverity,
  type Precision,
} from '../constants/enums';
import type {
  AgeRange,
  DateComparison,
  DateInstant,
  DateInterval,
  PartialDate,
  PartialDateInput,
  PartialDateIssue,
  PartialDateIssueCode,
} from '../types/partial-date';

const SOLAR_MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export class PartialDateValidationError extends Error {
  readonly issues: readonly PartialDateIssue[];

  constructor(issues: readonly PartialDateIssue[]) {
    super(`部分日期无效：${issues.map((issue) => issue.code).join(', ')}`);
    this.name = 'PartialDateValidationError';
    this.issues = [...issues];
  }
}

export function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number, calendar: Calendar): number {
  if (calendar === 'LUNAR') {
    return 30;
  }
  if (month === 2) {
    return isLeapYear(year) ? 29 : 28;
  }
  return SOLAR_MONTH_DAYS[month - 1];
}

export function inferDatePrecision(
  year: number | null,
  month: number | null,
  day: number | null,
): Precision {
  if (day !== null) {
    return 'DAY';
  }
  if (month !== null) {
    return 'MONTH';
  }
  if (year !== null) {
    return 'YEAR';
  }
  return 'UNKNOWN';
}

function issue(
  field: PartialDateIssue['field'],
  code: PartialDateIssueCode,
  message: string,
): PartialDateIssue {
  return { field, code, message };
}

export function validatePartialDate(input: PartialDateInput): PartialDateIssue[] {
  const year = input.year ?? null;
  const month = input.month ?? null;
  const day = input.day ?? null;
  const precision = input.precision ?? inferDatePrecision(year, month, day);
  const calendar = input.calendar ?? 'UNKNOWN';
  const issues: PartialDateIssue[] = [];

  if (!PRECISIONS.includes(precision)) {
    issues.push(issue('precision', 'INVALID_PRECISION', '日期精度不是受支持的值'));
  }
  if (!CALENDARS.includes(calendar)) {
    issues.push(issue('calendar', 'INVALID_CALENDAR', '历法不是受支持的值'));
  }

  const validYear =
    year !== null && Number.isInteger(year) && year >= 1 && year <= 9999;
  const validMonth =
    month !== null && Number.isInteger(month) && month >= 1 && month <= 12;

  if (year !== null) {
    if (!Number.isInteger(year)) {
      issues.push(issue('year', 'YEAR_NOT_INTEGER', '年份必须是整数'));
    } else if (year < 1 || year > 9999) {
      issues.push(issue('year', 'YEAR_OUT_OF_RANGE', '年份必须在 1 到 9999 之间'));
    }
  }

  if (month !== null) {
    if (!Number.isInteger(month)) {
      issues.push(issue('month', 'MONTH_NOT_INTEGER', '月份必须是整数'));
    } else if (month < 1 || month > 12) {
      issues.push(issue('month', 'MONTH_OUT_OF_RANGE', '月份必须在 1 到 12 之间'));
    }
    if (year === null) {
      issues.push(issue('month', 'MONTH_WITHOUT_YEAR', '填写月份时必须同时填写年份'));
    }
  }

  if (day !== null) {
    if (!Number.isInteger(day)) {
      issues.push(issue('day', 'DAY_NOT_INTEGER', '日期必须是整数'));
    } else if (day < 1 || day > 31) {
      issues.push(issue('day', 'DAY_OUT_OF_RANGE', '日期必须在 1 到 31 之间'));
    }
    if (year === null) {
      issues.push(issue('day', 'DAY_WITHOUT_YEAR', '填写日期时必须同时填写年份'));
    }
    if (month === null) {
      issues.push(issue('day', 'DAY_WITHOUT_MONTH', '填写日期时必须同时填写月份'));
    }
    if (
      validYear &&
      validMonth &&
      year !== null &&
      month !== null &&
      Number.isInteger(day) &&
      day >= 1 &&
      day <= 31 &&
      day > daysInMonth(year, month, calendar)
    ) {
      issues.push(issue('day', 'INVALID_DAY_FOR_MONTH', '该月不存在所填日期'));
    }
  }

  if (precision === 'DAY' && (year === null || month === null || day === null)) {
    issues.push(issue('precision', 'PRECISION_REQUIRES_DAY', '精度为日时必须填写年、月、日'));
  }
  if (precision === 'MONTH' && (year === null || month === null)) {
    issues.push(issue('precision', 'PRECISION_REQUIRES_MONTH', '精度为月时必须填写年和月'));
  }
  if (precision === 'MONTH' && day !== null) {
    issues.push(issue('precision', 'PRECISION_CONFLICT', '精度为月时不能填写具体日期'));
  }
  if (precision === 'YEAR' && year === null) {
    issues.push(issue('precision', 'PRECISION_REQUIRES_YEAR', '精度为年时必须填写年份'));
  }
  if (precision === 'YEAR' && (month !== null || day !== null)) {
    issues.push(issue('precision', 'PRECISION_CONFLICT', '精度为年时不能填写月份或日期'));
  }

  return issues;
}

export function normalizePartialDate(
  input: PartialDateInput | null | undefined,
): PartialDate | null {
  if (!input) {
    return null;
  }

  const year = input.year ?? null;
  const month = input.month ?? null;
  const day = input.day ?? null;
  const trimmedDateText = typeof input.dateText === 'string' ? input.dateText.trim() : null;
  const dateText = trimmedDateText === '' ? null : trimmedDateText;

  if (year === null && month === null && day === null && dateText === null) {
    return null;
  }

  const candidate: PartialDate = {
    year,
    month,
    day,
    dateText,
    precision: input.precision ?? inferDatePrecision(year, month, day),
    approximate: input.approximate ?? false,
    calendar: input.calendar ?? 'UNKNOWN',
  };

  const issues = validatePartialDate(candidate);
  if (issues.length > 0) {
    throw new PartialDateValidationError(issues);
  }

  return candidate;
}

function compareInstant(a: DateInstant, b: DateInstant): number {
  if (a.year !== b.year) {
    return a.year - b.year;
  }
  if (a.month !== b.month) {
    return a.month - b.month;
  }
  return a.day - b.day;
}

export function buildDateInterval(date: PartialDate | null | undefined): DateInterval {
  if (!date) {
    return {
      start: null,
      end: null,
      precision: 'UNKNOWN',
      approximate: false,
    };
  }

  const issues = validatePartialDate(date);
  if (issues.length > 0) {
    throw new PartialDateValidationError(issues);
  }

  if (date.year === null) {
    return {
      start: null,
      end: null,
      precision: date.precision,
      approximate: date.approximate,
    };
  }

  if (date.month !== null && date.day !== null) {
    return {
      start: { year: date.year, month: date.month, day: date.day },
      end: { year: date.year, month: date.month, day: date.day },
      precision: date.precision,
      approximate: date.approximate,
    };
  }

  if (date.month !== null) {
    return {
      start: { year: date.year, month: date.month, day: 1 },
      end: {
        year: date.year,
        month: date.month,
        day: daysInMonth(date.year, date.month, date.calendar),
      },
      precision: date.precision,
      approximate: date.approximate,
    };
  }

  return {
    start: { year: date.year, month: 1, day: 1 },
    end: { year: date.year, month: 12, day: 31 },
    precision: date.precision,
    approximate: date.approximate,
  };
}

export function comparePartialDates(
  a: PartialDate | null | undefined,
  b: PartialDate | null | undefined,
): DateComparison {
  const aInterval = buildDateInterval(a);
  const bInterval = buildDateInterval(b);
  const approximate = (a?.approximate ?? false) || (b?.approximate ?? false);

  if (
    !aInterval.start ||
    !aInterval.end ||
    !bInterval.start ||
    !bInterval.end
  ) {
    return {
      relation: 'UNKNOWN',
      certain: false,
      a: aInterval,
      b: bInterval,
    };
  }

  if (compareInstant(aInterval.end, bInterval.start) < 0) {
    return {
      relation: 'BEFORE',
      certain: !approximate,
      a: aInterval,
      b: bInterval,
    };
  }

  if (compareInstant(aInterval.start, bInterval.end) > 0) {
    return {
      relation: 'AFTER',
      certain: !approximate,
      a: aInterval,
      b: bInterval,
    };
  }

  const sameStart = compareInstant(aInterval.start, bInterval.start) === 0;
  const sameEnd = compareInstant(aInterval.end, bInterval.end) === 0;

  if (sameStart && sameEnd) {
    const exactDay =
      a?.precision === 'DAY' &&
      b?.precision === 'DAY' &&
      !approximate;
    return {
      relation: 'SAME',
      certain: exactDay,
      a: aInterval,
      b: bInterval,
    };
  }

  return {
    relation: 'OVERLAPS',
    certain: false,
    a: aInterval,
    b: bInterval,
  };
}

function completedYears(later: DateInstant, earlier: DateInstant): number {
  let years = later.year - earlier.year;
  if (
    later.month < earlier.month ||
    (later.month === earlier.month && later.day < earlier.day)
  ) {
    years -= 1;
  }
  return years;
}

export function calculateAgeRange(
  birth: PartialDate | null,
  reference: PartialDate | null,
): AgeRange | null {
  const birthInterval = buildDateInterval(birth);
  const referenceInterval = buildDateInterval(reference);

  if (
    !birthInterval.start ||
    !birthInterval.end ||
    !referenceInterval.start ||
    !referenceInterval.end ||
    !birth ||
    !reference
  ) {
    return null;
  }

  return {
    min: completedYears(referenceInterval.start, birthInterval.end),
    max: completedYears(referenceInterval.end, birthInterval.start),
    approximate: birth.approximate || reference.approximate,
    certain:
      !birth.approximate &&
      !reference.approximate &&
      birth.precision === 'DAY' &&
      reference.precision === 'DAY',
  };
}

export function downgradeIssueSeverityForApproximate(
  severity: IssueSeverity,
  ...dates: Array<PartialDate | null | undefined>
): IssueSeverity {
  if (severity !== 'ERROR') {
    return severity;
  }
  return dates.some((date) => date?.approximate === true) ? 'WARNING' : severity;
}
