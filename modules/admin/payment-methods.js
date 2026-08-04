/**
 * Payment Methods — Dashboard admin
 * Gestion des méthodes de paiement configurables
 */
import { getSupabase } from '../auth/supabase-client.js';
import { showToast } from '../shared/ui.js';

export async function loadPaymentMethods() {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('payment_methods')
    .select('id,name,beneficiary,bank,rib,iban,account_number,instructions,is_active,sort_order')
    .order('sort_order');

  const container = document.getElementById('paymentMethodsTable');
  const methods = data || [];

  container.innerHTML = `
    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead><tr>
          <th>Ordre</th><th>Nom</th><th>Bénéficiaire</th><th>Banque</th><th>Numéro</th><th>Actif</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${methods.map(m => `
            <tr>
              <td>${m.sort_order}</td>
              <td><strong>${esc(m.name)}</strong></td>
              <td>${esc(m.beneficiary || '-')}</td>
              <td>${esc(m.bank || '-')}</td>
              <td style="font-size:12px;">${esc(m.account_number || m.rib || '-')}</td>
              <td>${m.is_active ? '<span class="admin-badge admin-badge-active">Actif</span>' : '<span class="admin-badge admin-badge-inactive">Inactif</span>'}</td>
              <td>
                <button class="btn btn-ghost" style="font-size:11px;" data-action="edit-method" data-id="${m.id}">Modifier</button>
                <button class="btn btn-ghost" style="font-size:11px;color:${m.is_active ? 'var(--danger)' : 'var(--success)'};" data-action="toggle-method" data-id="${m.id}" data-active="${m.is_active}">${m.is_active ? 'Désactiver' : 'Activer'}</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    <button class="btn btn-ghost" style="margin-top:10px;" data-action="add-method">+ Ajouter une méthode</button>
    <div id="methodEditor" style="display:none;margin-top:16px;padding:16px;background:var(--panel-2);border:1px solid var(--border);border-radius:var(--radius);"></div>
  `;

  // Bind events
  container.querySelectorAll('[data-action="toggle-method"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const supabase = getSupabase();
      const isActive = btn.dataset.active === 'true';
      await supabase.from('payment_methods').update({ is_active: !isActive }).eq('id', btn.dataset.id);
      showToast(`Méthode ${isActive ? 'désactivée' : 'activée'}`, isActive ? 'error' : 'success');
      await loadPaymentMethods();
    });
  });

  container.querySelector('[data-action="add-method"]').addEventListener('click', () => showEditor());
  container.querySelectorAll('[data-action="edit-method"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const method = methods.find(m => m.id === btn.dataset.id);
      if (method) showEditor(method);
    });
  });
}

function showEditor(method = null) {
  const editor = document.getElementById('methodEditor');
  editor.style.display = 'block';
  editor.innerHTML = `
    <h4 style="margin:0 0 12px;">${method ? 'Modifier' : 'Ajouter'} une méthode</h4>
    <div class="grid grid-2">
      <div class="field"><label>Nom</label><input type="text" id="emName" value="${escAttr(method?.name || '')}"></div>
      <div class="field"><label>Bénéficiaire</label><input type="text" id="emBeneficiary" value="${escAttr(method?.beneficiary || '')}"></div>
      <div class="field"><label>Banque</label><input type="text" id="emBank" value="${escAttr(method?.bank || '')}"></div>
      <div class="field"><label>RIB</label><input type="text" id="emRib" value="${escAttr(method?.rib || '')}"></div>
      <div class="field"><label>IBAN</label><input type="text" id="emIban" value="${escAttr(method?.iban || '')}"></div>
      <div class="field"><label>Numéro de compte / téléphone</label><input type="text" id="emAccount" value="${escAttr(method?.account_number || '')}"></div>
      <div class="field"><label>Ordre</label><input type="number" id="emOrder" value="${method?.sort_order || 0}"></div>
      <div class="field" style="grid-column:1/-1;"><label>Instructions</label><textarea id="emInstructions" rows="2">${escAttr(method?.instructions || '')}</textarea></div>
    </div>
    <div style="margin-top:12px;display:flex;gap:8px;">
      <button class="btn btn-accent" id="saveMethod">Enregistrer</button>
      <button class="btn btn-ghost" id="cancelMethod">Annuler</button>
    </div>
  `;

  document.getElementById('cancelMethod').addEventListener('click', () => { editor.style.display = 'none'; });
  document.getElementById('saveMethod').addEventListener('click', async () => {
    const supabase = getSupabase();
    const payload = {
      name: document.getElementById('emName').value,
      beneficiary: document.getElementById('emBeneficiary').value,
      bank: document.getElementById('emBank').value,
      rib: document.getElementById('emRib').value,
      iban: document.getElementById('emIban').value,
      account_number: document.getElementById('emAccount').value,
      instructions: document.getElementById('emInstructions').value,
      sort_order: parseInt(document.getElementById('emOrder').value) || 0
    };
    if (method) {
      await supabase.from('payment_methods').update(payload).eq('id', method.id);
    } else {
      await supabase.from('payment_methods').insert(payload);
    }
    showToast(method ? 'Méthode mise à jour' : 'Méthode ajoutée', 'success');
    editor.style.display = 'none';
    await loadPaymentMethods();
  });
}

function esc(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function escAttr(s) { return String(s || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;'); }
