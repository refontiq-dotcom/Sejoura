import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  serverGetOnboarding,
  serverCompleteStep,
  serverDismissOnboarding,
  ONBOARDING_REQUIRED_STEPS,
  type OnboardingStatus,
} from "@/lib/onboarding";
import type { OnboardingStep } from "@/types/database";

export const dynamic = "force-dynamic";

interface OnboardingResponse {
  status: OnboardingStatus | null;
}

/**
 * GET /api/onboarding
 * Retourne le statut d'onboarding de l'utilisateur connecté, ou null si
 * l'utilisateur n'a pas de profil applicatif (employés non liés à users, etc.).
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ status: null } satisfies OnboardingResponse, { status: 401 });
    }

    const status = await serverGetOnboarding(supabase as never);

    return NextResponse.json({ status } satisfies OnboardingResponse);
  } catch {
    return NextResponse.json({ status: null } satisfies OnboardingResponse, { status: 500 });
  }
}

/**
 * POST /api/onboarding
 * Body : { action: "complete", step: OnboardingStep } | { action: "dismiss" }
 * Le serveur valide la clé d'étape et l'utilisateur connecté.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      return NextResponse.json({ status: null } satisfies OnboardingResponse, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { action?: string; step?: string }
      | null;

    if (!body || typeof body.action !== "string") {
      return NextResponse.json(
        { status: null, error: "Action invalide." } satisfies OnboardingResponse & { error?: string },
        { status: 400 }
      );
    }

    if (body.action === "complete") {
      const step = body.step as OnboardingStep | undefined;
      if (!step || !ONBOARDING_REQUIRED_STEPS.includes(step)) {
        return NextResponse.json(
          { status: null, error: "Étape inconnue." } satisfies OnboardingResponse & { error?: string },
          { status: 400 }
        );
      }

      const status = await serverCompleteStep(supabase as never, step);
      return NextResponse.json({ status } satisfies OnboardingResponse);
    }

    if (body.action === "dismiss") {
      const status = await serverDismissOnboarding(supabase as never);
      return NextResponse.json({ status } satisfies OnboardingResponse);
    }

    return NextResponse.json(
      { status: null, error: "Action inconnue." } satisfies OnboardingResponse & { error?: string },
      { status: 400 }
    );
  } catch {
    return NextResponse.json({ status: null } satisfies OnboardingResponse, { status: 500 });
  }
}
