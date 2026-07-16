import Link from 'next/link';
import { LayoutDashboard, FolderKanban, Flag, ListChecks, Activity } from 'lucide-react';
import { getCurrentOrg } from '@/lib/auth/session';

const NAV_ITEMS = [
  { href: '/', label: 'Founder HQ', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/milestones', label: 'Milestones', icon: Flag },
  { href: '/tasks', label: 'Tasks', icon: ListChecks },
  { href: '/activity', label: 'Activity', icon: Activity },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const org = await getCurrentOrg();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card">
        <div className="border-b border-border px-4 py-4">
          <p className="text-sm font-semibold text-foreground">Founder OS</p>
          <p className="text-xs text-muted-foreground">{org.organizationName}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="container py-8">{children}</div>
      </main>
    </div>
  );
}
