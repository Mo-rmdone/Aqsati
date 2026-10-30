-- Run flip_overdue() nightly from inside Postgres via pg_cron, instead of from
-- the Cloudflare Worker.
--
-- The Worker used to POST /rest/v1/rpc/flip_overdue with the service-role key,
-- which meant a bypass-everything secret had to live in Cloudflare. Scheduling
-- it here needs no key at all: pg_cron runs as the database owner, which can
-- already execute flip_overdue() (it's only revoked from anon/authenticated).
--
-- The Worker stays, but only as a keepalive ping with the public anon key — the
-- free tier pauses a project after ~7 days without API traffic, and pg_cron
-- activity inside the database does not count as traffic.
create extension if not exists pg_cron;

-- 01:00 UTC = 03:00 Cairo, same slot the Worker used.
select cron.schedule('flip-overdue', '0 1 * * *', 'select public.flip_overdue()');
