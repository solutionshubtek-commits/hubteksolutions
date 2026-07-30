-- ============================================================================
-- 009_horarios_turnos.sql
--
-- Horário de funcionamento com intervalo (almoço) e horário de fim de semana.
--
-- Antes só existiam `horario_inicio` e `horario_fim`: uma janela contínua, igual
-- todos os dias. Empresa que para para o almoço ou atende em horário diferente
-- no sábado não tinha como representar isso, e o agente oferecia horários que a
-- empresa não atende.
--
-- ADITIVO DE PROPÓSITO. Todas as colunas são NULL por padrão, e NULL significa
-- exatamente o comportamento de hoje: janela única, sem pausa, mesmo horário
-- todos os dias. Tenant que nunca abrir a tela de treinamento continua se
-- comportando igual. `horario_inicio`/`horario_fim` seguem sendo a abertura e o
-- fechamento do dia, então qualquer consulta que leia só esses dois campos
-- continua vendo um intervalo correto — apenas mais largo, por desconhecer a
-- pausa.
-- ============================================================================

-- Intervalo (almoço) nos dias de semana. Os dois precisam estar preenchidos
-- para valer; preenchimento parcial é ignorado por lib/horarios.ts.
alter table agent_config add column if not exists horario_intervalo_inicio time;
alter table agent_config add column if not exists horario_intervalo_fim    time;

-- Fim de semana com horário próprio. Com `false` (padrão), sábado e domingo
-- seguem o mesmo horário dos demais dias — comportamento atual.
alter table agent_config add column if not exists fds_horario_diferente boolean default false;
alter table agent_config add column if not exists horario_fds_inicio            time;
alter table agent_config add column if not exists horario_fds_fim               time;
alter table agent_config add column if not exists horario_fds_intervalo_inicio  time;
alter table agent_config add column if not exists horario_fds_intervalo_fim     time;

notify pgrst, 'reload schema';
