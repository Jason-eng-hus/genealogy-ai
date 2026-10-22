import { isDeepStrictEqual } from 'node:util';
import type { AuditChange } from '../../../../shared/src/types/audit.ts';

export const REDACTED_VALUE = '[已隐藏]';

const SENSITIVE_KEYS = new Set([
  'ip',
  'ipaddress',
  'remoteip',
  'clientip',
  'useragent',
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'jwt',
  'secret',
  'apikey',
  'authorization',
  'cookie',
  'setcookie',
  'sessiontoken',
  'path',
  'serverpath',
  'filepath',
  'storagepath',
  'absolutepath',
  'uploaddir',
  'backupdir',
]);

const WINDOWS_ABSOLUTE_PATH = /^[A-Za-z]:[\\/]/;
const UNC_PATH = /^\\\\/;
const POSIX_SERVER_PATH =
  /^\/(?:home|Users|var|opt|srv|tmp|etc|root)\//;

export interface RedactionResult {
  value: unknown;
  redacted: boolean;
}

interface RedactionState {
  redacted: boolean;
}

function normalizeKey(key: string): string {
  return key.replace(/[\s_-]/g, '').toLowerCase();
}

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function isAbsoluteServerPath(value: string): boolean {
  return (
    WINDOWS_ABSOLUTE_PATH.test(value) ||
    UNC_PATH.test(value) ||
    POSIX_SERVER_PATH.test(value)
  );
}

function redactValue(
  value: unknown,
  key: string | null,
  state: RedactionState,
): unknown {
  if (key !== null && SENSITIVE_KEYS.has(normalizeKey(key))) {
    state.redacted = true;

    return REDACTED_VALUE;
  }

  if (typeof value === 'string') {
    if (isAbsoluteServerPath(value)) {
      state.redacted = true;

      return REDACTED_VALUE;
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, null, state));
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {};

    for (const [childKey, childValue] of Object.entries(value)) {
      result[childKey] = redactValue(childValue, childKey, state);
    }

    return result;
  }

  return value;
}

export function redactSnapshot(value: unknown): RedactionResult {
  const state: RedactionState = { redacted: false };

  return {
    value: redactValue(value, null, state),
    redacted: state.redacted,
  };
}

function flattenSnapshot(
  value: unknown,
  prefix: string,
  target: Map<string, unknown>,
): void {
  if (isPlainObject(value) && Object.keys(value).length > 0) {
    for (const [key, childValue] of Object.entries(value)) {
      flattenSnapshot(
        childValue,
        prefix === '' ? key : `${prefix}.${key}`,
        target,
      );
    }

    return;
  }

  target.set(prefix === '' ? '$' : prefix, value);
}

function comparePaths(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

export function diffSnapshots(
  before: unknown,
  after: unknown,
): AuditChange[] {
  const beforeFields = new Map<string, unknown>();
  const afterFields = new Map<string, unknown>();

  if (before !== null && before !== undefined) {
    flattenSnapshot(before, '', beforeFields);
  }

  if (after !== null && after !== undefined) {
    flattenSnapshot(after, '', afterFields);
  }

  const paths = new Set([
    ...beforeFields.keys(),
    ...afterFields.keys(),
  ]);
  const changes: AuditChange[] = [];

  for (const path of paths) {
    const hasBefore = beforeFields.has(path);
    const hasAfter = afterFields.has(path);
    const beforeValue = beforeFields.get(path) ?? null;
    const afterValue = afterFields.get(path) ?? null;

    if (!hasBefore) {
      changes.push({
        path,
        kind: 'ADDED',
        before: null,
        after: afterValue,
      });
      continue;
    }

    if (!hasAfter) {
      changes.push({
        path,
        kind: 'REMOVED',
        before: beforeValue,
        after: null,
      });
      continue;
    }

    if (!isDeepStrictEqual(beforeValue, afterValue)) {
      changes.push({
        path,
        kind: 'CHANGED',
        before: beforeValue,
        after: afterValue,
      });
    }
  }

  return changes.sort((left, right) =>
    comparePaths(left.path, right.path),
  );
}
