/**
 * Seeds the seven real ForgeStack Africa projects into Founder OS.
 *
 * This is a development-only, idempotent data script — NOT a migration.
 * It uses the service-role key (bypasses RLS) because it runs outside any
 * authenticated request context. Safe to re-run: every project is keyed
 * on a stable slug with `upsert(..., { onConflict: 'organization_id,slug',
 * ignoreDuplicates: true })`, so running it twice never creates duplicates
 * and never overwrites fields you've since edited in the app.
 *
 * What this deliberately does NOT do: invent target dates, owners, success
 * metrics, priority scores, funding amounts, pilot dates, or commercial
 * terms. Every project is seeded with only the fields explicitly given —
 * everything else (owner, dates, metrics) is left null for you to fill in
 * through the app once real values exist.
 *
 * Project Intelligence fields added in migration 0006 (priority_level,
 * review_cadence, attention_mode, health, business_impact, progress_percent)
 * are likewise NOT set here — they take their column defaults (medium /
 * none / no_attention / unknown / {} / 0) and are meant to be set
 * deliberately through the app once you've actually assessed each project,
 * not guessed at seed time.
 *
 * Usage:
 *   SUPABASE_SERVICE_ROLE_KEY=... npx tsx scripts/seed-projects.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to be set
 * (both already in .env.local for local runs — this script loads them via
 * the same env, run with `dotenv -e .env.local -- npx tsx scripts/seed-projects.ts`
 * or export them in your shell first).
 */
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../types/database.types';

// Deliberately no module-level env checks or client construction — this
// file is imported by the test suite to exercise PROJECTS/buildInsertRows
// without a network call or process.exit. All of that lives inside main(),
// which only runs when the file is executed directly (see the guard at the
// bottom of the file).

interface SeedProject {
  slug: string;
  name: string;
  category: string;
  focus_level: 1 | 2 | 3 | 4 | 5;
  desired_outcome: string;
}

// focus_level reflects the priority language given for each project.
// status is intentionally 'proposed' for all seven: nothing has been
// tracked inside Founder OS yet, so 'proposed' is the only status that
// doesn't assert unverified progress.
export const PROJECTS: SeedProject[] = [
  {
    slug: 'forgestack-fundraising',
    name: 'ForgeStack Fundraising',
    category: 'fundraising',
    focus_level: 1,
    desired_outcome:
      'Secure suitable funding and strategic investor support to accelerate product hardening, customer delivery and growth.',
  },
  {
    slug: 'life-and-brand-pilot-group-rollout',
    name: 'Life&Brand Pilot and Group Rollout',
    category: 'pilot',
    focus_level: 2,
    desired_outcome:
      'Prove measurable operational value during the pilot and convert the opportunity into a multi-location Life&Brand rollout.',
  },
  {
    slug: 'sea-castle-hotel',
    name: 'Sea Castle Hotel',
    category: 'pilot',
    focus_level: 2,
    desired_outcome:
      'Complete implementation, prove measurable value for hotel operations and convert Sea Castle into a stable paying customer and reference case.',
  },
  {
    slug: 'tourvest-rollout',
    name: 'Tourvest Rollout',
    category: 'partnership',
    focus_level: 3,
    desired_outcome:
      'Validate the ForgeStack use case with Tourvest and progress toward a structured rollout across the relevant business units or locations.',
  },
  {
    slug: 'booking-com-hotel-opportunity',
    name: 'Booking.com Hotel Opportunity',
    category: 'partnership',
    focus_level: 2,
    desired_outcome:
      'Validate a repeatable hotel referral, consulting or distribution opportunity connected to Booking.com representatives without damaging the customer’s existing Booking.com relationship.',
  },
  {
    slug: 'core-platform-hardening',
    name: 'Core Platform Hardening',
    category: 'engineering',
    focus_level: 1,
    desired_outcome:
      'Improve the reliability, security, tenant isolation, observability, integration stability and enterprise readiness of the ForgeStack platform.',
  },
  {
    slug: 'forgestack-content-pr',
    name: 'ForgeStack Content and PR',
    category: 'marketing',
    focus_level: 3,
    desired_outcome:
      'Build ForgeStack credibility and market awareness through verified founder stories, product progress, pilot learnings, customer value and operational intelligence thought leadership.',
  },
];

/** Pure row-building logic, extracted for unit testing without a network call. */
export function buildInsertRows(organizationId: string, ownerId: string | null) {
  return PROJECTS.map((p) => ({
    organization_id: organizationId,
    created_by: ownerId,
    slug: p.slug,
    name: p.name,
    category: p.category,
    focus_level: p.focus_level,
    status: 'proposed' as const,
    desired_outcome: p.desired_outcome,
  }));
}

async function main() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in the environment.');
    process.exit(1);
  }

  const supabase = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name')
    .eq('slug', 'forgestack-africa')
    .single();

  if (orgError || !org) {
    console.error('Could not find organization "forgestack-africa". Has bootstrap run yet?', orgError);
    process.exit(1);
  }

  const { data: owner, error: ownerError } = await supabase
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', org.id)
    .eq('role', 'owner')
    .limit(1)
    .maybeSingle();

  if (ownerError) {
    console.error('Could not look up the org owner for created_by attribution.', ownerError);
    process.exit(1);
  }

  const rows = buildInsertRows(org.id, owner?.user_id ?? null);

  const { data, error } = await supabase
    .from('projects')
    .upsert(rows, { onConflict: 'organization_id,slug', ignoreDuplicates: true })
    .select('id, slug, name');

  if (error) {
    console.error('Seed failed:', error);
    process.exit(1);
  }

  console.log(`Seed complete for "${org.name}". Rows created this run: ${data?.length ?? 0} (existing slugs were skipped).`);
  for (const p of PROJECTS) {
    console.log(`  - ${p.slug}`);
  }
}

// Only run when executed directly (`tsx scripts/seed-projects.ts`), not
// when imported by the test suite.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
