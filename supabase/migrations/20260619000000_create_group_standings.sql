create table if not exists group_standings (
    id bigint generated always as identity primary key,

    group_name text not null,
    team_id text not null,
    team_name text not null,

    position integer not null check (position between 1 and 4),

    played integer default 0,
    won integer default 0,
    drawn integer default 0,
    lost integer default 0,

    goals_for integer default 0,
    goals_against integer default 0,
    goal_difference integer default 0,

    points integer default 0,

    updated_at timestamptz default now()
);

create unique index if not exists idx_group_team
on group_standings(group_name, team_id);

create unique index if not exists idx_group_position
on group_standings(group_name, position);

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'group_standings_position_check'
          and conrelid = 'group_standings'::regclass
    ) then
        alter table group_standings
        add constraint group_standings_position_check
        check (position between 1 and 4);
    end if;
end $$;
