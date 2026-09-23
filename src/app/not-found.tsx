import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground p-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold">Page introuvable</h1>
        <p className="mt-2 text-sm text-muted-foreground">Cette page n’existe pas ou n’est plus disponible.</p>
        <Link href="/" className="inline-flex mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Retour à l’accueil
        </Link>
      </div>
    </main>
  );
}
