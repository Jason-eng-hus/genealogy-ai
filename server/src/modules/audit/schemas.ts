import { z } from 'zod';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,
  AUDIT_PAGE_SIZE_DEFAULT,
  AUDIT_PAGE_SIZE_MAX,
} from '../../../../shared/src/constants/audit.ts';

const isoDateTime = z
  .string()
  .datetime({ offset: true, message: '时间格式无效，请使用 ISO 8601 格式。' })
  .transform((value) => new Date(value));

const optionalTrimmedString = (maxLength: number) =>
  z.string().trim().min(1).max(maxLength).optional();

export const auditLogQuerySchema = z
  .strictObject({
    action: z.enum(AUDIT_ACTIONS).optional(),
    entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
    entityId: optionalTrimmedString(64),
    actor: optionalTrimmedString(64),
    from: isoDateTime.optional(),
    to: isoDateTime.optional(),
    page: z.coerce
      .number()
      .int()
      .min(1, '页码必须大于等于 1。')
      .default(1),
    pageSize: z.coerce
      .number()
      .int()
      .min(1, '每页数量必须大于等于 1。')
      .max(
        AUDIT_PAGE_SIZE_MAX,
        `每页数量不能超过 ${AUDIT_PAGE_SIZE_MAX}。`,
      )
      .default(AUDIT_PAGE_SIZE_DEFAULT),
  })
  .superRefine((value, context) => {
    if (
      value.from !== undefined &&
      value.to !== undefined &&
      value.from.getTime() > value.to.getTime()
    ) {
      context.addIssue({
        code: 'custom',
        path: ['from'],
        message: '开始时间不能晚于结束时间。',
      });
    }
  });

export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;
