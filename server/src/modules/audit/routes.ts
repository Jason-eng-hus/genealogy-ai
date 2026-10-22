import { Router } from 'express';
import type { AuthConfig } from '../../config/auth.ts';
import { asyncHandler, sendSuccess } from '../../lib/http.ts';
import { parseInput } from '../../lib/validation.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/rbac.ts';
import { auditLogQuerySchema } from './schemas.ts';
import { listAuditLogs } from './service.ts';

export interface CreateAuditRouterOptions {
  authConfig: AuthConfig;
}

export function createAuditRouter(
  options: CreateAuditRouterOptions,
): Router {
  const router = Router();

  router.use(requireAuth(options.authConfig));

  router.get(
    '/',
    requirePermission('AUDIT_VIEW'),
    asyncHandler(async (req, res) => {
      const query = parseInput(auditLogQuerySchema, req.query);
      const result = await listAuditLogs(query);

      sendSuccess(res, result);
    }),
  );

  return router;
}
