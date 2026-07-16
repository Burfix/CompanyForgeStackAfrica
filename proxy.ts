import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Next.js 16 renamed the middleware file convention to `proxy` (the
// exported function must be named/default-exported as `proxy`, and it now
// runs on the Node.js runtime rather than Edge). Same auth-guard behavior
// as before — see lib/supabase/middleware.ts for the actual logic.
export default async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
