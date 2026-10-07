/** Browser side of the doctor sign-in: Google Identity Services, then the server's /auth routes. */

export interface DoctorProfile {
  email: string;
  name: string;
  specialty: string;
  clinic: string;
  registrationNo: string;
  picture?: string;
  verifiedAt: number;
}

export interface AuthConfig {
  googleClientId: string | null;
  inviteHint: string | null;
  demoSignIn: boolean;
}

const KEY = "nirog-doctor-session";

export const base = () => location.origin;

export async function fetchConfig(): Promise<AuthConfig> {
  const r = await fetch(`${base()}/auth/config`);
  if (!r.ok) throw new Error("The server has no sign-in configured.");
  return r.json();
}

export function loadSession(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function saveSession(token: string | null) {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (o: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean; ux_mode?: "popup" }) => void;
          renderButton: (el: HTMLElement, o: Record<string, unknown>) => void;
          prompt: () => void;
          disableAutoSelect: () => void;
        };
      };
    };
  }
}

let gisLoading: Promise<void> | null = null;
export function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  gisLoading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load Google sign-in. Check your connection."));
    document.head.appendChild(s);
  });
  return gisLoading;
}

type Body = { idToken?: string; demo?: { email: string; name: string }; session?: string; registrationNo?: string; inviteCode?: string };

async function post(path: string, body: Body) {
  const r = await fetch(`${base()}/auth/${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data as { error?: string }).error ?? `Sign-in failed (${r.status}).`);
  return data as { status: "verified" | "needs-verification"; session?: string; doctor?: DoctorProfile; identity?: { email: string; name: string; picture?: string } };
}

export const startSession = (identity: { idToken?: string; demo?: { email: string; name: string } }) => post("doctor/session", { ...identity, session: loadSession() ?? undefined });
export const verifyDoctor = (identity: { idToken?: string; demo?: { email: string; name: string } }, registrationNo: string, inviteCode: string) => post("doctor/verify", { ...identity, registrationNo, inviteCode });
