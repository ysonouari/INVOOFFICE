/**
 * Settings — Dashboard admin
 * Paramètres de la plateforme stockés dans Supabase
 */
import { getSupabase } from '../auth/supabase-client.js';
import { showToast } from '../shared/ui.js';

const DEFAULTS = {
  platform_name: 'INVOOFFICE',
  lifetime_price: 20000,
  currency: 'MAD',
  whatsapp_support: '',
  email_support: 'contact@invooffice.com',
  primary_color: '#6d6cf0'
};

export async function loadSettings() {
  const supabase = getSupabase();
  let settings = { ...DEFAULTS };

  const { data } = await supabase
    .from('platform_settings')
    .select('platform_name,lifetime_price,currency,whatsapp_support,email_support,primary_color,payment_instructions,validation_time')
    .eq('id', 1)
    .maybeSingle();

  if (data) {
    settings = { ...DEFAULTS, ...data };
  }

  const form = document.getElementById('settingsForm');
  form.innerHTML = `
    <div class="field">
      <label>Nom de la plateforme</label>
      <input type="text" id="sPlatformName" value="${escAttr(settings.platform_name)}">
    </div>
    <div class="field">
      <label>Prix accès à vie (MAD)</label>
      <input type="number" id="sLifetimePrice" value="${settings.lifetime_price / 100}" min="0">
    </div>
    <div class="field">
      <label>Devise</label>
      <select id="sCurrency">
        <option value="MAD" ${settings.currency === 'MAD' ? 'selected' : ''}>MAD</option>
        <option value="EUR" ${settings.currency === 'EUR' ? 'selected' : ''}>EUR</option>
        <option value="USD" ${settings.currency === 'USD' ? 'selected' : ''}>USD</option>
      </select>
    </div>
    <div class="field">
      <label>WhatsApp support</label>
      <input type="text" id="sWhatsapp" value="${escAttr(settings.whatsapp_support)}" placeholder="+212 6XX-XXXXXX">
    </div>
    <div class="field">
      <label>Email support</label>
      <input type="email" id="sEmail" value="${escAttr(settings.email_support)}">
    </div>
    <div class="field">
      <label>Couleur principale</label>
      <input type="color" id="sColor" value="${settings.primary_color}" style="width:60px;height:36px;padding:2px;">
    </div>
    <div class="field" style="grid-column:1/-1;">
      <label>Instructions de paiement</label>
      <textarea id="sInstructions" rows="3" style="width:100%;">${escAttr(settings.payment_instructions || '')}</textarea>
    </div>
    <div class="field">
      <label>Temps de validation</label>
      <input type="text" id="sValidationTime" value="${escAttr(settings.validation_time || '24 à 48 heures')}">
    </div>
    <div style="margin-top:16px;">
      <button type="submit" class="btn btn-accent">Enregistrer</button>
      <span id="settingsStatus" style="margin-left:12px;font-size:13px;color:var(--success);display:none;">✓ Enregistré</span>
    </div>
  `;

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
      validation_time: document.getElementById('sValidationTime').value
    };

    const { error } = await supabase
      .from('platform_settings')
      .upsert({ id: 1, ...newSettings }, { onConflict: 'id' });

    saveBtn.disabled = false;
    saveBtn.textContent = 'Enregistrer';

    if (error) {
      showToast('Erreur lors de la sauvegarde: ' + error.message, 'error');
      return;
    }

    document.getElementById('settingsStatus').style.display = 'inline';
    setTimeout(() => {
      document.getElementById('settingsStatus').style.display = 'none';
    }, 2000);
  });
}

function escAttr(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
