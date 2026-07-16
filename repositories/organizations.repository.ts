import { createClient } from '@/lib/supabase/server';
import { toOperationalError } from '@/lib/errors';

/**
 * All Supabase calls for the `organizations` / `organization_members`
 * tables live here. Services and Server Actions call this module — they
 * never call `supabase.from(...)` directly.
 */
export const organizationsRepository = {
  async getById(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('organizations')
      .select('id, name, slug, created_at')
      .eq('id', organizationId)
      .single();

    if (error) throw toOperationalError(error, 'Could not load organization.');
    return data;
  },

  async listMembers(organizationId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('organization_members')
      .select('id, role, user_id, profiles(id, full_name, avatar_url)')
      .eq('organization_id', organizationId);

    if (error) throw toOperationalError(error, 'Could not load team members.');
    return data;
  },

  /**
   * Confirms a given user is actually a member of this org before letting
   * them be assigned as a project owner. Without this check, a client
   * could submit any UUID as `ownerId` and it would silently pass FK
   * validation as long as *some* profile row existed for it — this closes
   * that gap explicitly rather than relying on the foreign key alone.
   */
  async verifyOrganisationMember(organizationId: string, userId: string) {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw toOperationalError(error, 'Could not verify organization membership.');
    return !!data;
  },
};
