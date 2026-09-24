import { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "Mentions légales — Séjoura by Refontiq",
  description: "Mentions légales de Séjoura by Refontiq.",
};

export default function LegalPage() {
  return <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
    <header className="sticky top-0 z-20 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300"><ArrowLeft className="w-4 h-4"/>Retour au portail</Link>
        <span className="text-xs font-semibold text-slate-500">Séjoura by Refontiq</span>
      </div>
    </header>
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10"><div className="bg-white dark:bg-slate-900 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 sm:px-10 py-8 text-white"><h1 className="text-2xl sm:text-3xl font-bold">Mentions légales</h1><p className="text-blue-100 text-sm mt-2">Mise à jour : 24 septembre 2026</p></div>
      <div className="px-6 sm:px-10 py-8 space-y-7 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
        <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Éditeur</h2><p><strong>Refontiq</strong>, entreprise qui conçoit et développe des solutions SaaS, représentée par <strong>Dukoua N'guessan Samuel junior</strong>.</p><p>Téléphone : <strong>+225 01 00 37 29 00</strong>.</p><p>Site : <a className="text-blue-600 underline" href="https://refontiq.com" target="_blank" rel="noopener noreferrer">refontiq.com</a>.</p></section>
        <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Informations administratives à compléter</h2><p>La forme juridique, le numéro RCCM, le NCC/compte contribuable et l'adresse professionnelle restent à compléter. <strong>L'e-mail officiel est refontiq@gmail.com.</strong> Aucun numéro ni adresse n'est inventé. Ces éléments devront être ajoutés avant une commercialisation nécessitant des mentions légales complètes.</p></section>
        <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Hébergement</h2><p>Séjoura utilise notamment Supabase pour sa base de données. Les détails relatifs aux données et prestataires figurent dans la <Link href="/politique-confidentialite" className="text-blue-600 underline">Politique de confidentialité</Link>.</p></section>
        <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Propriété intellectuelle</h2><p>Les logiciels, interfaces, code, marque et éléments graphiques propres à Séjoura appartiennent à Refontiq ou à ses concédants et ne peuvent être reproduits ou exploités sans autorisation.</p></section>
        <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Responsabilité</h2><p>Séjoura est un outil d'aide à la gestion. L'établissement reste responsable de ses décisions, de ses clients, de ses obligations fiscales et de ses obligations réglementaires.</p></section>
        <section><h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">Contact</h2><p>Questions juridiques, contractuelles ou relatives aux données : <strong>refontiq@gmail.com</strong> — <strong>+225 01 00 37 29 00</strong>.</p></section>
        <div className="border-t border-slate-200 dark:border-slate-800 pt-6 flex gap-4"><Link href="/cgu" className="text-blue-600 underline">CGU</Link><Link href="/politique-confidentialite" className="text-blue-600 underline">Confidentialité</Link></div>
      </div>
    </div></main>
  </div>;
}
