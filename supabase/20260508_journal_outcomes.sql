-- 복기장에 스캐너 저장과 결과 추적 컬럼을 추가하는 마이그레이션
alter table public.journals
  drop constraint if exists journals_source_check;

alter table public.journals
  add constraint journals_source_check
  check (source in ('manual', 'chart', 'scout'));

alter table public.journals
  add column if not exists scout_snapshot jsonb,
  add column if not exists outcome text,
  add column if not exists outcome_at timestamptz;

alter table public.journals
  drop constraint if exists journals_outcome_check;

alter table public.journals
  add constraint journals_outcome_check
  check (outcome is null or outcome in ('win', 'loss', 'breakeven', 'missed'));
