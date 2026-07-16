import Link from 'next/link';
import { Suspense } from 'react';
import { getCurrentOrg } from '@/lib/auth/session';
import { milestonesRepository } from '@/repositories/milestones.repository';
import { projectsRepository } from '@/repositories/projects.repository';
import { organizationsRepository } from '@/repositories/organizations.repository';
import { Button } from '@/components/ui/button';
import { MilestoneFilters } from '@/features/milestones/components/milestone-filters';
import { MilestoneCard } from '@/features/milestones/components/milestone-card';
import { buildMilestoneSections } from '@/features/milestones/grouping';
import type { Enums } from '@/types/database.types';

interface MilestonesPageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

const SECTIONS: { key: keyof ReturnType<typeof buildMilestoneSections>; title: string }[] = [
  { key: 'needsAttention', title: 'Needs Attention' },
  { key: 'overdue', title: 'Overdue' },
  { key: 'dueToday', title: 'Due Today' },
  { key: 'inProgress', title: 'In Progress' },
  { key: 'blocked', title: 'Blocked' },
  { key: 'waiting', title: 'Waiting' },
  { key: 'upcoming', title: 'Upcoming' },
  { key: 'completed', title: 'Completed' },
  { key: 'missed', title: 'Missed' },
  { key: 'cancelled', title: 'Cancelled' },
];

export default async function MilestonesPage({ searchParams }: MilestonesPageProps) {
  const org = await getCurrentOrg();
  const params = await searchParams;

  const [milestones, projects, memberRows] = await Promise.all([
    milestonesRepository.listMilestones(org.organizationId, {
      search: params.q,
      projectId: params.project,
      ownerId: params.owner,
      status: params.status as Enums<'milestone_status'> | undefined,
      health: params.health as Enums<'milestone_health'> | undefined,
      priority: params.priority as Enums<'project_priority_level'> | undefined,
      attentionMode: params.attention as Enums<'project_attention_mode'> | undefined,
    }),
    projectsRepository.listSelectable(org.organizationId),
    organizationsRepository.listMembers(org.organizationId),
  ]);

  const members = memberRows.map((m) => ({
    id: m.user_id,
    full_name: Array.isArray(m.profiles) ? m.profiles[0]?.full_name ?? null : (m.profiles as { full_name: string | null } | null)?.full_name ?? null,
  }));

  const sections = buildMilestoneSections(milestones as never);
  const hasAnyMilestones = milestones.length > 0;
  const hasFilters = Object.values(params).some(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Milestones</h1>
          <p className="text-sm text-muted-foreground">{org.organizationName} — the major outcomes each project is working toward</p>
        </div>
        <Button asChild>
          <Link href="/milestones/new">New Milestone</Link>
        </Button>
      </div>

      <Suspense fallback={null}>
        <MilestoneFilters projects={projects} members={members} />
      </Suspense>

      {!hasAnyMilestones ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">
            {hasFilters ? 'No milestones match these filters.' : 'No milestones yet. Create the first milestone to define what a project is working toward.'}
          </p>
          {!hasFilters ? (
            <Button asChild className="mt-4">
              <Link href="/milestones/new">New Milestone</Link>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {SECTIONS.map(({ key, title }) => {
            const items = sections[key];
            if (items.length === 0) return null;
            return (
              <div key={key} className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-foreground">{title} <span className="font-normal text-muted-foreground">({items.length})</span></h2>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {items.slice(0, key === 'completed' || key === 'cancelled' ? 10 : undefined).map((milestone) => (
                    <MilestoneCard key={milestone.id} milestone={milestone as never} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
