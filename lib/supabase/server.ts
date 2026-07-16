import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/database.types';

/**
 * Server-side Supabase client for Server Components, Server Actions, and
 * Route Handlers. Reads the user's session from cookies, so RLS policies
 * evaluate against the real signed-in user — this is what makes RLS the
 * actual authorization boundary rather than a formality.
 *
 * Next's `cookies()` is async since v15 — this must be awaited by every
 * caller, so `createClient` itself is async too.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — safe to ignore because
            // middleware refreshes the session on every request.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses Row Level Security entirely.
 *
 * This is a named, audited exception to the RLS-as-authorization-boundary
 * rule — use it ONLY for operations that must run before a user has an
 * organization_members row (e.g. accepting an invitation) or for trusted
 * background/system jobs. Every call site using this client should have a
 * comment explaining why RLS cannot apply.
 *
 * NEVER import this in a Client Component or expose it to the browser.
 */
export function createServiceRoleClient() {
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return [];
        },
        setAll() {},
      },
    },
  );
}
