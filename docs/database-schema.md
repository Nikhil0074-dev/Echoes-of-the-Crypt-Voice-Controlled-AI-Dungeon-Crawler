# Database schema (future, not wired in the MVP)

The shipped game saves to `localStorage`. This is the intended PostgreSQL schema for account-based saves.

```sql
create table users (id uuid primary key default gen_random_uuid(), username varchar(32) unique not null,
  email varchar(255) unique not null, password_hash text not null, created_at timestamptz default now());
create table player_profiles (id uuid primary key default gen_random_uuid(), user_id uuid references users on delete cascade,
  character_name varchar(40), character_class varchar(40), level int default 1, experience int default 0, gold int default 0,
  created_at timestamptz default now());
create table dungeons (id uuid primary key default gen_random_uuid(), name varchar(80), level int, map_data jsonb, created_at timestamptz default now());
create table game_sessions (id uuid primary key default gen_random_uuid(), user_id uuid references users on delete cascade,
  dungeon_id uuid references dungeons, status varchar(16) check (status in ('active','paused','completed')),
  started_at timestamptz default now(), ended_at timestamptz);
create table game_saves (id uuid primary key default gen_random_uuid(), session_id uuid references game_sessions on delete cascade,
  state jsonb not null, updated_at timestamptz default now());   -- state = the GameState JSON from @dungeon/shared
create table command_logs (id uuid primary key default gen_random_uuid(), session_id uuid references game_sessions on delete cascade,
  transcript text, intent varchar(24), command_json jsonb, execution_status varchar(16), created_at timestamptz default now());
```

`command_logs` contains spoken text: give it a short retention period and let players opt out.
`game_saves.state` is exactly what `SaveManager` writes locally, so migrating means uploading the same JSON.
