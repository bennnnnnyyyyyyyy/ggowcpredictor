create table group_standings (
    id bigint generated always as identity primary key,

    group_name text not null,
    team_id text not null,
    team_name text not null,

    position integer not null,

    played integer default 0,
    won integer default 0,
    drawn integer default 0, lost integer default 0,

    goals_for integer default 0,
    goals_against integer default 0,
    goal_difference integer default 0,

    points integer default 0,

    updated_at timestamptz default now()
);

create unique index idx_group_team
on group_standings(group_name, team_id);
