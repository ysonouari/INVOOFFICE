/**
 * Settings — Dashboard admin
 * Paramètres de la plateforme stockés dans Supabase
 */
import { getSupabase } from '../auth/supabase-client.js';
import { showToast } from '../shared/ui.js';
import { escAttr } from './shared.js';
import { ICONS } from '../../js/icons.js';
import { DEFAULT_TEMPLATES } from './whatsapp.js';

const DEFAULTS = {
  platform_name: 'INVOOFFICE',
  lifetime_price: 30000,
  currency: 'MAD',
  whatsapp_support: '',
  email_support: 'contact@invooffice.com',
  primary_color: '#6d6cf0',
  wa_msg_demo: DEFAULT_TEMPLATES.demo,
  wa_msg_lifetime: DEFAULT_TEMPLATES.lifetime,
  wa_msg_suspension: DEFAULT_TEMPLATES.suspension
};

export async function loadSettings() {
  const supabase = getSupabase();
  let settings = { ...DEFAULTS };

  const { data } = await supabase
    .from('platform_settings')
    .select('platform_name,lifetime_price,currency,whatsapp_support,email_support,primary_color,payment_instructions,validation_time,wa_msg_demo,wa_msg_lifetime,wa_msg_suspension')
    .eq('id', 1)
    .maybeSingle();

  if (data) {
    settings = { ...DEFAULTS, ...data };
  }
  settings.wa_msg_demo = settings.wa_msg_demo || DEFAULT_TEMPLATES.demo;
  settings.wa_msg_lifetime = settings.wa_msg_lifetime || DEFAULT_TEMPLATES.lifetime;
  settings.wa_msg_suspension = settings.wa_msg_suspension || DEFAULT_TEMPLATES.suspension;

  const form = document.getElementById('settingsForm');
  form.innerHTML = `
    <div class="field">
      <label for="sPlatformName">Nom de la plateforme</label>
      <input type="text" id="sPlatformName" value="${escAttr(settings.platform_name)}">
    </div>
    <div class="field">
      <label for="sLifetimePrice">Prix accès à vie (MAD)</label>
      <input type="number" id="sLifetimePrice" value="${settings.lifetime_price / 100}" min="0">
    </div>
    <div class="field">
      <label for="sCurrency">Devise</label>
      <select id="sCurrency">
        <option value="MAD" ${settings.currency === 'MAD' ? 'selected' : ''}>MAD</option>
        <option value="EUR" ${settings.currency === 'EUR' ? 'selected' : ''}>EUR</option>
        <option value="USD" ${settings.currency === 'USD' ? 'selected' : ''}>USD</option>
      </select>
    </div>
    <div class="field">
      <label for="sWhatsapp">WhatsApp support</label>
      <input type="text" id="sWhatsapp" value="${escAttr(settings.whatsapp_support)}" placeholder="+212 6XX-XXXXXX">
    </div>
    <div class="field">
      <label for="sEmail">Email support</label>
      <input type="email" id="sEmail" value="${escAttr(settings.email_support)}">
    </div>
    <div class="field">
      <label for="sColor">Couleur principale</label>
      <input type="color" id="sColor" value="${settings.primary_color}" style="width:60px;height:36px;padding:2px;">
    </div>
    <div class="field" style="grid-column:1/-1;">
      <label for="sInstructions">Instructions de paiement</label>
      <textarea id="sInstructions" rows="3" style="width:100%;">${escAttr(settings.payment_instructions || '')}</textarea>
    </div>
    <div class="field">
      <label for="sValidationTime">Temps de validation</label>
      <input type="text" id="sValidationTime" value="${escAttr(settings.validation_time || '24 à 48 heures')}">
    </div>
    <div style="grid-column:1/-1;margin-top:8px;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <h3 style="font-size:14px;margin:0;">Modèles de messages WhatsApp</h3>
        <button type="button" class="btn btn-ghost" id="resetWaTemplates">Réinitialiser les modèles</button>
      </div>
      <p style="color:var(--muted);font-size:12px;margin:6px 0 14px;">Variables disponibles : <code>{nom}</code> <code>{email}</code> <code>{lien_app}</code> <code>{fin_demo}</code> — une variable vide retire la phrase correspondante.</p>
      <div class="field">
        <label for="sWaDemo">Modèle « Démo »</label>
        <textarea id="sWaDemo" rows="3" style="width:100%;">${escAttr(settings.wa_msg_demo)}</textarea>
      </div>
      <div class="field">
        <label for="sWaLifetime">Modèle « Accès à vie »</label>
        <textarea id="sWaLifetime" rows="3" style="width:100%;">${escAttr(settings.wa_msg_lifetime)}</textarea>
      </div>
      <div class="field">
        <label for="sWaSuspension">Modèle « Suspension »</label>
        <textarea id="sWaSuspension" rows="3" style="width:100%;">${escAttr(settings.wa_msg_suspension)}</textarea>
      </div>
    </div>
    <div style="margin-top:16px;">
      <button type="submit" class="btn btn-accent">Enregistrer</button>
      <span id="settingsStatus" style="margin-left:12px;font-size:13px;color:var(--success);display:none;">${ICONS.check} Enregistré</span>
    </div>
  `;

  document.getElementById('resetWaTemplates').addEventListener('click', () => {
    document.getElementById('sWaDemo').value = DEFAULT_TEMPLATES.demo;
    document.getElementById('sWaLifetime').value = DEFAULT_TEMPLATES.lifetime;
    document.getElementById('sWaSuspension').value = DEFAULT_TEMPLATES.suspension;
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = form.querySelector('[type="submit"]');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Enregistrement...';

    const newSettings = {
      platform_name: document.getElementById('sPlatformName').value,
      lifetime_price: parseInt(document.getElementById('sLifetimePrice').value) * 100,
      currency: document.getElementById('sCurrency').value,
      whatsapp_support: document.getElementById('sWhatsapp').value,
      email_support: document.getElementById('sEmail').value,
      primary_color: document.getElementById('sColor').value,
      payment_instructions: document.getElementById('sInstructions').value,
      validation_time: document.getElementById('sValidationTime').value,
      wa_msg_demo: document.getElementById('sWaDemo').value,
      wa_msg_lifetime: document.getElementById('sWaLifetime').value,
      wa_msg_suspension: document.getElementById('sWaSuspension').value
    };

    const { error } = await supabase
      .from('platform_settings')
      .upsert({ id: 1, ...newSettings }, { onConflict: 'id' });

    if (error) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Enregistrer';
      showToast('Erreur lors de la sauvegarde: ' + error.message, 'error');
      return;
    }

    const { error: planError } = await supabase
      .from('plans')
      .update({ price: newSettings.lifetime_price })
      .eq('is_lifetime', true)
      .eq('is_active', true);

    saveBtn.disabled = false;
    saveBtn.textContent = 'Enregistrer';

    if (planError) {
      showToast('Paramètres sauvegardés mais erreur sync plans: ' + planError.message, 'error');
      return;
    }

    document.getElementById('settingsStatus').style.display = 'inline';
    setTimeout(() => {
      document.getElementById('settingsStatus').style.display = 'none';
    }, 2000);
  });
}
