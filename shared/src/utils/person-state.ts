import { PERSON_STATUSES, type PersonStatus } from '../constants/enums';

export type PersonStateErrorCode =
  | 'INVALID_STATUS_VALUE'
  | 'INVALID_STATUS_TRANSITION'
  | 'SELF_MERGE'
  | 'CROSS_FAMILY_MERGE'
  | 'SOURCE_NOT_ACTIVE'
  | 'TARGET_NOT_ACTIVE'
  | 'INVALID_MERGE_LINK'
  | 'PERSON_NOT_ACTIVE';

export class PersonStateError extends Error {
  readonly code: PersonStateErrorCode;

  constructor(code: PersonStateErrorCode, message: string) {
    super(message);
    this.name = 'PersonStateError';
    this.code = code;
  }
}

export interface PersonStateLike {
  status: PersonStatus;
  mergedIntoId?: string | null;
}

export interface MergeCandidate extends PersonStateLike {
  id: string;
  familyId: string;
}

export type MergeEligibility =
  | { allowed: true; code: null; message: null }
  | { allowed: false; code: PersonStateErrorCode; message: string };

const PERSON_STATUS_TRANSITIONS: Readonly<Record<PersonStatus, readonly PersonStatus[]>> = {
  ACTIVE: ['MERGED', 'DELETED'],
  MERGED: [],
  DELETED: [],
};

export function isPersonStatus(value: string): value is PersonStatus {
  return (PERSON_STATUSES as readonly string[]).includes(value);
}

export function canTransitionPersonStatus(
  from: PersonStatus,
  to: PersonStatus,
): boolean {
  if (!isPersonStatus(from) || !isPersonStatus(to)) {
    return false;
  }
  return from === to || PERSON_STATUS_TRANSITIONS[from].includes(to);
}

export function assertPersonStatusTransition(
  from: PersonStatus,
  to: PersonStatus,
): void {
  if (!isPersonStatus(from) || !isPersonStatus(to)) {
    throw new PersonStateError('INVALID_STATUS_VALUE', '人物状态不是受支持的值');
  }
  if (!canTransitionPersonStatus(from, to)) {
    throw new PersonStateError(
      'INVALID_STATUS_TRANSITION',
      `人物状态不能从 ${from} 变更为 ${to}`,
    );
  }
}

export function isDefaultVisiblePersonStatus(status: PersonStatus): boolean {
  return status === 'ACTIVE';
}

export function isDefaultVisiblePerson(person: { status: PersonStatus }): boolean {
  return isDefaultVisiblePersonStatus(person.status);
}

export function filterDefaultVisiblePersons<T extends { status: PersonStatus }>(
  persons: readonly T[],
): T[] {
  return persons.filter(isDefaultVisiblePerson);
}

export function buildDefaultPersonFilter(): { status: PersonStatus } {
  return { status: 'ACTIVE' };
}

export function evaluateMergeEligibility(
  source: MergeCandidate,
  target: MergeCandidate,
): MergeEligibility {
  const deny = (code: PersonStateErrorCode, message: string): MergeEligibility => ({
    allowed: false,
    code,
    message,
  });

  if (!isPersonStatus(source.status) || !isPersonStatus(target.status)) {
    return deny('INVALID_STATUS_VALUE', '人物状态不是受支持的值');
  }
  if (source.id === target.id) {
    return deny('SELF_MERGE', '不能将人物合并到自身');
  }
  if (source.familyId !== target.familyId) {
    return deny('CROSS_FAMILY_MERGE', '不能跨家族合并人物');
  }
  if (source.status !== 'ACTIVE') {
    return deny('SOURCE_NOT_ACTIVE', '只有 ACTIVE 人物可以作为被合并方');
  }
  if (target.status !== 'ACTIVE') {
    return deny('TARGET_NOT_ACTIVE', '只有 ACTIVE 人物可以作为保留方');
  }
  if (source.mergedIntoId !== null && source.mergedIntoId !== undefined) {
    return deny('INVALID_MERGE_LINK', '被合并方已经存在合并指向');
  }
  if (target.mergedIntoId !== null && target.mergedIntoId !== undefined) {
    return deny('INVALID_MERGE_LINK', '保留方已经存在合并指向');
  }

  return { allowed: true, code: null, message: null };
}

export function assertCanMergePersons(
  source: MergeCandidate,
  target: MergeCandidate,
): void {
  const eligibility = evaluateMergeEligibility(source, target);
  if (!eligibility.allowed) {
    throw new PersonStateError(eligibility.code, eligibility.message);
  }
}

export function canSoftDeletePerson(person: PersonStateLike): boolean {
  return person.status === 'ACTIVE' &&
    (person.mergedIntoId === null || person.mergedIntoId === undefined);
}

export function assertCanSoftDeletePerson(person: PersonStateLike): void {
  if (!isPersonStatus(person.status)) {
    throw new PersonStateError('INVALID_STATUS_VALUE', '人物状态不是受支持的值');
  }
  if (person.status !== 'ACTIVE') {
    throw new PersonStateError('PERSON_NOT_ACTIVE', '只有 ACTIVE 人物可以软删除');
  }
  if (person.mergedIntoId !== null && person.mergedIntoId !== undefined) {
    throw new PersonStateError('INVALID_MERGE_LINK', '已存在合并指向的人物不能软删除');
  }
}

export function getMergeRedirect(person: PersonStateLike): string | null {
  if (person.status !== 'MERGED') {
    return null;
  }
  return person.mergedIntoId ?? null;
}
