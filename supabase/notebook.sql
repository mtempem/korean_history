-- 필기장(시대별 타임라인 필기) 테이블 — Supabase 대시보드 > SQL Editor 에 붙여 넣고 Run
-- 한 줄 = 한 사람의 한 필기(id = '나라|왕', 예: '신라|지증왕')
create table if not exists public.notebook (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null check (char_length(id) <= 100),
  body       text        check (char_length(body) <= 200000),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

revoke all on public.notebook from anon;
grant select, insert, update, delete on public.notebook to authenticated;

alter table public.notebook enable row level security;

drop policy if exists "own notes: select" on public.notebook;
drop policy if exists "own notes: insert" on public.notebook;
drop policy if exists "own notes: update" on public.notebook;
drop policy if exists "own notes: delete" on public.notebook;

create policy "own notes: select" on public.notebook for select to authenticated using (user_id = auth.uid());
create policy "own notes: insert" on public.notebook for insert to authenticated with check (user_id = auth.uid());
create policy "own notes: update" on public.notebook for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own notes: delete" on public.notebook for delete to authenticated using (user_id = auth.uid());
