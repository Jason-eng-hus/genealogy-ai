import type { AuthContext } from '../middleware/auth.ts';

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export {};
