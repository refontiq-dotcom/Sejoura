import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Politique de confidentialité — Séjoura",
  description: "Protection des données personnelles de Séjoura by Refontiq.",
};

export default function PrivacyPage() {
  return <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
    <header className="sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300"><ArrowLeft className="w-4 h-4"/>Retour au portail</Link>
        <span className="text-xs font-semibold text-slate-500">Séjoura by Refontiq</span>
      </div>
    </header>
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 sm:px-10 py-8 text-white">
          <h1 className="text-2xl sm:text-3xl font-bold">Politique de confidentialité</h1>
          <p className="text-blue-100 text-sm mt-2">Version 1.0 — mise à jour : 24 septembre 2026</p>
        </div>
        <div className="px-6 sm:px-10 py-8 space-y-8 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">1. Responsable et contact</h2><p><strong>Refontiq</strong>, représentée par <strong>Dukoua N'guessan Samuel junior</strong>, conçoit et exploite Séjoura. Contact : <strong>refontiq@gmail.com</strong> — <strong>+225 01 00 37 29 00</strong>. Site : <a className="text-blue-600 underline" href="https://refontiq.com" target="_blank" rel="noopener noreferrer">refontiq.com</a>.</p><p>La présente politique tient compte notamment de la loi ivoirienne n°2013-450 du 19 juin 2013 relative à la protection des données à caractère personnel.</p></section>
          <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">2. Données traitées</h2><ul className="list-disc pl-5 space-y-1"><li>Compte : nom, e-mail, téléphone et données nécessaires à l'authentification.</li><li>Établissement : nom, adresse/localisation, pays, téléphone, devise et informations de gestion.</li><li>Exploitation : chambres, réservations, clients, séjours, factures, paiements enregistrés, dépenses, employés, tâches, notes et historiques nécessaires au fonctionnement.</li><li>Selon les fonctionnalités, les données de clients finaux peuvent comprendre identité, coordonnées, nationalité, adresse, informations de séjour et éléments d'identification saisis par l'établissement.</li><li>Données techniques nécessaires à l'authentification, à la sécurité, aux journaux et à la prévention des abus.</li></ul><p>Seules les données nécessaires aux finalités prévues doivent être saisies.</p></section>
          <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">3. Finalités</h2><ul className="list-disc pl-5 space-y-1"><li>Créer et sécuriser les comptes.</li><li>Fournir les fonctions de gestion de Séjoura.</li><li>Gérer les abonnements, paiements et demandes de support.</li><li>Prévenir la fraude, les abus et les incidents de sécurité.</li><li>Maintenir, corriger et améliorer le service.</li><li>Respecter les obligations légales et répondre aux autorités légalement habilitées.</li></ul></section>
          <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">4. Rôle des parties</h2><p>Pour les données du compte et de la relation contractuelle, Refontiq traite les données nécessaires à l'exécution du service et à ses propres obligations. Pour les données de clients finaux saisies par un établissement, celui-ci détermine généralement les finalités et Refontiq agit principalement comme prestataire technique. L'établissement reste responsable de l'information de ses clients et de la licéité de ses traitements.</p></section>
          <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">5. Destinataires</h2><p>Les données peuvent être accessibles à Refontiq et aux personnes habilitées ainsi qu'aux prestataires techniques nécessaires. Le projet Séjoura utilise <strong>Supabase</strong> pour la base de données et certaines fonctions d'infrastructure/authentification. Des services tiers peuvent intervenir pour l'hébergement, les paiements ou les notifications.</p><p>Le système peut utiliser un canal Telegram administratif pour les alertes d'inscription configurées par Refontiq. Les données transmises doivent être limitées à ce qui est nécessaire. Les données ne sont pas vendues ou louées à des fins publicitaires.</p></section>
          <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">6. Hébergement et transferts</h2><p>Les données applicatives sont conservées dans la base Supabase du projet Séjoura de Refontiq. Le projet utilise actuellement la région Supabase <strong>eu-west-3</strong>. Lorsque des données sont transférées hors de Côte d'Ivoire, Refontiq tient compte des exigences de la loi n°2013-450 et des formalités applicables auprès de l'Autorité de Protection.</p></section>
          <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">7. Conservation</h2><p>Les données sont conservées pendant la durée nécessaire au service, au compte et aux obligations légales ou contractuelles. Après fermeture, certaines données peuvent être conservées pour la preuve, la sécurité, la lutte contre la fraude ou une obligation légale. Les sauvegardes peuvent subsister temporairement selon les cycles techniques.</p></section>
          <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">8. Sécurité</h2><p>Refontiq met en œuvre des mesures techniques et organisationnelles adaptées, notamment authentification, contrôles d'accès, sécurité de la base de données, chiffrement des communications et journalisation nécessaire. Aucune sécurité Internet ne peut être garantie comme absolue.</p></section>
          <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">9. Droits</h2><p>Selon les conditions prévues par la réglementation, les personnes concernées disposent notamment de droits d'information, d'accès, de rectification, d'opposition, de suppression/effacement et, lorsque les conditions sont réunies, de portabilité.</p><p>Pour exercer un droit : <strong>+225 01 00 37 29 00</strong>. Une vérification d'identité peut être demandée. Pour les données dont un établissement est responsable, la demande peut également être adressée directement à cet établissement.</p></section>
          <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">10. Autorité de Protection</h2><p>En cas de difficulté persistante, la personne concernée peut se rapprocher de l'Autorité de Protection compétente en Côte d'Ivoire selon les procédures en vigueur.</p></section>
          <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">11. Cookies</h2><p>Séjoura utilise principalement les mécanismes nécessaires à l'authentification, à la session, à la sécurité et au fonctionnement du site. Les technologies non nécessaires destinées à la mesure ou à la publicité doivent être utilisées conformément aux règles applicables.</p></section>
          <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">12. Mise à jour</h2><p>Cette politique peut évoluer avec le service, les prestataires ou la réglementation. La version publiée indique sa date de mise à jour.</p></section>
          <div className="border-t border-slate-200 dark:border-slate-800 pt-6 flex gap-4"><Link href="/cgu" className="text-blue-600 underline">CGU</Link><Link href="/mentions-legales" className="text-blue-600 underline">Mentions légales</Link></div>
        </div>
      </div>
    </main>
  </div>;
}
