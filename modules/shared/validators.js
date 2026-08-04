/**
 * Validateurs partagés
 * Fonctions de validation pour les formulaires
 */

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPhone(phone) {
  return /^(?:\+212|0)[5-7]\d{8}$/.test(phone.replace(/[\s.-]/g, ''));
}

export function isNotEmpty(value) {
  return value.trim().length > 0;
}

export function minLength(value, length) {
  return value.trim().length >= length;
}
