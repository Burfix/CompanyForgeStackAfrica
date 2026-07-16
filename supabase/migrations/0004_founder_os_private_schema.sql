-- 0004_founder_os_private_schema.sql
-- Move RLS helper functions out of the `public` schema entirely so they
-- are not reachable via PostgREST's /rest/v1/rpc/ endpoint at all. Existing
-- RLS policies keep working unchanged — Postgres resolves policy
-- expressions to function OIDs at creation time, not by name lookup, so
-- moving the schema does not require recreating any policy.

create schema if not exists private;

alter function is_org_member(uuid) set schema private;
alter function org_role_at_least(uuid, org_role) set schema private;

revoke all on function private.is_org_member(uuid) from public, anon, authenticated;
revoke all on function private.org_role_at_least(uuid, org_role) from public, anon, authenticated;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.org_role_at_least(uuid, org_role) to authenticated;
