/**
 * Auth Modals — landing page
 * Gère les modales d'inscription, connexion et messages d'accès
 */
import { initSupabase } from '../auth/supabase-client.js';
import { signUp } from '../auth/signup.js';
import { signIn, getAccessMessage } from '../auth/signin.js';

const modals = {
  signup: document.getElementById('signupOverlay'),
  signin: document.getElementById('signinOverlay'),
  blocked: document.getElementById('accessBlockedOverlay')
};

function showModal(name) {
  Object.values(modals).forEach(m => { if (m) m.style.display = 'none'; });
  if (modals[name]) {
    modals[name].style.display = 'flex';
    // Focus first input
    const firstInput = modals[name].querySelector('input');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  }
}

function hideAllModals() {
  Object.values(modals).forEach(m => { if (m) m.style.display = 'none'; });
}

function showError(fieldId, message) {
  const el = document.getElementById(fieldId);
  if (el) { el.textContent = message; el.style.display = 'block'; }
}

function clearErrors(formId) {
  document.querySelectorAll(`#${formId} .field-error`).forEach(el => {
    el.textContent = '';
    el.style.display = 'none';
  });
}

function setLoading(btn, loading) {
  if (loading) {
    btn.disabled = true;
    btn.dataset.originalText = btn.textContent;
    btn.innerHTML = '<span class="lp-spinner"></span> ' + (btn.closest('#signupForm') ? 'Création...' : 'Connexion...');
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.originalText || btn.textContent;
  }
}

// Password visibility toggle
document.addEventListener('click', (e) => {
  const toggle = e.target.closest('.lp-password-toggle');
  if (!toggle) return;
  const input = document.getElementById(toggle.dataset.target);
  if (!input) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  toggle.textContent = isPassword ? '🙈' : '👁';
});

// Inscription
document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors('signupForm');

  const btn = document.getElementById('signupSubmit');
  setLoading(btn, true);

  try {
    const result = await signUp({
      fullName: document.getElementById('signupName').value.trim(),
      email: document.getElementById('signupEmail').value.trim(),
      whatsapp: document.getElementById('signupWhatsapp').value.trim(),
      password: document.getElementById('signupPassword').value,
      confirmPassword: document.getElementById('signupConfirm').value
    });

    if (!result.success) {
      if (result.errors) {
        if (result.errors.fullName) showError('signupNameError', result.errors.fullName);
        if (result.errors.email) showError('signupEmailError', result.errors.email);
        if (result.errors.whatsapp) showError('signupWhatsappError', result.errors.whatsapp);
        if (result.errors.password) showError('signupPasswordError', result.errors.password);
        if (result.errors.confirmPassword) showError('signupConfirmError', result.errors.confirmPassword);
      } else {
        showError('signupGlobalError', result.error || 'Erreur lors de l\'inscription.');
      }
      return;
    }

    hideAllModals();
    window.location.href = '/confirmation';
  } catch (err) {
    showError('signupGlobalError', 'Erreur réseau. Vérifiez votre connexion.');
  } finally {
    setLoading(btn, false);
  }
});

// Connexion
document.getElementById('signinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors('signinForm');

  const btn = document.getElementById('signinSubmit');
  setLoading(btn, true);

  try {
    const result = await signIn(
      document.getElementById('signinEmail').value.trim(),
      document.getElementById('signinPassword').value
    );

    if (!result.success) {
      showError('signinGlobalError', result.error || 'Erreur de connexion.');
      return;
    }

    hideAllModals();

    if (result.profile.role === 'admin') {
      window.location.href = '/admin';
      return;
    }

    const message = getAccessMessage(result.profile, result.hasActiveAccess);
    if (message) {
      document.getElementById('blockedMessage').textContent = message;
      showModal('blocked');
      return;
    }

    window.location.href = '/app';
  } catch (err) {
    showError('signinGlobalError', 'Erreur réseau. Vérifiez votre connexion.');
  } finally {
    setLoading(btn, false);
  }
});

// Événements des boutons
document.querySelectorAll('[data-action="show-signup"]').forEach(btn => {
  btn.addEventListener('click', () => showModal('signup'));
});

document.querySelectorAll('[data-action="show-signin"]').forEach(btn => {
  btn.addEventListener('click', () => showModal('signin'));
});

document.querySelectorAll('[data-action="close-signup"], [data-action="close-signin"], [data-action="close-blocked"]').forEach(btn => {
  btn.addEventListener('click', hideAllModals);
});

// Switch entre modales
document.getElementById('switchToSignin').addEventListener('click', (e) => {
  e.preventDefault();
  showModal('signin');
});

document.getElementById('switchToSignup').addEventListener('click', (e) => {
  e.preventDefault();
  showModal('signup');
});

// Fermeture au clic extérieur
Object.values(modals).forEach(overlay => {
  if (!overlay) return;
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideAllModals();
  });
});

// Fermeture Échap
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideAllModals();
});

// Init Supabase
initSupabase();
