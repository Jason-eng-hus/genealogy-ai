import { z } from 'zod';
import {
  displayNameSchema,
  passwordSchema,
  roleSchema,
  usernameSchema,
} from '../auth/schemas.ts';

export const createUserSchema = z.strictObject({
  username: usernameSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  role: roleSchema,
});

export const updateUserSchema = z
  .strictObject({
    displayName: displayNameSchema.optional(),
    role: roleSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: '至少需要修改一个字段。',
  });

export const resetPasswordSchema = z.strictObject({
  newPassword: passwordSchema,
});

export const userIdParamsSchema = z.strictObject({
  id: z.string().trim().min(1).max(64),
});
