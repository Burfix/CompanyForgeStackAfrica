# ForgeStack Founder OS — Phase 1 Architecture

**Status:** Slice 1 (Foundation) implemented. Supabase project provisioned, migrations applied, auth + base layout + read-only Founder HQ live.
**Prepared for:** Thami Gumpo, Founder, ForgeStack Africa
**Scope:** Internal company-operating-system app, separate from the customer-facing ForgeStack platform.

---

## 1. What This Is (and Isn't)

Founder OS is an internal, single-tenant-today-but-multi-tenant-shaped application that runs ForgeStack Africa itself: projects, tasks, milestones, activity, and eventually an AI executive team. It is architecturally independent from the ForgeStack customer platform — separate repo, separate Supabase project, separate deployment. Nothing here touches production customer data.

It is explicitly **not** Phase-1 scope: no AI agents, no attachments storage, no cross-org portfolio features. Those are designed for, not built.

## 2. Architecture Decisions (with rationale)

**Organisation entity from day one, even with one org.** You'll likely run one org (ForgeStack Africa) for a long time. I'm still modeling `organizations` as a first-class table with membership and RLS scoped to it, because retrofitting tenancy into a system that assumed a single implicit tenant is a rewrite, not a migration. Cost of doing it now: negligible. Cost of doing it later: a data migration under time pressure.

**Next.js App Router, Server Components by default.** Dashboards (Founder HQ) are read-heavy and benefit from server-rendered data fetching with no client-side waterfall. Client Components are used only where interaction demands it (command palette, forms, optimistic task updates).

**Supabase as the single source of truth, RLS as the real authorization layer.** Authorization logic lives in Postgres policies, not scattered across API routes. This means even a bug in application code can't leak cross-org data — the database itself refuses the query.

**Repository pattern between Supabase and the app.** Server Actions and route handlers never call `supabase.from(...)` directly. They call a repository function (`projectsRepository.list()`, `tasksRepository.create()`).

**Service layer above repositories.** Repositories do CRUD. Services enforce business rules that span tables — e.g., creating a project writes an activity event as a side effect.

**Zod schemas as the validation boundary, not a formality.** Every Server Action validates input against a Zod schema before it reaches a repository.

**Activity timeline as an append-only event log, not a derived view.** Every meaningful mutation explicitly writes an `activity_events` row. This is the audit trail today and the data feed for AI agents later.

**Focus levels and priority score are separate concepts.** Focus level (1–5) is a manual, coarse operator signal. Priority score is a plain numeric column in Phase 1; a computed-score function is a Phase 2 concern, not a schema change.

**React Query for client-side cache, Server Components for first paint.** Slice 1 pages are server-rendered only; React Query gets wired in starting Slice 2 for interactive mutations (marking a task done, moving focus level) with optimistic updates.

## 3. Folder Structure (as implemented)

```
founder-os/
├── app/
│   ├── (auth)/login/{page.tsx, actions.ts}
│   ├── (app)/
│   │   ├── layout.tsx            # sidebar shell, org context
│   │   ├── page.tsx               # Founder HQ
│   │   ├── projects/page.tsx
│   │   ├── tasks/page.tsx
│   │   └── activity/page.tsx
│   └── globals.css
├── repositories/                  # one file per table, only place Supabase is called
│   ├── organizations.repository.ts
│   ├── projects.repository.ts
│   ├── tasks.repository.ts
│   ├── milestones.repository.ts
│   └── activity.repository.ts
├── services/
│   └── project.service.ts         # cross-table rules (create project → write activity event)
├── components/
│   ├── ui/                        # button, card, input, label
│   └── shared/                    # status-badge (HealthPill, FocusLevelBadge)
├── lib/
│   ├── supabase/{server.ts, client.ts, middleware.ts}
│   ├── auth/session.ts            # requireUser(), getCurrentOrg()
│   └── errors.ts                  # operator-safe error mapping
├── types/database.types.ts        # generated from the live Supabase schema
├── schemas/project.schema.ts
├── supabase/migrations/           # 0001–0004, applied in order
├── middleware.ts
└── docs/architecture.md           # this file
```

`features/`, `hooks/`, and per-entity schemas beyond `project.schema.ts` land as Slices 2–4 add tasks and milestones CRUD — no need to scaffold empty folders ahead of the code that fills them.

## 4. Database Design (as applied)

### Entities

```
organizations
   └─< organization_members >── profiles (extends auth.users)
   └─< invitations
   └─< projects
         ├─< project_members >── profiles
         ├─< milestones
         └─< tasks >── profiles (assignee)
   └─< activity_events
```

Every tenant-scoped table carries `organization_id` directly (denormalized onto `tasks` and `milestones`) so RLS policies never need a join.

### Migrations applied to the live Supabase project (`ForgeStack Founder OS`, `zqsinfrgiuulxkyydeun`, `eu-central-1`)

- **0001_founder_os_core** — `organizations`, `profiles`, `organization_members`, `invitations`, `projects`, `project_members`, `milestones`, `tasks`, `activity_events`, `updated_at` triggers, and a trigger that auto-creates a `profiles` row on new `auth.users` signup.
- **0002_founder_os_rls** — RLS enabled on every table, `is_org_member()` / `org_role_at_least()` helper functions, and org-scoped policies for every table.
- **0003_founder_os_hardening** — fixes from the Supabase security advisor: pinned `search_path` on trigger functions, revoked public/anon/authenticated execute on the internal trigger function.
- **0004_founder_os_private_schema** — moved `is_org_member()` / `org_role_at_least()` into a `private` schema so they are not reachable via PostgREST's `/rest/v1/rpc/` endpoint at all, closing the last advisor warning (RLS policies keep working unchanged — Postgres resolves policy expressions to function OIDs at creation time).

Post-migration security advisor result: **zero open findings.**

One correction from the original design draft: the initial sketch of `org_role_at_least` relied on Postgres enum ordering (`role <= min_role`), flagged in the design doc as ambiguous. The applied version uses an explicit rank mapping (`case role when 'owner' then 4 ...`) instead — unambiguous to audit, no dependency on enum declaration order.

See `supabase/migrations/*.sql` for full DDL.

## 5. Authentication

Supabase Auth, email/password. No public sign-up — invitations only (`invitations` table, admin-created, token-based). Flow:

1. Admin/owner creates an invitation row (Slice 2+; not yet wired to a UI in Slice 1).
2. Invitee accepts via `/invite/[token]` (not yet built), which creates their `organization_members` row using the service-role client, since they have no org membership yet for RLS to allow it.
3. `middleware.ts` checks the Supabase session on every request; unauthenticated requests redirect to `/login`.
4. `lib/auth/session.ts: getCurrentOrg()` resolves the current org server-side — Phase 1 has one org per user, but every caller already goes through this function so multi-org switching later is additive, not a rewrite.

**Bootstrap note:** since there's no public sign-up, the very first user (you) has to be created manually — see `README.md` → "First user (bootstrap)".

Role model: `owner`, `admin`, `member`, `viewer`. Enforced in RLS (the real gate) and mirrored in UI (hide actions a role can't perform) once role-aware UI ships in a later slice.

## 6. Security

- **RLS is the authorization boundary**, not application code. Verified via Supabase's security advisor: zero open findings after 0004.
- **RLS helper functions are not publicly callable.** Moved to a `private` schema (0004) specifically so nobody can call `is_org_member(uuid)` as a bare RPC to probe org membership outside a real query.
- **Service role key never reaches the client.** `lib/supabase/server.ts` exposes `createServiceRoleClient()` as a named, commented exception — not a default. Stored only in `.env.local` (gitignored); not yet filled in since Slice 1 has no invitation-acceptance flow that needs it yet.
- **Operator-facing error handling.** `lib/errors.ts` maps Postgres error codes to plain-language messages; the login Server Action never returns Supabase's raw auth error text (which can leak whether an email exists).
- **Input validation at the boundary.** `schemas/project.schema.ts` + Zod on every Server Action.
- **Strict TypeScript, no `any`.** `tsconfig.json` has `strict: true` and `noUncheckedIndexedAccess: true`.
- **Audit trail is structural.** `activity_events` is populated by the service layer, not derived — see `services/project.service.ts`.

## 7. Scaling Strategy

- Every foreign key and every filter/sort column used by Founder HQ (`status`, `focus_level`, `due_date`, `occurred_at`) is indexed from 0001, not added reactively.
- Activity feed queries are paginated by `occurred_at desc` with a `limit`, never a full scan.
- Denormalized `organization_id` on child tables keeps RLS policies flat as row counts grow.
- Business logic lives in the service layer, decoupled from any particular request shape — this is what makes it possible to later expose the same logic to an AI agent or a background job without rewriting it.

## 8. Phase 1 Delivery Plan

1. **Foundation (done)** — repo scaffold, Supabase project, migrations 0001–0004, auth (login), middleware, base layout, dark theme, read-only Founder HQ / Projects / Activity pages reading live data.
2. **Projects** — full CRUD, create/edit forms, focus level + status changes, project detail page.
3. **Tasks** — CRUD, assignment, status changes, linked to projects.
4. **Milestones** — CRUD, linked to projects, surfaced on project detail.
5. **Invitations** — admin UI to invite teammates, `/invite/[token]` acceptance flow using the service-role client.
6. **Command palette** — cross-entity quick actions/search, once there's enough data to make it useful.

## 9. Open Items

- Service role key needs to be pulled from the Supabase dashboard and added to `.env.local` before Slice 5 (invitations) — deliberately not fetched automatically since it bypasses RLS entirely.
- First user bootstrap (owner account + org row) still needs to happen manually — see README.
- Vercel project + `company.forgestackafrica.dev` DNS not yet wired; deployment is a separate step once you're ready to go live with Slice 1.
