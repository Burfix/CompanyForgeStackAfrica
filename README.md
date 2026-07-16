# ForgeStack Founder OS

Internal operating system for running ForgeStack Africa: projects, tasks, milestones, activity, and (later) an AI executive team. Separate from the customer-facing ForgeStack platform — its own repo, its own Supabase project, its own deployment.

Full architecture, database design, auth, security, and scaling strategy: see `docs/architecture.md`.

## Stack

Next.js (App Router) · TypeScript (strict) · Tailwind CSS · shadcn/ui-based primitives · Supabase (Postgres + Auth + RLS) · Zod · React Query.

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in Supabase project values (see docs/architecture.md)
npm run dev
```

Supabase project: `ForgeStack Founder OS` (`zqsinfrgiuulxkyydeun`, `eu-central-1`).

## First user (bootstrap)

There is no public sign-up — invitations only. The very first account (yours) needs to be bootstrapped manually:

1. Create your user in Supabase Auth (dashboard → Authentication → Add user, or via magic link).
2. Insert your `organizations` row and an `organization_members` row with `role = 'owner'` pointing at your new user id.

Once that's done, you can invite everyone else from inside the app.

## Project status

Phase 1, Slice 1 (Foundation) — see `docs/architecture.md` §8 for the full delivery plan. Auth, base layout, and a read-only Founder HQ are live. Full CRUD for projects/tasks/milestones ships in the following slices.
