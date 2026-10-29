import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Öffentliche Zugangsdaten (dürfen im Browser stehen – der Zugriff ist über Row Level Security geschützt).
// Über Umgebungsvariablen überschreibbar, z. B. für ein eigenes Supabase-Projekt.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ylbfimgvfnhlwtjxwvov.supabase.co';
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_MBPdek1YNta-vJ6gYftzlw_nfzTuoL8';

export const ATTACHMENT_BUCKET = 'nz-attachments';

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'notizen-auth' },
  });
  return client;
}

/** Prüft, ob im Supabase-Projekt die Anmeldung mit Google eingeschaltet ist. */
export async function isGoogleEnabled(): Promise<boolean | null> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } });
    if (!res.ok) return null;
    const json = (await res.json()) as { external?: Record<string, boolean> };
    return !!json.external?.google;
  } catch {
    return null;
  }
}
