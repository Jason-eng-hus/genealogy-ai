import { describe, expect, it } from 'vitest';
import type { PersonStatus } from '../src/constants/enums';
import {
  PersonStateError,
  assertCanMergePersons,
  assertCanSoftDeletePerson,
  assertPersonStatusTransition,
  buildDefaultPersonFilter,
  canSoftDeletePerson,
  canTransitionPersonStatus,
  evaluateMergeEligibility,
  filterDefaultVisiblePersons,
  getMergeRedirect,
  isDefaultVisiblePerson,
  isPersonStatus,
  type MergeCandidate,
  type PersonStateErrorCode,
} from '../src/utils/person-state';

function stateErrorCode(fn: () => void): PersonStateErrorCode | null {
  try {
    fn();
    return null;
  } catch (error) {
    if (error instanceof PersonStateError) {
      return error.code;
    }
    throw error;
  }
}

function candidate(overrides: Partial<MergeCandidate> = {}): MergeCandidate {
  return {
    id: 'person-source',
    familyId: 'family-1',
    status: 'ACTIVE',
    mergedIntoId: null,
    ...overrides,
  };
}

describe('person status transitions', () => {
  it('allows only ACTIVE to become MERGED or DELETED', () => {
    expect(canTransitionPersonStatus('ACTIVE', 'ACTIVE')).toBe(true);
    expect(canTransitionPersonStatus('ACTIVE', 'MERGED')).toBe(true);
    expect(canTransitionPersonStatus('ACTIVE', 'DELETED')).toBe(true);
    expect(canTransitionPersonStatus('MERGED', 'MERGED')).toBe(true);
    expect(canTransitionPersonStatus('DELETED', 'DELETED')).toBe(true);
  });

  it('rejects leaving terminal statuses', () => {
    expect(canTransitionPersonStatus('MERGED', 'ACTIVE')).toBe(false);
    expect(canTransitionPersonStatus('MERGED', 'DELETED')).toBe(false);
    expect(canTransitionPersonStatus('DELETED', 'ACTIVE')).toBe(false);
    expect(canTransitionPersonStatus('DELETED', 'MERGED')).toBe(false);
  });

  it('throws a stable error for invalid transitions', () => {
    expect(stateErrorCode(() => assertPersonStatusTransition('DELETED', 'ACTIVE'))).toBe(
      'INVALID_STATUS_TRANSITION',
    );
    expect(stateErrorCode(() => assertPersonStatusTransition('MERGED', 'DELETED'))).toBe(
      'INVALID_STATUS_TRANSITION',
    );
    expect(stateErrorCode(() => assertPersonStatusTransition('ACTIVE', 'ACTIVE'))).toBeNull();
  });

  it('validates runtime status values', () => {
    expect(isPersonStatus('ACTIVE')).toBe(true);
    expect(isPersonStatus('READER')).toBe(false);
    expect(canTransitionPersonStatus('ACTIVE', 'READER' as PersonStatus)).toBe(false);
    expect(
      stateErrorCode(() => assertPersonStatusTransition('ACTIVE', 'READER' as PersonStatus)),
    ).toBe('INVALID_STATUS_VALUE');
  });
});

describe('default person visibility', () => {
  it('filters MERGED and DELETED persons by default', () => {
    const persons = [
      { id: 'active', status: 'ACTIVE' as PersonStatus },
      { id: 'merged', status: 'MERGED' as PersonStatus },
      { id: 'deleted', status: 'DELETED' as PersonStatus },
    ];

    expect(filterDefaultVisiblePersons(persons).map((person) => person.id)).toEqual([
      'active',
    ]);
    expect(isDefaultVisiblePerson(persons[0])).toBe(true);
    expect(isDefaultVisiblePerson(persons[1])).toBe(false);
    expect(buildDefaultPersonFilter()).toEqual({ status: 'ACTIVE' });
  });
});

describe('merge eligibility', () => {
  it('allows two distinct ACTIVE persons in the same family', () => {
    expect(evaluateMergeEligibility(candidate(), candidate({ id: 'person-target' }))).toEqual({
      allowed: true,
      code: null,
      message: null,
    });
    expect(() =>
      assertCanMergePersons(candidate(), candidate({ id: 'person-target' })),
    ).not.toThrow();
  });

  it('rejects self-merge and cross-family merge', () => {
    expect(
      evaluateMergeEligibility(candidate(), candidate()),
    ).toMatchObject({ allowed: false, code: 'SELF_MERGE' });
    expect(
      evaluateMergeEligibility(candidate(), candidate({ id: 'person-target', familyId: 'family-2' })),
    ).toMatchObject({ allowed: false, code: 'CROSS_FAMILY_MERGE' });
  });

  it('rejects inactive source or target', () => {
    expect(
      evaluateMergeEligibility(
        candidate({ status: 'MERGED' }),
        candidate({ id: 'person-target' }),
      ),
    ).toMatchObject({ allowed: false, code: 'SOURCE_NOT_ACTIVE' });
    expect(
      evaluateMergeEligibility(
        candidate(),
        candidate({ id: 'person-target', status: 'DELETED' }),
      ),
    ).toMatchObject({ allowed: false, code: 'TARGET_NOT_ACTIVE' });
  });

  it('rejects already linked persons', () => {
    expect(
      evaluateMergeEligibility(
        candidate({ mergedIntoId: 'person-target' }),
        candidate({ id: 'person-target' }),
      ),
    ).toMatchObject({ allowed: false, code: 'INVALID_MERGE_LINK' });
    expect(
      evaluateMergeEligibility(
        candidate(),
        candidate({ id: 'person-target', mergedIntoId: 'person-other' }),
      ),
    ).toMatchObject({ allowed: false, code: 'INVALID_MERGE_LINK' });
  });

  it('throws the eligibility code when merging is asserted', () => {
    expect(stateErrorCode(() => assertCanMergePersons(candidate(), candidate()))).toBe(
      'SELF_MERGE',
    );
  });
});

describe('soft delete eligibility', () => {
  it('allows only an unlinked ACTIVE person to be soft deleted', () => {
    expect(canSoftDeletePerson({ status: 'ACTIVE', mergedIntoId: null })).toBe(true);
    expect(canSoftDeletePerson({ status: 'ACTIVE' })).toBe(true);
    expect(canSoftDeletePerson({ status: 'MERGED', mergedIntoId: null })).toBe(false);
    expect(canSoftDeletePerson({ status: 'DELETED', mergedIntoId: null })).toBe(false);
    expect(canSoftDeletePerson({ status: 'ACTIVE', mergedIntoId: 'person-target' })).toBe(false);
  });

  it('throws specific errors for invalid soft-delete states', () => {
    expect(stateErrorCode(() => assertCanSoftDeletePerson({ status: 'DELETED' }))).toBe(
      'PERSON_NOT_ACTIVE',
    );
    expect(
      stateErrorCode(() =>
        assertCanSoftDeletePerson({ status: 'ACTIVE', mergedIntoId: 'person-target' }),
      ),
    ).toBe('INVALID_MERGE_LINK');
    expect(
      stateErrorCode(() => assertCanSoftDeletePerson({ status: 'ACTIVE', mergedIntoId: null })),
    ).toBeNull();
  });
});

describe('merge redirect', () => {
  it('returns the surviving person id for MERGED persons', () => {
    expect(getMergeRedirect({ status: 'MERGED', mergedIntoId: 'person-target' })).toBe(
      'person-target',
    );
    expect(getMergeRedirect({ status: 'ACTIVE', mergedIntoId: null })).toBeNull();
    expect(getMergeRedirect({ status: 'DELETED', mergedIntoId: null })).toBeNull();
    expect(getMergeRedirect({ status: 'MERGED', mergedIntoId: null })).toBeNull();
  });
});
