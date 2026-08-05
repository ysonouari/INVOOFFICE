/**
 * Inscription — Supabase Auth
 */
import { getSupabase } from './supabase-client.js';
import { isValidEmail, isNotEmpty, minLength } from '../shared/validators.js';

export async function signUp({ fullName, email, whatsapp, password, confirmPassword }) {
  const errors = {};

  if (!isNotEmpty(fullName)) errors.fullName = 'Le nom complet est requis.';
  if (!isValidEmail(email)) errors.email = 'Email invalide.';
  if (!isNotEmpty(whatsapp)) errors.whatsapp = 'Le numéro WhatsApp est requis.';
  if (!minLength(password, 6)) errors.password = 'Le mot de passe doit contenir au moins 6 caractères.';
  if (password !== confirmPassword) errors.confirmPassword = 'Les mots de passe ne correspondent pas.';

  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  const supabase = getSupabase();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        whatsapp: whatsapp
      }
    }
  });

  if (error) {
    if (error.message.includes('already registered') || error.message.includes('already exists')) {
      return { success: false, error: 'Cet email est déjà utilisé.' };
    }
    return { success: false, error: error.message };
  }

  // Le trigger handle_new_user() crée automatiquement le profil avec :
  // status='pending', role='user'
  return { success: true, user: data.user };
}
