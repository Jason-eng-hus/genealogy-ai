import type { Calendar, Precision } from '../constants/enums';

export interface PartialDate {
  year: number | null;
  month: number | null;
  day: number | null;
  dateText: string | null;
  precision: Precision;
  approximate: boolean;
  calendar: Calendar;
}

export interface PartialDateInput {
  year?: number | null;
  month?: number | null;
  day?: number | null;
  dateText?: string | null;
  precision?: Precision;
  approximate?: boolean;
  calendar?: Calendar;
}

export interface DateInstant {
  year: number;
  month: number;
  day: number;
}

export interface DateInterval {
  start: DateInstant | null;
  end: DateInstant | null;
  precision: Precision;
  approximate: boolean;
}

export type DateRelation = 'BEFORE' | 'AFTER' | 'SAME' | 'OVERLAPS' | 'UNKNOWN';

export interface DateComparison {
  relation: DateRelation;
  certain: boolean;
  a: DateInterval;
  b: DateInterval;
}

export interface AgeRange {
  min: number;
  max: number;
  approximate: boolean;
  certain: boolean;
}

export type PartialDateIssueCode =
  | 'INVALID_PRECISION'
  | 'INVALID_CALENDAR'
  | 'YEAR_NOT_INTEGER'
  | 'YEAR_OUT_OF_RANGE'
  | 'MONTH_NOT_INTEGER'
  | 'MONTH_OUT_OF_RANGE'
  | 'DAY_NOT_INTEGER'
  | 'DAY_OUT_OF_RANGE'
  | 'MONTH_WITHOUT_YEAR'
  | 'DAY_WITHOUT_YEAR'
  | 'DAY_WITHOUT_MONTH'
  | 'INVALID_DAY_FOR_MONTH'
  | 'PRECISION_REQUIRES_DAY'
  | 'PRECISION_REQUIRES_MONTH'
  | 'PRECISION_REQUIRES_YEAR'
  | 'PRECISION_CONFLICT';

export interface PartialDateIssue {
  field: 'precision' | 'calendar' | 'year' | 'month' | 'day';
  code: PartialDateIssueCode;
  message: string;
}
