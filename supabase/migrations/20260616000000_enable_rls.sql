-- Enable Row Level Security (RLS) on all tables
alter table "users" enable row level security;
alter table "fixtures" enable row level security;
alter table "predictions" enable row level security;
alter table "results" enable row level security;
alter table "leaderboard" enable row level security;
alter table "accountRequests" enable row level security;

-- Drop existing policies if any to avoid errors on reapplying
drop policy if exists "Allow public read access on users" on "users";
drop policy if exists "Allow public write access on users" on "users";
drop policy if exists "Allow public read access on fixtures" on "fixtures";
drop policy if exists "Allow public write access on fixtures" on "fixtures";
drop policy if exists "Allow public read access on predictions" on "predictions";
drop policy if exists "Allow public write access on predictions" on "predictions";
drop policy if exists "Allow public read access on results" on "results";
drop policy if exists "Allow public write access on results" on "results";
drop policy if exists "Allow public read access on leaderboard" on "leaderboard";
drop policy if exists "Allow public write access on leaderboard" on "leaderboard";
drop policy if exists "Allow public read access on accountRequests" on "accountRequests";
drop policy if exists "Allow public write access on accountRequests" on "accountRequests";

-- Policies for "users" table
create policy "Allow public read access on users" on "users"
  for select using (true);
create policy "Allow public write access on users" on "users"
  for all using (true) with check (true);

-- Policies for "fixtures" table
create policy "Allow public read access on fixtures" on "fixtures"
  for select using (true);
create policy "Allow public write access on fixtures" on "fixtures"
  for all using (true) with check (true);

-- Policies for "predictions" table
create policy "Allow public read access on predictions" on "predictions"
  for select using (true);
create policy "Allow public write access on predictions" on "predictions"
  for all using (true) with check (true);

-- Policies for "results" table
create policy "Allow public read access on results" on "results"
  for select using (true);
create policy "Allow public write access on results" on "results"
  for all using (true) with check (true);

-- Policies for "leaderboard" table
create policy "Allow public read access on leaderboard" on "leaderboard"
  for select using (true);
create policy "Allow public write access on leaderboard" on "leaderboard"
  for all using (true) with check (true);

-- Policies for "accountRequests" table
create policy "Allow public read access on accountRequests" on "accountRequests"
  for select using (true);
create policy "Allow public write access on accountRequests" on "accountRequests"
  for all using (true) with check (true);
