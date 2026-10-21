import { describe, expect, it } from 'vitest';
import {
  InvalidVersionError,
  VersionConflictError,
  assertExpectedVersion,
  assertValidVersion,
  executeVersionedWrite,
  incrementVersion,
} from '../src/utils/version';

describe('version validation', () => {
  it('accepts positive integers and rejects invalid versions', () => {
    expect(() => assertValidVersion(1)).not.toThrow();
    expect(() => assertValidVersion(24)).not.toThrow();

    for (const version of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => assertValidVersion(version)).toThrow(InvalidVersionError);
    }
  });

  it('throws a conflict with both versions when the request is stale', () => {
    expect(() => assertExpectedVersion(3, 3)).not.toThrow();

    try {
      assertExpectedVersion(3, 2);
      throw new Error('Expected a version conflict');
    } catch (error) {
      expect(error).toBeInstanceOf(VersionConflictError);
      const conflict = error as VersionConflictError;
      expect(conflict.code).toBe('VERSION_CONFLICT');
      expect(conflict.currentVersion).toBe(3);
      expect(conflict.expectedVersion).toBe(2);
    }
  });

  it('increments by exactly one', () => {
    expect(incrementVersion(1)).toBe(2);
    expect(incrementVersion(99)).toBe(100);
    expect(() => incrementVersion(0)).toThrow(InvalidVersionError);
  });
});

describe('executeVersionedWrite', () => {
  it('passes the incremented version to the write callback before returning it', async () => {
    let persistedVersion = 1;

    const result = await executeVersionedWrite(
      { currentVersion: 1, expectedVersion: 1 },
      async (nextVersion) => {
        persistedVersion = nextVersion;
        return 'saved';
      },
    );

    expect(result).toEqual({ version: 2, result: 'saved' });
    expect(persistedVersion).toBe(2);
  });

  it('does not call the writer when the expected version is stale', async () => {
    let called = false;

    await expect(
      executeVersionedWrite({ currentVersion: 2, expectedVersion: 1 }, async () => {
        called = true;
        return 'should not run';
      }),
    ).rejects.toBeInstanceOf(VersionConflictError);

    expect(called).toBe(false);
  });

  it('does not return a new version when the write fails', async () => {
    let persistedVersion = 1;

    await expect(
      executeVersionedWrite({ currentVersion: 1, expectedVersion: 1 }, async () => {
        throw new Error('write failed');
      }),
    ).rejects.toThrow('write failed');

    expect(persistedVersion).toBe(1);
  });

  it('validates the input before invoking the writer', async () => {
    let called = false;

    await expect(
      executeVersionedWrite({ currentVersion: 0, expectedVersion: 0 }, async () => {
        called = true;
        return 'should not run';
      }),
    ).rejects.toBeInstanceOf(InvalidVersionError);

    expect(called).toBe(false);
  });
});
