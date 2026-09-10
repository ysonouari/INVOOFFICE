/**
 * Guards — protection des routes et des vues
 */
import { getCurrentUser, signOut } from './session.js';
import { getSupabase } from './supabase-client.js';
import { readAuthSnapshot, isAuthSnapshotUsable } from './offline-snapshot.js';

function isServerResponse(error) {
  return !!error && (typeof error.status === 'number' || typeof error.statusCode === 'number');
}

function isTransportFailure(error) {
  return !!error && !isServerResponse(error);
}

function isAuthDenial(profRes, subsRes) {
  const { data: profile, error: profError } = profRes;
  const { data: subs, error: subsError } = subsRes;
  if (profError && isServerResponse(profError)) return true;
  if (!profError && !profile) return true;
  if (subsError && isServerResponse(subsError)) return true;
  if (!subsError && !subs) return true;
  return false;
}

function hasTransportFailure(profRes, subsRes) {
  return isTransportFailure(profRes.error) || isTransportFailure(subsRes.error);
}

async function runAuthQueries(supabase, userId) {
  try {
    return await Promise.all([
      supabase
        .from('profiles')
        .select('role, status, full_name')
        .eq('id', userId)
        .single(),
      supabase
        .from('subscriptions')
        .select('status, expires_at')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle(),
    ]);
  } catch (e) {
    const err = { message: e && e.message ? e.message : 'failed to fetch' };
    return [{ data: null, error: err }, { data: null, error: err }];
  }
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/';
    return null;
  }

  const supabase = getSupabase();

  const [profRes, subsRes] = await runAuthQueries(supabase, user.id);

  let offlineSnapshot = null;
  if (hasTransportFailure(profRes, subsRes) && !isAuthDenial(profRes, subsRes)) {
    const snap = readAuthSnapshot();
    if (snap && isAuthSnapshotUsable(snap) && snap.userId === user.id) {
      offlineSnapshot = snap;
    }
  }

  if (offlineSnapshot) {
    if (offlineSnapshot.role === 'admin') {
      window.location.href = '/admin';
      return null;
    }
    return {
      user,
      profile: {
        id: user.id,
        role: offlineSnapshot.role,
        status: offlineSnapshot.status,
        full_name: offlineSnapshot.fullName,
      },
      hasAccess: true,
      subscription: null,
      offlineSnapshot: true,
    };
  }

  const { data: profile, error } = profRes;

  if (error || !profile) {
    await signOut();
    window.location.href = '/';
    return null;
  }

  if (profile.role === 'admin') {
    window.location.href = '/admin';
    return null;
  }

  const { data: subs } = subsRes;

  const hasAccess = !!subs;

  return { user, profile, hasAccess, subscription: subs, offlineSnapshot: false };
}

export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) {
    window.location.href = '/';
    return null;
  }

  const supabase = getSupabase();

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    window.location.href = '/';
    return null;
  }

  return { user, profile };
}

export function getStatusMessage(profile, hasAccess) {
  if (profile.status === 'pending') {
    return 'Votre inscription est en attente de validation. Notre équipe vous contactera rapidement.';
  }
  if (profile.status === 'inactive') {
    return 'Votre compte est désactivé. Merci de contacter le support.';
  }
  if (profile.status === 'rejected') {
    return 'Votre demande n\'a pas été validée.';
  }
  if (!hasAccess) {
    return 'Votre paiement n\'a pas encore été validé.';
  }
  return null;
}
