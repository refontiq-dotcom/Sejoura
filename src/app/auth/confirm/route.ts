import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Auth Confirm route — handles Supabase's default email template.
 *
 * Supabase's built-in Magic Link template sends users to:
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink
 *
 * This route verifies the token_hash, sets the session, and redirects
 * the user to the dashboard.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next") ?? "/dashboard";
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (error) {
    console.error("[auth/confirm] OAuth error:", error, errorDescription);
    return NextResponse.redirect(
      `${origin}?error=${encodeURIComponent(errorDescription ?? error)}`
    );
  }

  if (!tokenHash || !type) {
    console.error("[auth/confirm] Missing token_hash or type");
    return NextResponse.redirect(`${origin}?error=missing_params`);
  }

  try {
    const supabase = await createClient();

    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "signup" | "email",
    });

    if (verifyError) {
      console.error("[auth/confirm] Verify failed:", verifyError.message);
      return NextResponse.redirect(
        `${origin}?error=${encodeURIComponent(verifyError.message)}`
      );
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("[auth/confirm] Failed to get user:", userError?.message);
      return NextResponse.redirect(`${origin}?error=get_user_failed`);
    }

    // Create profile if first login
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
        console.error("[auth/confirm] Failed to create profile:", insertError.message);
      }
    }

    const redirectUrl = new URL(next, origin);
    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("[auth/confirm] Unexpected error:", err);
    return NextResponse.redirect(`${origin}?error=confirm_failed`);
  }
}
