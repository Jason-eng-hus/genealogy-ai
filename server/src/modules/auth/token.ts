import jwt, { type JwtPayload } from 'jsonwebtoken';
import {
  ROLES,
  type Role,
} from '../../../../shared/src/constants/enums.ts';

export const JWT_ALGORITHM = 'HS256';
export const JWT_ISSUER = 'genealogy-ai';
export const JWT_AUDIENCE = 'genealogy-ai-web';

export interface AuthTokenClaims {
  sub: string;
  role: Role;
  pwv: string;
}

export interface AuthTokenConfig {
  secret: string;
  expiresInSeconds: number;
}

function isRole(value: unknown): value is Role {
  return (
    typeof value === 'string' &&
    (ROLES as readonly string[]).includes(value)
  );
}

export function signAuthToken(
  claims: AuthTokenClaims,
  config: AuthTokenConfig,
): string {
  return jwt.sign(
    {
      role: claims.role,
      pwv: claims.pwv,
    },
    config.secret,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: config.expiresInSeconds,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      subject: claims.sub,
    },
  );
}

export function verifyAuthToken(
  token: string,
  config: Pick<AuthTokenConfig, 'secret'>,
): AuthTokenClaims | null {
  try {
    const decoded = jwt.verify(token, config.secret, {
      algorithms: [JWT_ALGORITHM],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    if (typeof decoded === 'string') {
      return null;
    }

    const payload = decoded as JwtPayload & Record<string, unknown>;
    const subject = payload.sub;
    const role = payload.role;
    const fingerprint = payload.pwv;

    if (
      typeof subject !== 'string' ||
      subject === '' ||
      !isRole(role) ||
      typeof fingerprint !== 'string' ||
      fingerprint === ''
    ) {
      return null;
    }

    return {
      sub: subject,
      role,
      pwv: fingerprint,
    };
  } catch {
    return null;
  }
}
