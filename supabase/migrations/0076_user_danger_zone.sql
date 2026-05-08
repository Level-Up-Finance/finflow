-- ============================================================
-- 0076_user_danger_zone.sql
--
-- user_reset_account()  — apaga todos os dados do usuário mas
--   mantém auth.users e profiles (login preservado).
-- user_delete_account() — remove o próprio registro de auth.users
--   (cascateia tudo).
-- ============================================================

-- ── Reset: apaga dados, preserva login ──
create or replace function public.user_reset_account()
returns void
language plpgsql
security definer
as $$
declare
  uid uuid := auth.uid();
begin
  -- Ordem respeita FKs; cascades cuidam dos filhos
  delete from public.transacoes              where user_id = uid;
  delete from public.pagamentos              where user_id = uid;
  delete from public.faturas_cartao          where user_id = uid;
  delete from public.contas                  where user_id = uid;
  delete from public.compromissos            where user_id = uid;
  delete from public.dividas                 where user_id = uid;
  delete from public.projetos_investimento   where user_id = uid;
  delete from public.orcamento_geral         where user_id = uid;
  delete from public.contatos                where user_id = uid;
  delete from public.subcategorias           where user_id = uid;
  delete from public.categorias              where user_id = uid;

  -- Zera campos do perfil de volta ao estado inicial
  update public.profiles
     set nome         = null,
         apelido      = null,
         bio          = null,
         foto_url     = null,
         telefone     = null,
         instagram    = null,
         twitter      = null,
         linkedin     = null,
         moeda_padrao = 'BRL',
         tema         = 'auto',
         idioma       = 'pt-BR',
         plano        = 'free'
   where id = uid;
end;
$$;

grant execute on function public.user_reset_account() to authenticated;

-- ── Delete: remove o próprio usuário permanentemente ──
create or replace function public.user_delete_account()
returns void
language plpgsql
security definer
as $$
begin
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.user_delete_account() to authenticated;
