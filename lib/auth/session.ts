import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database.types';

type OrgRole = Database['public']['Enums']['org_role'];

export interface CurrentOrg {
  organizationId: string;
  organizationName: string;
  role: OrgRole;
}

/**
 * Returns the signed-in user or redirects to /login. Use at the top of any
 * Server Component / Server Action that requires auth — middleware already
 * blocks unauthenticated requests, but this gives a typed, non-null user to
 * work with instead of re-checking for null everywhere.
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return user;
}

/**
 * Resolves the current user's organization context.
 *
 * Phase 1 has exactly one organization per user, so this picks the first
 * membership row. The function exists as a real lookup (not a hardcoded
 * constant) specifically so that when org-switching ships later, this is
 * the only place that needs to change — every caller already goes through
 * here rather than assuming a single org.
 */
export async function getCurrentOrg(): Promise<CurrentOrg> {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('organization_members')
    .select('role, organizations(id, name)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (error || !data || !data.organizations) {
    // A signed-in user with no organization membership is a broken invite
    // flow or an orphaned account, not a normal state — surface it clearly
    // rather than silently rendering an empty dashboard.
    redirect('/login?error=no_organization');
  }

  return {
    organizationId: data.organizations.id,
    organizationName: data.organizations.name,
    role: data.role,
  };
}
