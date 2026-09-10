/**
 * modules/auth/offline-snapshot.js
 *
 * Snapshot B1 — dernier état de validation en ligne (boot offline tolérant).
 * UNIQUEMENT un mécanisme de secours : jamais une preuve de licence autonome.
 * Il n'est écrit qu'après une validation en ligne réussie (checkAccessAndInit)
 * et ne contient AUCUN jeton, AUCUN secret, AUCUNE donnée métier.
 *
 * Politique de validité (moins permissive possible) :
 * - v === 1 et userId === session actuelle
 * - status === 'active' (profiles.active) et hasAccess === true (abo actif)
 * - expires_at (subscriptions) : NULL = accès à vie, sinon must still be in the future
 */
const SNAPSHOT_KEY = 'fb_auth_snapshot';
const SNAPSHOT_VERSION = 1;

export function readAuthSnapshot() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

export function writeAuthSnapshot(data) {
  const now = new Date().toISOString();
  const snap = {
    v: SNAPSHOT_VERSION,
    userId: data.userId,
    email: data.email || '',
    role: data.role || 'user',
    fullName: data.fullName || '',
    status: data.status || '',
    hasAccess: data.hasAccess === true,
    expiresAt: data.expiresAt || null,
    validatedAt: data.validatedAt || now,
  };
  try {
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
  } catch (_) {
    /* stockage indisponible : pas de snapshot, comportement en ligne inchangé */
  }
}

export function clearAuthSnapshot() {
  try {
    localStorage.removeItem(SNAPSHOT_KEY);
  } catch (_) { /* ignore */ }
}

export function isAuthSnapshotUsable(snap, now = Date.now()) {
  if (!snap || snap.v !== SNAPSHOT_VERSION) return false;
  if (typeof snap.userId !== 'string' || snap.userId.length === 0) return false;
  if (snap.role !== 'user' && snap.role !== 'admin') return false;
  if (snap.status !== 'active' || snap.hasAccess !== true) return false;
  if (snap.expiresAt) {
    const exp = Date.parse(snap.expiresAt);
    if (!Number.isFinite(exp) || exp <= now) return false;
  }
  return true;
}