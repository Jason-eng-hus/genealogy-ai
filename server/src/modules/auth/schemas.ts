import { z } from 'zod';
import { ROLES } from '../../../../shared/src/constants/enums.ts';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const DISPLAY_NAME_MAX_LENGTH = 50;

const usernamePattern = /^[a-z0-9._-]+$/;

export const usernameSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(
    z
      .string()
      .min(USERNAME_MIN_LENGTH)
      .max(USERNAME_MAX_LENGTH)
      .regex(
        usernamePattern,
        '用户名只能包含小写字母、数字、点、下划线或连字符。',
      ),
  );

const byteLengthWithinLimit = (value: string): boolean =>
  Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `密码至少需要 ${PASSWORD_MIN_LENGTH} 个字符。`)
  .refine(
    (value) => value.trim().length >= PASSWORD_MIN_LENGTH,
    `密码至少需要 ${PASSWORD_MIN_LENGTH} 个非空白字符。`,
  )
  .refine(
    byteLengthWithinLimit,
    `密码不能超过 ${PASSWORD_MAX_BYTES} 字节。`,
  );

export const loginSchema = z.strictObject({
  username: z
    .string()
    .transform((value) => value.trim().toLowerCase())
    .pipe(z.string().min(1).max(64)),
  password: z
    .string()
    .min(1)
    .max(PASSWORD_MAX_BYTES)
    .refine(byteLengthWithinLimit, '密码格式无效。'),
});

export const changePasswordSchema = z.strictObject({
  currentPassword: z
    .string()
    .min(1)
    .max(PASSWORD_MAX_BYTES)
    .refine(byteLengthWithinLimit, '密码格式无效。'),
  newPassword: passwordSchema,
});

export const roleSchema = z.enum(ROLES);

export const displayNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(z.string().min(1).max(DISPLAY_NAME_MAX_LENGTH));

export { usernamePattern };
