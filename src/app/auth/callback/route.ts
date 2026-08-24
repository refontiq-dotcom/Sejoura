import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Callback OAuth + Magic Link
 *
 * Handles two flows:
 * 1. OAuth (Google): ?code=xxx&next=/dashboard
 * 2. Magic Link: ?token_hash=xxx&type=magiclink&next=/dashboard
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/dashboard";
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle OAuth errors
  if (error) {
    console.error("[auth/callback] OAuth error:", error, errorDescription);
    return NextResponse.redirect(
      `${origin}?error=${encodeURIComponent(errorDescription ?? error)}`
    );
  }

  try {
    const supabase = await createClient();

    // ── Flow 1: Magic Link (token_hash) ──────────────────────────────
    if (tokenHash && type) {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as "magiclink" | "signup",
      });

      if (verifyError) {
        console.error("[auth/callback] Magic Link verify failed:", verifyError.message);
        return NextResponse.redirect(
          `${origin}?error=${encodeURIComponent(verifyError.message)}`
        );
      }

      // Get the authenticated user
      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error("[auth/callback] Failed to get user after magic link:", userError?.message);
        return NextResponse.redirect(`${origin}?error=get_user_failed`);
      }

      // Create profile if first login
      await ensureUserProfile(supabase, user);

      const redirectUrl = new URL(next, origin);
      redirectUrl.searchParams.set("magic_success", "true");
      return NextResponse.redirect(redirectUrl);
    }

    // ── Flow 2: OAuth (code exchange) ────────────────────────────────
    if (code) {
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        console.error("[auth/callback] Code exchange failed:", exchangeError.message);
        return NextResponse.redirect(
          `${origin}?error=${encodeURIComponent(exchangeError.message)}`
        );
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError || !user) {
        console.error("[auth/callback] Failed to get user:", userError?.message);
        return NextResponse.redirect(`${origin}?error=get_user_failed`);
      }

      await ensureUserProfile(supabase, user);

      const redirectUrl = new URL(next, origin);
      redirectUrl.searchParams.set("oauth_success", "true");
      return NextResponse.redirect(redirectUrl);
    }

    // No code and no token_hash
    console.error("[auth/callback] No code or token_hash in URL");
    return NextResponse.redirect(`${origin}?error=no_code`);
  } catch (err) {
    console.error("[auth/callback] Unexpected error:", err);
    return NextResponse.redirect(`${origin}?error=callback_failed`);
  }
}

/**
 * Create user profile in public.users if it doesn't exist.
 * Works for both Google OAuth and Magic Link sign-ins.
 */
async function ensureUserProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; email?: string; user_metadata?: Record<string, unknown> }
) {
  const { data: existingProfile } = await supabase
    .from("users")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!existingProfile) {
    const fullName =
      (user.user_metadata?.full_name as string) ||
      (user.user_metadata?.name as string) ||
      user.email?.split("@")[0] ||
      "Utilisateur";
    const avatarUrl =
      (user.user_metadata?.avatar_url as string) ||
      (user.user_metadata?.picture as string) ||
      null;

    const { error: insertError } = await supabase.from("users").insert({
      auth_user_id: user.id,
      email: user.email,
      full_name: fullName,
      avatar_url: avatarUrl,
      role: "admin_residence",
    });

    if (insertError) {
      console.error("[auth/callback] Failed to create user profile:", insertError.message);
    }
  }
}
