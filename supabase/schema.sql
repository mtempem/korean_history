-- 한능검 기출노트: 사용자별 풀이 기록 (Supabase 대시보드 > SQL Editor 에 붙여 넣고 Run)
-- 한 줄 = 한 사람의 한 문항: 고른 답, 채점 여부, 필기
create table if not exists public.progress (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  round      smallint    not null check (round between 1 and 200),
  q          smallint    not null check (q between 1 and 50),
  pick       smallint    check (pick between 1 and 5),
  graded     boolean     not null default false,
  note       text        check (char_length(note) <= 20000),
  updated_at timestamptz not null default now(),
  primary key (user_id, round, q)
);

-- 'Automatically expose new tables'를 끈 프로젝트에서도 동작하도록 로그인 사용자에게만 명시적으로 권한을 준다
revoke all on public.progress from anon;
grant select, insert, update, delete on public.progress to authenticated;

-- 보안 규칙: 로그인한 사람은 자기 기록만 읽고 쓸 수 있다
alter table public.progress enable row level security;

drop policy if exists "own rows: select" on public.progress;
drop policy if exists "own rows: insert" on public.progress;
drop policy if exists "own rows: update" on public.progress;
drop policy if exists "own rows: delete" on public.progress;

create policy "own rows: select" on public.progress for select to authenticated using (user_id = auth.uid());
create policy "own rows: insert" on public.progress for insert to authenticated with check (user_id = auth.uid());
create policy "own rows: update" on public.progress for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own rows: delete" on public.progress for delete to authenticated using (user_id = auth.uid());
