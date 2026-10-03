-- Teacher/admin student dashboard access.
-- Roles are read from profiles; teacher codes are linked to auth users in teachers.user_id.
alter table public.teachers
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create unique index if not exists teachers_user_id_uidx
  on public.teachers(user_id)
  where user_id is not null;

create index if not exists profiles_teacher_ref_code_idx
  on public.profiles(teacher_ref_code)
  where role = 'student';

do $$
declare
  affected_rows integer;
begin
  update public.teachers
  set user_id = 'fea14ee4-26af-4219-ad9d-81ed8b432187'::uuid
  where ref_code = 'andzhela';

  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
    raise exception 'Expected exactly one Anzhela teacher row to map; updated % rows', affected_rows;
  end if;
end;
$$;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_current_user_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.role = 'admin'
  );
$$;

revoke all on function private.is_current_user_admin() from public, anon, authenticated;
grant execute on function private.is_current_user_admin() to authenticated;

drop policy if exists teachers_select_own_assignment on public.teachers;
create policy teachers_select_own_assignment
  on public.teachers
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists profiles_admin_select_students on public.profiles;
create policy profiles_admin_select_students
  on public.profiles
  for select
  to authenticated
  using (role = 'student' and private.is_current_user_admin());

drop policy if exists profiles_teacher_select_referred_students on public.profiles;
create policy profiles_teacher_select_referred_students
  on public.profiles
  for select
  to authenticated
  using (
    role = 'student'
    and exists (
      select 1
      from public.teachers t
      where t.user_id = (select auth.uid())
        and t.ref_code = profiles.teacher_ref_code
    )
  );

drop policy if exists user_stats_admin_select_students on public.user_stats;
create policy user_stats_admin_select_students
  on public.user_stats
  for select
  to authenticated
  using (
    private.is_current_user_admin()
    and exists (
      select 1
      from public.profiles p
      where p.user_id = user_stats.user_id
        and p.role = 'student'
    )
  );

drop policy if exists user_stats_teacher_select_referred_students on public.user_stats;
create policy user_stats_teacher_select_referred_students
  on public.user_stats
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.profiles p
      join public.teachers t
        on t.user_id = (select auth.uid())
       and t.ref_code = p.teacher_ref_code
      where p.user_id = user_stats.user_id
        and p.role = 'student'
    )
  );

create or replace function public.get_student_success_summary()
returns table (
  user_id uuid,
  answered_count bigint,
  correct_count bigint
)
language sql
stable
security invoker
set search_path = pg_catalog, public, pg_temp
as $$
  select
    s.user_id,
    count(*) filter (where s.correct is not null) as answered_count,
    count(*) filter (where s.correct is true) as correct_count
  from public.user_stats s
  group by s.user_id;
$$;

revoke all on function public.get_student_success_summary() from public, anon, authenticated;
grant execute on function public.get_student_success_summary() to authenticated;
