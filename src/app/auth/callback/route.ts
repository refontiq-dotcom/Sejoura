import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Callback OAuth (Google, etc.)
 *
 * After Google redirects the user back, Supabase exchange the code for a session.
 * If the user is new (first Google sign-in), we create their profile in the
 * public `users` table so the dashboard can load properly.
 *
 * Flow:
 * 1. Google redirects to /auth/callback?code=...&next=/dashboard
 * 2. Supabase exchanges the code for a session (sets cookies)
 * 3. We check if a profile exists in `users` table
 * 4. If not, create it with role `admin_residence`
 * 5. Redirect to the destination
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  // Handle OAuth errors (user denied access, etc.)
  if (error) {
    console.error(
      "[auth/callback] OAuth error:",
      error,
      errorDescription
    );
    return NextResponse.redirect(
      `${origin}?error=${encodeURIComponent(errorDescription ?? error)}`
    );
  }

  if (!code) {
    console.error("[auth/callback] No code in URL");
    return NextResponse.redirect(`${origin}?error=no_code`);
  }

  try {
    const supabase = await createClient();

    // Exchange the code for a session (sets auth cookies)
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error(
        "[auth/callback] Code exchange failed:",
        exchangeError.message
      );
      return NextResponse.redirect(
        `${origin}?error=${encodeURIComponent(exchangeError.message)}`
      );
    }

    // Get the authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      console.error("[auth/callback] Failed to get user:", userError?.message);
      return NextResponse.redirect(`${origin}?error=get_user_failed`);
    }

    // Check if a profile already exists in the `users` table
    const { data: existingProfile } = await supabase
      .from("users")
      .select("id, role")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (!existingProfile) {
      // First time Google sign-in: create the user profile
      const fullName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "Utilisateur";
      const avatarUrl =
        user.user_metadata?.avatar_url ||
        user.user_metadata?.picture ||
        null;

      const { error: insertError } = await supabase.from("users").insert({
        auth_user_id: user.id,
        email: user.email,
        full_name: fullName,
        avatar_url: avatarUrl,
        role: "admin_residence",
      });

      if (insertError) {
        // If the insert fails (e.g. duplicate key from a race condition),
        // log but don't block the login — the profile might already exist
        console.error(
          "[auth/callback] Failed to create user profile:",
          insertError.message
        );
      }
    }

    // Build redirect URL
    const redirectUrl = new URL(next, origin);

    // Add a flag to indicate successful OAuth (for toast notification)
    redirectUrl.searchParams.set("oauth_success", "true");

    return NextResponse.redirect(redirectUrl);
  } catch (err) {
    console.error("[auth/callback] Unexpected error:", err);
    return NextResponse.redirect(
      `${origin}?error=${encodeURIComponent("callback_failed")}`
    );
  }
}
