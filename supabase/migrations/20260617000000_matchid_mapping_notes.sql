-- Document repair for leaderboard matchId mapping.
-- apiFixtureId is populated by scripts/repair-matchids.js (API fetch required).
-- results.matchId must always equal fixtures.matchId, never worldcup26.ir game.id.

comment on column fixtures."apiFixtureId" is
  'worldcup26.ir game.id — bridge to map live API scores onto internal fixtures.matchId';

-- Optional audit: predictions with no matching result for a finished fixture
-- select p."matchId", f.team1, f.team2, r."matchId" as result_match_id
-- from predictions p
-- join fixtures f on f."matchId" = p."matchId"
-- left join results r on r."matchId" = p."matchId"
-- where r."matchId" is null
--   and f.date < current_date;
