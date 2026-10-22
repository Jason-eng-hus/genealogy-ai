import { createHmac, timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';

export const BCRYPT_COST = 12;

const DUMMY_PASSWORD_HASH =
  '$2b$12$o2Zt47aDmsj5ms2ZOS8WEegj4aIU76uXKkobWgHPytVro2oKVb9Za';

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export async function performDummyPasswordCheck(
  password: string,
): Promise<void> {
  await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
}

export function passwordFingerprint(
  secret: string,
  passwordHash: string,
): string {
  return createHmac('sha256', secret).update(passwordHash).digest('base64url');
}

export function fingerprintsMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

export function isBcryptCostAtLeastTwelve(passwordHash: string): boolean {
  const match = /^\$2[aby]\$(\d{2})\$/.exec(passwordHash);

  return match !== null && Number(match[1]) >= BCRYPT_COST;
}
