/**
 * app/api/auth/[...nextauth]/route.ts
 *
 * NextAuth v4 catch-all handler. Delegates all /api/auth/* routes
 * (signin, signout, callback, session, csrf, providers ...) to NextAuth.
 */

import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth/authOptions';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
