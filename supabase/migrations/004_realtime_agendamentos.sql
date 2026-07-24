-- 004_realtime_agendamentos.sql
-- Habilita o Realtime (Supabase) para a aba Agendamentos/Recontatos.
-- Necessário para que mudanças feitas pelo agente (ex.: cliente confirmou,
-- cancelou ou pediu reagendamento pelo lembrete) ou por outro operador
-- reflitam na tela em tempo real, sem recarregar.
--
-- Idempotente: só adiciona a tabela à publicação se ainda não estiver.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'appointments'
  ) then
    alter publication supabase_realtime add table appointments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'scheduled_tasks'
  ) then
    alter publication supabase_realtime add table scheduled_tasks;
  end if;
end $$;
