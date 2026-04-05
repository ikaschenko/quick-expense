import crypto from "node:crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function toBase64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function getGoogleClientId() {
  return process.env.GOOGLE_CLIENT_ID?.trim() ?? process.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
}

export function getFrontendBaseUrl() {
  return requireEnv("FRONTEND_BASE_URL");
}

export function createPkcePair() {
  const verifier = toBase64Url(crypto.randomBytes(32));
  const challenge = toBase64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function buildGoogleAuthorizationUrl({ state, codeChallenge }) {
  const params = new URLSearchParams({
    client_id: getGoogleClientId(),
    redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/drive.file",
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeAuthorizationCode({ code, codeVerifier }) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: getGoogleClientId(),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      redirect_uri: requireEnv("GOOGLE_REDIRECT_URI"),
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      `Google code exchange failed: ${payload.error ?? response.status} ${payload.error_description ?? ""}`.trim(),
    );
  }

  return payload;
}

export async function refreshAccessToken(refreshToken) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: getGoogleClientId(),
      client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      `Google token refresh failed: ${payload.error ?? response.status} ${payload.error_description ?? ""}`.trim(),
    );
  }

  return payload;
}

export async function fetchGoogleUserInfo(accessToken) {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await response.json();
  if (!response.ok || !payload.email) {
    throw new Error("Failed to fetch Google user profile.");
  }

  return payload;
}
