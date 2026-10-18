-- ============================================================================
-- SÉJOURA — Protéger l'historique des réservations à la suppression d'une chambre
--
-- Avant : bookings.room_id → rooms(id) ON DELETE CASCADE. Supprimer une chambre
-- effaçait en silence toutes ses réservations (et, par cascade, ce qui en
-- dépend : factures, paiements…), donc l'historique et la comptabilité.
--
-- Après : ON DELETE NO ACTION. Une chambre qui a des réservations ne peut plus
-- être supprimée (erreur 23503) ; l'interface l'explique avant même le clic.
-- NO ACTION (et non RESTRICT) est voulu : le contrôle a lieu en fin
-- d'instruction, donc supprimer un établissement ou un locataire, qui supprime
-- chambres ET réservations dans la même instruction, continue de fonctionner.
--
-- Idempotente : peut être rejouée sans effet de bord.
-- ============================================================================
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid  = 'public.bookings'::regclass
    AND confrelid = 'public.rooms'::regclass
    AND contype   = 'f'
    AND confdeltype = 'c'          -- 'c' = CASCADE ; déjà corrigé si absent
    AND conkey = ARRAY[(SELECT attnum FROM pg_attribute
                        WHERE attrelid = 'public.bookings'::regclass AND attname = 'room_id')]
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.bookings DROP CONSTRAINT %I', fk_name);
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_room_id_fkey
      FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE NO ACTION;
  END IF;
END $$;
