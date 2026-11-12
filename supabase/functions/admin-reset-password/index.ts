// ============================================================================
// Edge Function : admin-reset-password
// Génère un nouveau mot de passe aléatoire pour un utilisateur (réservé admin).
//
// Sécurité :
//  1. Vérifie le JWT de l'appelant (auth.getUser).
//  2. Vérifie côté serveur que profiles.role = 'admin' (sinon 403).
//  3. Refuse si la cible est un autre admin.
//  4. Valide l'entrée (user_id uuid).
//  5. Applique le mot de passe via auth.admin.updateUserById (service role).
//  6. CORS limité à localhost:3000 / 127.0.0.1:3000 + domaine Vercel.
//  7. Rate limit best-effort : 10 appels/minute par admin (mémoire, par isolate).
//
// CORS : le préflight OPTIONS répond 204 IMMÉDIATEMENT (avant toute vérification),
// et TOUTES les réponses (succès comme erreurs, y compris le catch final)
// portent les en-têtes CORS.
//
// Le mot de passe est généré CÔTÉ SERVEUR et renvoyé UNE SEULE FOIS dans la
// réponse. Il n'est JAMAIS journalisé ni loggé.
// ============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'https://invooffice.com',
  'https://www.invooffice.com',
];

// Alphabet sans caractères ambigus (pas de 0, O, l, 1, I, o)
const PASSWORD_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePassword(): string {
  const length = 12 + Math.floor(Math.random() * 3); // 12 à 14 caractères
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return out;
}

function corsHeaders(origin: string | null) {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Max-Age': '86400',
  };
}

// Rate limiting best-effort (en mémoire, non garanti entre isolates)
const rateMap = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;

function isRateLimited(adminId: string): boolean {
  const now = Date.now();
  const hits = (rateMap.get(adminId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) {
    rateMap.set(adminId, hits);
    return true;
  }
  hits.push(now);
  rateMap.set(adminId, hits);
  return false;
}

const json = (body: Record<string, unknown>, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  // Préflight CORS : réponse 204 immédiate, avant toute vérification.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'Configuration serveur incomplète.' }, 500, headers);
    }

    if (origin && !ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: 'Origine non autorisée.' }, 403, headers);
    }

    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return json({ error: 'Non authentifié.' }, 401, headers);
    }
    const jwt = authHeader.replace('Bearer ', '');

    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Vérifie le JWT de l'appelant
    const { data: { user: caller }, error: authError } = await admin.auth.getUser(jwt);
    if (authError || !caller) {
      return json({ error: 'Non authentifié.' }, 401, headers);
    }

    // 2. Vérifie côté serveur que l'appelant est admin
    const { data: callerProfile } = await admin.from('profiles').select('role').eq('id', caller.id).single();
    if (!callerProfile || callerProfile.role !== 'admin') {
      return json({ error: 'Accès refusé.' }, 403, headers);
    }

    // 3. Rate limit (10 appels/minute par admin)
    if (isRateLimited(caller.id)) {
      return json({ error: 'Trop de requêtes. Réessayez plus tard.' }, 429, headers);
    }

    // 4. Valide l'entrée
    let body: { userId?: unknown };
    try {
      body = await req.json();
    } catch {
      body = {};
    }
    const targetUserId = typeof body.userId === 'string' ? body.userId : '';
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRe.test(targetUserId)) {
      return json({ error: 'Identifiant utilisateur invalide.' }, 400, headers);
    }

    // 5. Refuse si la cible est un autre admin
    const { data: targetProfile } = await admin.from('profiles').select('role, full_name').eq('id', targetUserId).single();
    if (!targetProfile) {
      return json({ error: 'Utilisateur introuvable.' }, 404, headers);
    }
    if (targetProfile.role === 'admin') {
      return json({ error: "Impossible de réinitialiser le mot de passe d'un administrateur." }, 403, headers);
    }

    // 6. Génère + applique le mot de passe (côté serveur)
    const password = generatePassword();
    const { error: updateError } = await admin.auth.admin.updateUserById(targetUserId, { password });
    if (updateError) {
      return json({ error: 'Échec de la mise à jour du mot de passe.' }, 500, headers);
    }

    // Journalise l'action (SANS le mot de passe) — service role bypass RLS
    const targetName = targetProfile.full_name ?? 'utilisateur';
    await admin.from('admin_logs').insert({
      admin_id: caller.id,
      action: 'reset_password',
      target_user_id: targetUserId,
      details: { target_name: targetName, summary: `Nouveau mot de passe généré pour ${targetName}` },
    });

    // Renvoie le mot de passe une seule fois (jamais loggé)
    return json({ password }, 200, headers);
  } catch (_) {
    return json({ error: 'Erreur interne du serveur.' }, 500, headers);
  }
});
