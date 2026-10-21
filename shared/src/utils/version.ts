export class VersionConflictError extends Error {
  readonly code = 'VERSION_CONFLICT';
  readonly currentVersion: number;
  readonly expectedVersion: number;

  constructor(currentVersion: number, expectedVersion: number) {
    super(`版本冲突：当前版本为 ${currentVersion}，请求版本为 ${expectedVersion}`);
    this.name = 'VersionConflictError';
    this.currentVersion = currentVersion;
    this.expectedVersion = expectedVersion;
  }
}

export class InvalidVersionError extends Error {
  readonly code = 'INVALID_VERSION';
  readonly version: number;

  constructor(version: number) {
    super(`版本号必须是大于等于 1 的整数，收到 ${String(version)}`);
    this.name = 'InvalidVersionError';
    this.version = version;
  }
}

export interface VersionedWriteInput {
  currentVersion: number;
  expectedVersion: number;
}

export interface VersionedWriteResult<T> {
  version: number;
  result: T;
}

export function assertValidVersion(version: number): void {
  if (!Number.isInteger(version) || version < 1) {
    throw new InvalidVersionError(version);
  }
}

export function assertExpectedVersion(
  currentVersion: number,
  expectedVersion: number,
): void {
  assertValidVersion(currentVersion);
  assertValidVersion(expectedVersion);
  if (currentVersion !== expectedVersion) {
    throw new VersionConflictError(currentVersion, expectedVersion);
  }
}

export function incrementVersion(currentVersion: number): number {
  assertValidVersion(currentVersion);
  return currentVersion + 1;
}

export async function executeVersionedWrite<T>(
  input: VersionedWriteInput,
  write: (nextVersion: number) => Promise<T>,
): Promise<VersionedWriteResult<T>> {
  assertExpectedVersion(input.currentVersion, input.expectedVersion);
  const version = incrementVersion(input.currentVersion);
  const result = await write(version);
  return { version, result };
}
