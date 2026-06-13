/**
 * next-auth.d.ts - Module augmentation for NextAuth v4
 *
 * Extends the built-in Session and JWT types to include the `roles` claim
 * forwarded from the Azure AD app roles assertion.
 *
 * This file is picked up automatically by TypeScript (included via tsconfig
 * "**\/*.ts" glob). No import needed.
 */

import type { DefaultSession } from 'next-auth';
import type { DefaultJWT } from 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      /** Entra app roles. Defaults to ['viewer'] when no roles are assigned. */
      roles: string[];
    };
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    /** Entra app roles forwarded from the ID token 'roles' claim. */
    roles?: string[];
  }
}
