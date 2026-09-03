import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

const INVOICE_BUCKET = "invoices";
// Anti-énumération : on borne la longueur et l'alphabet du token.
// 48 caractères hexadécimaux = 24 octets aléatoires = 192 bits d'entropie.
const TOKEN_PATTERN = /^[a-f0-9]{48}$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token || !TOKEN_PATTERN.test(token)) {
      return new NextResponse("Lien invalide.", { status: 400 });
    }

    const admin = createAdminClient();

    // 1. Retrouver la facture associée au token
    const { data: invoice, error: invoiceError } = await admin
      .from("invoices")
      .select("id, invoice_number, pdf_url")
      .eq("access_token", token)
      .maybeSingle();

    if (invoiceError) {
      console.error("public invoice lookup error:", invoiceError);
      return new NextResponse("Une erreur est survenue. Veuillez réessayer.", { status: 500 });
    }
    if (!invoice) {
      return new NextResponse("Facture introuvable ou lien expiré.", { status: 404 });
    }

    // 2. Si le PDF n'a pas encore été stocké, on tente une URL signée à partir
    //    du chemin existant ; sinon on renvoie un message clair.
    if (!invoice.pdf_url) {
      return new NextResponse("La facture est en cours de préparation. Réessayez dans quelques secondes.", {
        status: 409,
      });
    }

    // 3. Télécharger le PDF depuis le storage (le bucket est privé) via le
    //    client admin (service_role) et le servir en flux direct.
    const { data: fileData, error: downloadError } = await admin.storage
      .from(INVOICE_BUCKET)
      .download(invoice.pdf_url);

    if (downloadError || !fileData) {
      console.error("public invoice download error:", downloadError);
      return new NextResponse("Le fichier PDF est momentanément indisponible.", { status: 502 });
    }

    const pdfBuf = new Uint8Array(await fileData.arrayBuffer());
    return new Response(pdfBuf, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="facture-${invoice.invoice_number}.pdf"`,
        "Cache-Control": "private, max-age=300",
        "X-Invoice-Number": invoice.invoice_number,
      },
    });
  } catch (err) {
    console.error("public invoice route error:", err);
    return new NextResponse("Une erreur est survenue. Veuillez réessayer.", { status: 500 });
  }
}
