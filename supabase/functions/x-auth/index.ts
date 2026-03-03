import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function base64url(bytes: Uint8Array): string {
  let str = "";
  bytes.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return base64url(array);
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64url(new Uint8Array(hash));
}

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(";").forEach((c) => {
    const [key, ...val] = c.trim().split("=");
    if (key) cookies[key] = val.join("=");
  });
  return cookies;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    const clientId = Deno.env.get("X_Client_ID")!;
    const clientSecret = Deno.env.get("X_Client_Secret")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Construct the callback URL for this edge function
    const callbackUrl = `${supabaseUrl}/functions/v1/x-auth?action=callback`;

    // ─── LOGIN: Generate PKCE and redirect to X ───
    if (action === "login") {
      const redirectTo =
        url.searchParams.get("redirect_to") || "https://localhost:3000";
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const state = crypto.randomUUID();

      const authUrl = new URL("https://x.com/i/oauth2/authorize");
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("client_id", clientId);
      authUrl.searchParams.set("redirect_uri", callbackUrl);
      authUrl.searchParams.set("scope", "tweet.read users.read offline.access");
      authUrl.searchParams.set("state", state);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");

      return new Response(null, {
        status: 302,
        headers: {
          Location: authUrl.toString(),
          "Set-Cookie": [
            `x_verifier=${codeVerifier}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`,
            `x_state=${state}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`,
            `x_redirect=${encodeURIComponent(redirectTo)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=600`,
          ].join(", "),
        },
      });
    }

    // ─── CALLBACK: Exchange code, create user, redirect ───
    if (action === "callback") {
      const code = url.searchParams.get("code");
      const cookies = parseCookies(req.headers.get("cookie") || "");
      const codeVerifier = cookies["x_verifier"];
      const redirectTo = decodeURIComponent(
        cookies["x_redirect"] || "https://localhost:3000"
      );

      if (!code || !codeVerifier) {
        return new Response("Missing code or verifier", { status: 400 });
      }

      // Exchange code for access token
      const tokenRes = await fetch("https://api.x.com/2/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: new URLSearchParams({
          code,
          grant_type: "authorization_code",
          redirect_uri: callbackUrl,
          code_verifier: codeVerifier,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error("Token exchange failed:", errText);
        return new Response(`X token exchange failed: ${errText}`, {
          status: 400,
        });
      }

      const tokenData = await tokenRes.json();

      // Get X user info
      const userRes = await fetch(
        "https://api.x.com/2/users/me?user.fields=profile_image_url,name",
        { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
      );

      if (!userRes.ok) {
        return new Response("Failed to fetch X user info", { status: 400 });
      }

      const { data: xUser } = await userRes.json();
      const xUserId = xUser.id;
      const xUsername = xUser.username;
      const xAvatar = xUser.profile_image_url;
      const xName = xUser.name;

      // Synthetic email for this X user
      const syntheticEmail = `x_${xUserId}@kai-agent.local`;

      // Supabase admin client
      const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      // Check if user already exists via profiles table
      const { data: existingProfile } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("x_user_id", xUserId)
        .maybeSingle();

      let userId: string;

      if (existingProfile) {
        userId = existingProfile.user_id;
        // Update metadata
        await supabaseAdmin.auth.admin.updateUserById(userId, {
          user_metadata: {
            provider_id: xUserId,
            user_name: xUsername,
            avatar_url: xAvatar,
            full_name: xName,
          },
        });
      } else {
        // Create new user
        const { data: newUser, error: createError } =
          await supabaseAdmin.auth.admin.createUser({
            email: syntheticEmail,
            email_confirm: true,
            user_metadata: {
              provider_id: xUserId,
              user_name: xUsername,
              avatar_url: xAvatar,
              full_name: xName,
            },
          });

        if (createError) {
          console.error("Create user error:", createError);
          return new Response(`Failed to create user: ${createError.message}`, {
            status: 500,
          });
        }

        userId = newUser.user!.id;
      }

      // Generate magic link to sign the user in
      const { data: linkData, error: linkError } =
        await supabaseAdmin.auth.admin.generateLink({
          type: "magiclink",
          email: syntheticEmail,
        });

      if (linkError || !linkData) {
        console.error("Generate link error:", linkError);
        return new Response("Failed to generate sign-in link", {
          status: 500,
        });
      }

      // Construct the Supabase verify URL that will set the session
      const hashedToken = linkData.properties.hashed_token;
      const verifyUrl = `${supabaseUrl}/auth/v1/verify?token=${hashedToken}&type=magiclink&redirect_to=${encodeURIComponent(redirectTo)}`;

      // Clear cookies and redirect to verify URL
      return new Response(null, {
        status: 302,
        headers: {
          Location: verifyUrl,
          "Set-Cookie": [
            "x_verifier=; Path=/; Max-Age=0",
            "x_state=; Path=/; Max-Age=0",
            "x_redirect=; Path=/; Max-Age=0",
          ].join(", "),
        },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("x-auth error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
