-- The API talks to Postgres as the table owner, which bypasses row level security.
-- Supabase also exposes the public schema over its Data API to anyone holding the
-- publishable key; with RLS on and no policies, that path can read and write nothing.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "devices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "memories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "summaries" ENABLE ROW LEVEL SECURITY;
