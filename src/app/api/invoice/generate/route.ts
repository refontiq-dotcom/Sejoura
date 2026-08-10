import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInvoicePdf, generateInvoiceNumber } from "@/lib/invoice-pdf";
import type { Invoice, BookingWithRelations, Tenant } from "@/types/database";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const bookingId = typeof body.bookingId === "string" ? body.bookingId : "";

    if (!bookingId) {
      return NextResponse.json(
        { error: "ID de réservation requis." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Vous devez être connecté pour générer une facture." },
        { status: 401 }
      );
    }

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, tenant_id")
      .eq("auth_user_id", session.user.id)
      .single();

    if (userError || !userData?.tenant_id) {
      return NextResponse.json(
        { error: "Impossible de retrouver votre compte." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    // Vérifier qu'une facture n'existe pas déjà pour cette réservation
    const { data: existingInvoice } = await admin
      .from("invoices")
      .select("id, pdf_url, invoice_number")
      .eq("booking_id", bookingId)
      .eq("tenant_id", userData.tenant_id)
      .maybeSingle();

    if (existingInvoice?.pdf_url) {
      return NextResponse.json({
        invoice: existingInvoice,
        alreadyGenerated: true,
      });
    }

    // Récupérer la réservation avec toutes les relations nécessaires
    const { data: booking, error: bookingError } = await admin
      .from("bookings")
      .select(`
        *,
        client:clients(*),
        room:rooms(*, room_type:room_types(*)),
        accommodation:accommodations(*)
      `)
      .eq("id", bookingId)
      .eq("tenant_id", userData.tenant_id)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: "Réservation introuvable." },
        { status: 404 }
      );
    }

    const enrichedBooking: BookingWithRelations = {
      ...booking,
      room_type: (booking.room as any)?.room_type,
      accommodation: (booking as any).accommodation,
    };

    // Récupérer les informations du tenant
    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .select("*")
      .eq("id", userData.tenant_id)
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: "Impossible de récupérer les informations de l'entreprise." },
        { status: 400 }
      );
    }

    // Générer un numéro de facture unique (avec retry en cas de race condition)
    let invoiceNumber = "";
    let invoice: Invoice | null = null;
    let invoiceError: any = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const { count } = await admin
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", userData.tenant_id);

      invoiceNumber = generateInvoiceNumber(
        userData.tenant_id,
        (count || 0) + 1 + attempt
      );

      const { data: invoiceData, error: rpcError } = await admin.rpc(
        "generate_invoice",
        {
          p_booking_id: bookingId,
          p_user_id: userData.id,
          p_invoice_number: invoiceNumber,
        }
      );

      if (invoiceData) {
        invoice = invoiceData as unknown as Invoice;
        invoiceError = null;
        break;
      }

      invoiceError = rpcError;
      // Si l'erreur est une violation d'unicité, on réessaye avec le numéro suivant
      if (rpcError?.message?.includes("duplicate") || rpcError?.code === "23505") {
        continue;
      }
      break;
    }

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Erreur lors de la création de la facture: " + (invoiceError?.message || "inconnue") },
        { status: 500 }
      );
    }

    // Vérifier que le bucket 'invoices' existe avant upload
    const { data: buckets } = await admin.storage.listBuckets();
    const bucketExists = (buckets || []).some((b: any) => b.id === "invoices" || b.name === "invoices");
    if (!bucketExists) {
      return NextResponse.json(
        { error: "Le stockage des factures n'est pas configuré (bucket 'invoices' absent). Veuillez contacter l'administrateur." },
        { status: 500 }
      );
    }

    // Générer le PDF
    const pdfBuffer = await generateInvoicePdf({
      tenant: tenant as unknown as Tenant,
      booking: enrichedBooking,
      invoice,
    });

    // Uploader le PDF dans Supabase Storage (bucket 'invoices')
    const fileName = `${invoice.invoice_number.replace(/\//g, "-")}_${bookingId}.pdf`;
    const { error: uploadError } = await admin.storage
      .from("invoices")
      .upload(fileName, pdfBuffer, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: "Erreur lors de l'upload du PDF: " + uploadError.message },
        { status: 500 }
      );
    }

    // Vérifier que le fichier est bien accessible publiquement
    const { data: urlData } = admin.storage
      .from("invoices")
      .getPublicUrl(fileName);

    const pdfUrl = urlData?.publicUrl || "";

    if (!pdfUrl) {
      return NextResponse.json(
        { error: "Impossible de générer l'URL publique du PDF." },
        { status: 500 }
      );
    }

    // Mettre à jour l'invoice avec l'URL du PDF
    const { error: updateError } = await admin
      .from("invoices")
      .update({ pdf_url: pdfUrl })
      .eq("id", invoice.id);

    if (updateError) {
      console.error("Erreur lors de la mise à jour de l'URL du PDF:", updateError);
      return NextResponse.json(
        { error: "Erreur lors de l'enregistrement du PDF: " + updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      invoice: { ...invoice, pdf_url: pdfUrl },
      alreadyGenerated: false,
    });
  } catch (err: any) {
    console.error("generate_invoice error:", err);
    const detail = err?.message ? `: ${err.message}` : ".";
    return NextResponse.json(
      { error: `Une erreur est survenue lors de la génération de la facture${detail}` },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get("bookingId");

    if (!bookingId) {
      return NextResponse.json(
        { error: "ID de réservation requis." },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json(
        { error: "Vous devez être connecté." },
        { status: 401 }
      );
    }

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id, tenant_id")
      .eq("auth_user_id", session.user.id)
      .single();

    if (userError || !userData?.tenant_id) {
      return NextResponse.json(
        { error: "Impossible de retrouver votre compte." },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: invoice, error } = await admin
      .from("invoices")
      .select("*")
      .eq("booking_id", bookingId)
      .eq("tenant_id", userData.tenant_id)
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: "Erreur lors de la récupération de la facture." },
        { status: 500 }
      );
    }

    return NextResponse.json({ invoice });
  } catch (err) {
    console.error("get invoice error:", err);
    return NextResponse.json(
      { error: "Une erreur est survenue." },
      { status: 500 }
    );
  }
}
