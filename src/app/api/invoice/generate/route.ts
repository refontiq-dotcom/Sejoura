import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInvoicePdf, generateInvoiceNumber } from "@/lib/invoice-pdf";
import type { BookingWithRelations, Invoice, Tenant } from "@/types/database";

const INVOICE_BUCKET = "invoices";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

function isLegacyPublicUrl(value: string | null) {
  return Boolean(value?.startsWith("http://") || value?.startsWith("https://"));
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

    let storedPdfPath = invoice.pdf_url;
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
      const pdfBuffer = await generateInvoicePdf({ tenant: tenant as Tenant, booking: enrichedBooking, invoice });
      const objectPath = `${user.tenant_id}/${bookingId}/${invoice.id}.pdf`;
      const { error: uploadError } = await admin.storage.from(INVOICE_BUCKET).upload(objectPath, pdfBuffer, {
        contentType: "application/pdf",
        upsert: false,
      });
      if (uploadError && !/already exists/i.test(uploadError.message)) {
        return NextResponse.json({ error: `Erreur lors de l'upload du PDF: ${uploadError.message}` }, { status: 500 });
      }

      const { error: updateError } = await admin.from("invoices").update({ pdf_url: objectPath }).eq("id", invoice.id);
      if (updateError) return NextResponse.json({ error: `PDF créé mais non rattaché à la facture: ${updateError.message}` }, { status: 500 });
      storedPdfPath = objectPath;
      invoice = { ...invoice, pdf_url: objectPath };
    }

    const accessUrl = await getInvoiceAccessUrl(admin, storedPdfPath);
    return NextResponse.json({ invoice: { ...invoice, pdf_url: accessUrl }, alreadyGenerated: hadPdf });
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
    const { data: invoice, error } = await admin
      .from("invoices")
      .select("*")
      .eq("booking_id", bookingId)
      .eq("tenant_id", authorization.user.tenant_id)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Erreur lors de la récupération de la facture." }, { status: 500 });
    if (!invoice) return NextResponse.json({ invoice: null });

    const accessUrl = await getInvoiceAccessUrl(admin, invoice.pdf_url);
    return NextResponse.json({ invoice: { ...invoice, pdf_url: accessUrl } });
  } catch (err) {
    console.error("get invoice error:", err);
    return NextResponse.json({ error: "Une erreur est survenue." }, { status: 500 });
  }
}
