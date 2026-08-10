-- Migration: Création du bucket storage invoices et politiques RLS
-- Date: 2026-08-10
-- Fix: Le bucket 'invoices' était mentionné dans le schéma mais jamais créé,
--      empêchant l'upload des PDF de factures.

-- 1. Création du bucket storage (public pour accès direct via URL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Politiques storage pour le bucket invoices
-- Nettoyage préventif pour éviter l'erreur "policy already exists"
DROP POLICY IF EXISTS "invoices_storage_insert_admin" ON storage.objects;
DROP POLICY IF EXISTS "invoices_storage_update_admin" ON storage.objects;
DROP POLICY IF EXISTS "invoices_storage_delete_admin" ON storage.objects;
DROP POLICY IF EXISTS "invoices_storage_select_public" ON storage.objects;

-- Seul le service role (admin) peut uploader/modifier/supprimer
CREATE POLICY "invoices_storage_insert_admin"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'invoices');

CREATE POLICY "invoices_storage_update_admin"
ON storage.objects FOR UPDATE
TO service_role
USING (bucket_id = 'invoices');

CREATE POLICY "invoices_storage_delete_admin"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'invoices');

-- Lecture publique (bucket public)
CREATE POLICY "invoices_storage_select_public"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'invoices');

-- 3. Contrainte d'unicité sur invoice_number par tenant
-- Évite les numéros en double en cas de génération simultanée
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_tenant_number
ON invoices (tenant_id, invoice_number);
