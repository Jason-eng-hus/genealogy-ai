import { Router } from 'express';
import type { AuthConfig } from '../../config/auth.ts';
import type { SecurityConfig } from '../../config/security.ts';
import { asyncHandler, sendSuccess } from '../../lib/http.ts';
import { getAuth, requireAuth } from '../../middleware/auth.ts';
import { requirePermission } from '../../middleware/rbac.ts';
import { requireTrustedRequest } from '../../middleware/security.ts';
import { validateBody, validateParams } from '../../middleware/validate.ts';
import { createAuditRequestContext } from '../../services/audit.ts';
import {
  createUser,
  listUsers,
  resetUserPassword,
  updateUser,
  type CreateUserInput,
  type UpdateUserInput,
} from './service.ts';
import {
  createUserSchema,
  resetPasswordSchema,
  updateUserSchema,
  userIdParamsSchema,
} from './schemas.ts';

export interface CreateUsersRouterOptions {
  authConfig: AuthConfig;
  security: SecurityConfig;
}

export function createUsersRouter(
  options: CreateUsersRouterOptions,
): Router {
  const router = Router();
  const trustedRequest = requireTrustedRequest(options.security);
  const idParams = validateParams(userIdParamsSchema);

  router.use(requireAuth(options.authConfig));
  router.use(requirePermission('USER_MANAGE'));

  router.get(
    '/',
    asyncHandler(async (_req, res) => {
      const items = await listUsers();

      sendSuccess(res, { items });
    }),
  );

  router.post(
    '/',
    trustedRequest,
    validateBody(createUserSchema),
    asyncHandler(async (req, res) => {
      const user = await createUser(
        req.body as CreateUserInput,
        { id: getAuth(req).user.id, role: getAuth(req).role },
        createAuditRequestContext(req, res),
      );

      sendSuccess(res, user, { status: 201 });
    }),
  );

  router.patch(
    '/:id',
    trustedRequest,
    idParams,
    validateBody(updateUserSchema),
    asyncHandler(async (req, res) => {
      const user = await updateUser(
        req.params.id,
        req.body as UpdateUserInput,
        { id: getAuth(req).user.id, role: getAuth(req).role },
        createAuditRequestContext(req, res),
      );

      sendSuccess(res, user);
    }),
  );

  router.post(
    '/:id/reset-password',
    trustedRequest,
    idParams,
    validateBody(resetPasswordSchema),
    asyncHandler(async (req, res) => {
      const { newPassword } = req.body as { newPassword: string };

      await resetUserPassword(
        req.params.id,
        newPassword,
        { id: getAuth(req).user.id, role: getAuth(req).role },
        createAuditRequestContext(req, res),
      );

      sendSuccess(res, { id: req.params.id });
    }),
  );

  return router;
}
