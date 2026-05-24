-- =============================================================
-- 0125_backfill_faturas_abertas_r0.sql
--
-- Pra cada conta tipo 'Cartão de Crédito' ativa que tem
-- fec_fatura E vencimento configurados, garante que existe pelo
-- menos uma fatura "aberta" R$ 0 do mes_referencia atual.
--
-- Sem essa fatura inicial:
--   - O card do cartão em Contas fica vazio (sem badge de fatura)
--   - O pagamento mensal não é gerado em Pagamentos
--   - O fluxo "Em formação: R$ 0" não tem entry pra mostrar
--
-- Idempotente: usa unique constraint (user_id, conta_id, mes_referencia)
-- via ON CONFLICT DO NOTHING.
-- =============================================================

DO $$
DECLARE
  cartao RECORD;
  mes_ref TEXT;
  hoje DATE := CURRENT_DATE;
  dia_hoje INT;
  fec_int INT;
  venc_int INT;
  ano_ref INT;
  mes_ref_num INT;
  data_fech DATE;
  data_venc DATE;
  ano_venc INT;
  mes_venc INT;
BEGIN
  dia_hoje := EXTRACT(DAY FROM hoje)::INT;

  FOR cartao IN
    SELECT c.id, c.user_id, c.workspace_id, c.fec_fatura, c.vencimento, c.apelido, c.nome
      FROM public.contas c
     WHERE c.tipo = 'Cartão de Crédito'
       AND c.status = 'ativa'
       AND c.fec_fatura IS NOT NULL
       AND c.vencimento IS NOT NULL
  LOOP
    fec_int  := cartao.fec_fatura::INT;
    venc_int := cartao.vencimento::INT;

    -- Computa mes_referencia atual:
    --   transação.dia <= fec_fatura → fatura do MÊS atual
    --   transação.dia >  fec_fatura → fatura do PRÓXIMO mês
    ano_ref     := EXTRACT(YEAR FROM hoje)::INT;
    mes_ref_num := EXTRACT(MONTH FROM hoje)::INT;
    IF dia_hoje > fec_int THEN
      mes_ref_num := mes_ref_num + 1;
      IF mes_ref_num > 12 THEN
        mes_ref_num := 1;
        ano_ref := ano_ref + 1;
      END IF;
    END IF;
    mes_ref := ano_ref::TEXT || '-' || LPAD(mes_ref_num::TEXT, 2, '0');

    -- data_fechamento: dia fec_fatura do mes_referencia
    -- (clamped pelo último dia do mês — fevereiro etc)
    data_fech := DATE(ano_ref::TEXT || '-' || LPAD(mes_ref_num::TEXT, 2, '0') || '-01')
               + LEAST(fec_int - 1, EXTRACT(DAY FROM (DATE(ano_ref::TEXT || '-' || LPAD(mes_ref_num::TEXT, 2, '0') || '-01') + INTERVAL '1 month - 1 day'))::INT - 1);

    -- data_vencimento: dia venc do mes_referencia (próximo mês se venc < fec)
    ano_venc := ano_ref;
    mes_venc := mes_ref_num;
    IF venc_int < fec_int THEN
      mes_venc := mes_venc + 1;
      IF mes_venc > 12 THEN
        mes_venc := 1;
        ano_venc := ano_venc + 1;
      END IF;
    END IF;
    data_venc := DATE(ano_venc::TEXT || '-' || LPAD(mes_venc::TEXT, 2, '0') || '-01')
               + LEAST(venc_int - 1, EXTRACT(DAY FROM (DATE(ano_venc::TEXT || '-' || LPAD(mes_venc::TEXT, 2, '0') || '-01') + INTERVAL '1 month - 1 day'))::INT - 1);

    -- INSERT idempotente (constraint unique em user_id, conta_id, mes_referencia)
    INSERT INTO public.faturas_cartao (
      user_id, workspace_id, conta_id, mes_referencia,
      data_fechamento, data_vencimento, valor_total, status
    ) VALUES (
      cartao.user_id, cartao.workspace_id, cartao.id, mes_ref,
      data_fech, data_venc, 0, 'aberta'
    )
    ON CONFLICT (user_id, conta_id, mes_referencia) DO NOTHING;
  END LOOP;
END $$;
