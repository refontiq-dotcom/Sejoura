import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInvoicePdf, generateInvoiceNumber } from "@/lib/invoice-pdf";
import type { BookingExtension, BookingWithRelations, Invoice, Tenant } from "@/types/database";

const INVOICE_BUCKET = "invoices";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function isLegacyPublicUrl(value: string | null) {
  return Boolean(value?.startsWith("http://") || value?.startsWith("https://"));
}

function generateAccessToken(): string {
  return randomBytes(24).toString("hex");
}

/**
 * Garantit qu'une facture possède un jeton d'accès public (QR Code). Si le
 * token est absent (facture héritée d'avant la migration), on en génère un et
 * on persiste la valeur. Cette fonction est idempotente et best-effort : un
 * échec n'empêche pas la génération de la facture.
 */
async function ensureAccessToken(
  admin: ReturnType<typeof createAdminClient>,
  invoice: Invoice
): Promise<Invoice> {
  if (invoice.access_token) return invoice;
  const token = generateAccessToken();
  const { data, error } = await admin
    .from("invoices")
    .update({ access_token: token })
    .eq("id", invoice.id)
    .select("*")
    .maybeSingle();
  if (error || !data) {
    // Échec du backfill : on continue sans QR Code plutôt que d'échouer.
    console.error("ensureAccessToken failed:", error);
    return invoice;
  }
  return data as Invoice;
}

async function getInvoiceAccessUrl(admin: ReturnType<typeof createAdminClient>, pdfPath: string | null) {
  if (!pdfPath) return null;
  if (isLegacyPublicUrl(pdfPath)) return pdfPath;

  const { data, error } = await admin.storage
    .from(INVOICE_BUCKET)
    .createSignedUrl(pdfPath, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) throw new Error(error?.message || "Impossible de créer le lien sécurisé du PDF.");
  return data.signedUrl;
}

async function getAuthorizedUser() {
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { error: "Vous devez être connecté.", status: 401 as const };

  const { data: user, error } = await supabase
    .from("users")
    .select("id, tenant_id, role, is_active")
    .eq("auth_user_id", session.user.id)
    .single();

  if (error || !user?.tenant_id || !user.is_active) {
    return { error: "Impossible de retrouver votre compte.", status: 400 as const };
  }
  if (user.role !== "admin_residence" && user.role !== "receptionniste") {
    return { error: "Accès réservé à la réception et aux administrateurs.", status: 403 as const };
  }
  return { user };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const bookingId = typeof body.bookingId === "string" ? body.bookingId : "";
    if (!bookingId) return NextResponse.json({ error: "ID de réservation requis." }, { status: 400 });

    const authorization = await getAuthorizedUser();
    if ("error" in authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status });
    const { user } = authorization;
    const admin = createAdminClient();

    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select("*, client:clients(*), room:rooms(*, room_type:room_types(*)), accommodation:accommodations(*)")
      .eq("id", bookingId)
      .eq("tenant_id", user.tenant_id)
      .single();

    if (bookingError || !booking) return NextResponse.json({ error: "Réservation introuvable." }, { status: 404 });
    if (!["confirmed", "checked_in", "checked_out"].includes(booking.status)) {
      return NextResponse.json({ error: "Une facture ne peut être générée que pour une réservation confirmée ou réalisée." }, { status: 409 });
    }

    const { data: tenant, error: tenantError } = await admin.from("tenants").select("*").eq("id", user.tenant_id).single();
    if (tenantError || !tenant) return NextResponse.json({ error: "Impossible de récupérer les informations de l'entreprise." }, { status: 400 });

    let { data: invoice } = await admin
      .from("invoices")
      .select("*")
      .eq("booking_id", bookingId)
      .eq("tenant_id", user.tenant_id)
      .maybeSingle();

    if (!invoice) {
      const { count } = await admin.from("invoices").select("*", { count: "exact", head: true }).eq("tenant_id", user.tenant_id);
      const invoiceNumber = generateInvoiceNumber(user.tenant_id, (count || 0) + 1);
      const { data, error } = await admin.rpc("generate_invoice", {
        p_booking_id: bookingId,
        p_user_id: user.id,
        p_invoice_number: invoiceNumber,
      });

      if (data) invoice = data as unknown as Invoice;
      if (error && !invoice) {
        // La contrainte unique protège les clics simultanés : on réutilise alors
        // la facture créée par l'autre requête au lieu d'en créer une deuxième.
        const { data: concurrentInvoice } = await admin
          .from("invoices")
          .select("*")
          .eq("booking_id", bookingId)
          .eq("tenant_id", user.tenant_id)
          .maybeSingle();
        if (concurrentInvoice) invoice = concurrentInvoice as Invoice;
        else return NextResponse.json({ error: `Erreur lors de la création de la facture: ${error.message}` }, { status: 500 });
      }
    }

    if (!invoice) return NextResponse.json({ error: "Impossible de préparer la facture." }, { status: 500 });
    {
      // Si un jeton vient d'être ajouté rétroactivement à une facture héritée
      // (PDF existant sans QR Code), on invalide le PDF en cache pour forcer
      // sa régénération avec le QR Code.
      const tokenBefore = (invoice as Invoice).access_token;
      invoice = await ensureAccessToken(admin, invoice);
      if (!tokenBefore && invoice.access_token && invoice.pdf_url && !isLegacyPublicUrl(invoice.pdf_url)) {
        const oldPath = invoice.pdf_url;
        invoice.pdf_url = null;
        await admin.from("invoices").update({ pdf_url: null }).eq("id", invoice.id);
        await admin.storage.from(INVOICE_BUCKET).remove([oldPath]).catch(() => {});
      }
    }

    // ── Synchronisation après prolongation ───────────────────────────────────
    // Si le total de la réservation a changé (prolongation, modification de
    // tarif), on recalcule la facture pour refléter le montant réel du séjour.
    const expectedAmount = booking.total_amount || 0;
    if (invoice.amount !== expectedAmount && expectedAmount > 0) {
      const taxAmount = invoice.tax_amount || 0;
      await admin
        .from("invoices")
        .update({ amount: expectedAmount, total_amount: expectedAmount + taxAmount })
        .eq("id", invoice.id);
      invoice = { ...invoice, amount: expectedAmount, total_amount: expectedAmount + taxAmount };
      // Le PDF existant est obsolète : on force sa régénération en supprimant
      // le chemin du fichier stocké.
      if (invoice.pdf_url && !isLegacyPublicUrl(invoice.pdf_url)) {
        const oldPath = invoice.pdf_url;
        invoice.pdf_url = null;
        await admin.from("invoices").update({ pdf_url: null }).eq("id", invoice.id);
        // Suppression silencieuse du fichier ancien (best-effort)
        await admin.storage.from(INVOICE_BUCKET).remove([oldPath]).catch(() => {});
      }
    }

    const storedPdfPath = invoice.pdf_url;
    const hadPdf = Boolean(storedPdfPath);
    if (!storedPdfPath) {
      const { data: buckets } = await admin.storage.listBuckets();
      if (!(buckets || []).some((bucket) => bucket.id === INVOICE_BUCKET)) {
        return NextResponse.json({ error: "Le stockage des factures n'est pas configuré." }, { status: 500 });
      }

      const enrichedBooking: BookingWithRelations = {
        ...booking,
        room_type: (booking.room as { room_type?: BookingWithRelations["room_type"] } | null)?.room_type,
        accommodation: booking.accommodation,
      } as BookingWithRelations;

      // Historique des prolongations (lignes « Prolongation 1/2/… » de la facture)
      const { data: extensions } = await admin
        .from("booking_extensions")
        .select("id, tenant_id, booking_id, previous_check_out_date, new_check_out_date, extra_nights, source, created_by, created_at")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true });

      const pdfBuffer = await generateInvoicePdf({
        tenant: tenant as Tenant,
        booking: enrichedBooking,
        invoice,
        extensions: (extensions ?? []) as unknown as BookingExtension[],
      });

      // ── Sauvegarde en arrière-plan (best-effort) ─────────────────────────
      // On enregistre le PDF dans le storage Supabase pour les téléchargements
      // futurs, mais on ne bloque pas la réponse : le PDF est retourné
      // directement au navigateur.
      const objectPath = `${user.tenant_id}/${bookingId}/${invoice.id}.pdf`;
      admin.storage.from(INVOICE_BUCKET).upload(objectPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      }).then(() =>
        admin.from("invoices").update({ pdf_url: objectPath }).eq("id", invoice.id)
      ).catch(() => {});

      // ── Retour du PDF directement au navigateur ──────────────────────────
      return new Response(new Uint8Array(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="facture-${invoice.invoice_number}.pdf"`,
          "X-Invoice-Number": invoice.invoice_number,
          "X-Already-Generated": String(hadPdf),
        },
      });
    }

    // ── Cas "déjà généré" : on sert le fichier depuis le storage ──────────
    const accessUrl = await getInvoiceAccessUrl(admin, storedPdfPath);
    if (accessUrl) {
      const pdfRes = await fetch(accessUrl);
      if (pdfRes.ok) {
        const pdfBuf = new Uint8Array(await pdfRes.arrayBuffer());
        return new Response(pdfBuf, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="facture-${invoice.invoice_number}.pdf"`,
            "X-Invoice-Number": invoice.invoice_number,
            "X-Already-Generated": "true",
          },
        });
      }
    }
    // Fallback : si le fichier est introuvable dans le storage, on régénère
    return NextResponse.json({ error: "Le fichier PDF est introuvable. Veuillez réessayer." }, { status: 404 });
  } catch (err) {
    console.error("generate_invoice error:", err);
    return NextResponse.json({ error: "Une erreur est survenue lors de la génération de la facture." }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const bookingId = new URL(request.url).searchParams.get("bookingId");
    if (!bookingId) return NextResponse.json({ error: "ID de réservation requis." }, { status: 400 });
    const authorization = await getAuthorizedUser();
    if ("error" in authorization) return NextResponse.json({ error: authorization.error }, { status: authorization.status });

    const admin = createAdminClient();
    const { data: rawInvoice, error } = await admin
      .from("invoices")
      .select("*")
      .eq("booking_id", bookingId)
      .eq("tenant_id", authorization.user.tenant_id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Erreur lors de la récupération de la facture." }, { status: 500 });
    if (!rawInvoice) return NextResponse.json({ invoice: null });
    const invoice = await ensureAccessToken(admin, rawInvoice as Invoice);

    // Si le PDF existe dans le storage, le retourner directement en binaire
    if (invoice.pdf_url && !isLegacyPublicUrl(invoice.pdf_url)) {
      const { data: fileData, error: downloadError } = await admin.storage
        .from(INVOICE_BUCKET)
        .download(invoice.pdf_url);
      if (!downloadError && fileData) {
        const pdfBuf = new Uint8Array(await fileData.arrayBuffer());
        return new Response(pdfBuf, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="facture-${invoice.invoice_number}.pdf"`,
          },
        });
      }
    }
    // Fallback : retourner le signed URL en JSON
    const accessUrl = await getInvoiceAccessUrl(admin, invoice.pdf_url);
    return NextResponse.json({ invoice: { ...invoice, pdf_url: accessUrl } });
  } catch (err) {
    console.error("get invoice error:", err);
    return NextResponse.json({ error: "Oups, un petit souci technique ! Réessayez 🤕" }, { status: 500 });
  }
}
