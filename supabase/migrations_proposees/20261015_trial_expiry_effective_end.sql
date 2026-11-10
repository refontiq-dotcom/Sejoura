-- ============================================================================
-- PROPOSITION NON EXÉCUTÉE — verrouillage automatique essai + payant
-- Contexte : sync_subscription_statuses() ne voit que subscription_status =
-- 'active' AND subscription_end_date < NOW(). Or /api/register crée
-- status='trial' avec subscription_end_date = trialEnd (nouveau) mais les
-- lignes historiques peuvent avoir subscription_end_date NULL (essai jamais
-- verrouillé) ; le cron applicatif ne regardait que status='active'.
-- Cette fonction passe à 'expired'/soft-lock tout essai ou payant dont
-- l'échéance EFFECTIVE (subscription_end_date ?? current_period_end ??
-- trial_ends_at) est dépassée, sans toucher aux pending ni aux lignes sans
-- échéance (fail-open). À appliquer par un admin Supabase (migration),
-- JAMAIS exécutée ici.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.sync_subscription_statuses()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.subscriptions
  SET subscription_status = 'expired',
      is_soft_locked = TRUE,
      status = CASE
        WHEN status IN ('trial'::public.subscription_status, 'active'::public.subscription_status)
        THEN 'suspended'::public.subscription_status
        ELSE status
      END,
      updated_at = NOW()
  WHERE subscription_status = 'active'
    AND COALESCE(subscription_end_date, current_period_end, trial_ends_at) IS NOT NULL
    AND COALESCE(subscription_end_date, current_period_end, trial_ends_at) < NOW()
    AND COALESCE(is_soft_locked, FALSE) = FALSE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;
