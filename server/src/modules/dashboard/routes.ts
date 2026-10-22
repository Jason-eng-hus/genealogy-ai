import { Router } from 'express';
import type { AuthConfig } from '../../config/auth.ts';
import { asyncHandler, sendSuccess } from '../../lib/http.ts';
import { requireAuth } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/rbac.ts';
import { getDashboardStats } from './service.ts';

export interface CreateDashboardRouterOptions {
  authConfig: AuthConfig;
}

export function createDashboardRouter(
  options: CreateDashboardRouterOptions,
): Router {
  const router = Router();

  router.use(requireAuth(options.authConfig));

  router.get(
    '/',
    requirePermission('DASHBOARD_VIEW'),
    asyncHandler(async (_req, res) => {
      const stats = await getDashboardStats();

      sendSuccess(res, stats);
    }),
  );

  return router;
}
