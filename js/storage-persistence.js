/**
 * B3 — demande opportuniste et SILENCIEUSE de persistance du stockage
 * (navigator.storage.persist / persisted, StorageManager API).
 *
 * Protection supplémentaire contre l'éviction du quota : jamais une condition
 * d'accès. API absente, refus, ou exception → on continue exactement comme avant.
 */

export async function requestStoragePersistence() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage) return false;
    if (typeof navigator.storage.persist !== 'function') return false;
    if (await navigator.storage.persisted()) return true;
    return !!(await navigator.storage.persist());
  } catch (e) {
    return false;
  }
}