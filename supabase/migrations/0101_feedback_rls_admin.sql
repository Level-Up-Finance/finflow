-- ============================================================
-- 0101_feedback_rls_admin.sql
--
-- Finaliza o admin gating da tabela feedback (pendência #2 da
-- auditoria). Antes: SELECT/UPDATE/DELETE liberados para qualquer
-- authenticated (qualquer usuário podia ler/editar feedback alheio).
--
-- Novo modelo:
--  - SELECT: own feedback OR aprovada (públicas) OR admin
--  - UPDATE: admin only
--  - DELETE: admin only
--  - INSERT: inalterado (anon → user_id IS NULL; auth → próprio)
--
-- Páginas afetadas:
--  - feedback.js          → SELECT own (já filtrava — funciona)
--  - feedback-publico.js  → INSERT anon (sem mudança)
--  - novidades.js         → SELECT status='aprovada' (nova policy)
--  - desenvolvimento.js   → SELECT/UPDATE tudo (passou a usar guardAdmin)
--  - admin-feedback.js    → SELECT/UPDATE/DELETE tudo (já é admin)
-- ============================================================

-- ── Drop policies legadas permissivas ────────────────────────
drop policy if exists "feedback_select_authenticated" on public.feedback;
drop policy if exists "feedback_update_authenticated" on public.feedback;
drop policy if exists "feedback_delete_authenticated" on public.feedback;

-- ── SELECT: own + aprovada + admin (combinadas com OR) ───────
create policy "feedback_select_own" on public.feedback
  for select to authenticated
  using (user_id = auth.uid());

create policy "feedback_select_aprovada" on public.feedback
  for select to authenticated
  using (status = 'aprovada');

create policy "feedback_select_admin" on public.feedback
  for select to authenticated
  using (is_current_user_admin());

-- ── UPDATE: admin only ───────────────────────────────────────
create policy "feedback_update_admin" on public.feedback
  for update to authenticated
  using (is_current_user_admin())
  with check (is_current_user_admin());

-- ── DELETE: admin only ───────────────────────────────────────
create policy "feedback_delete_admin" on public.feedback
  for delete to authenticated
  using (is_current_user_admin());

-- INSERT policies (feedback_insert_anon, feedback_insert_authenticated)
-- permanecem inalteradas — já estão corretas.
