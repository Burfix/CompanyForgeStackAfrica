import { getCurrentOrg } from '@/lib/auth/session';
import { activityRepository } from '@/repositories/activity.repository';
import { formatDistanceToNow } from 'date-fns';

export default async function ActivityPage() {
  const org = await getCurrentOrg();
  const events = await activityRepository.listRecent(org.organizationId, 50);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Activity</h1>
      <div className="flex flex-col gap-3">
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
        ) : (
          events.map((event) => (
            <div key={event.id} className="flex flex-col gap-0.5 border-b border-border pb-3">
              <p className="text-sm text-foreground">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                {event.profiles?.full_name ?? 'System'} · {formatDistanceToNow(new Date(event.occurred_at), { addSuffix: true })}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
