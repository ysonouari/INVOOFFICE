/**
 * WhatsApp — Dashboard admin
 * Bouton WhatsApp par utilisateur : 3 modèles de message pré-remplis.
 * Modèles personnalisables dans Paramètres (platform_settings.wa_msg_*).
 */
import { getSupabase } from '../auth/supabase-client.js';
import { formatDate } from './stats.js';

export const DEFAULT_TEMPLATES = {
  demo: "Bonjour {nom}, votre démo gratuite de 24h est activée ! Connectez-vous sur {lien_app} pour commencer. Votre accès est valable jusqu'au {fin_demo}.",
  lifetime: "Bonjour {nom}, votre accès à vie est activé ! Merci pour votre confiance. Connectez-vous sur {lien_app} pour commencer.",
  suspension: "Bonjour {nom}, votre compte est temporairement suspendu suite à un problème de règlement de votre paiement. Nous vous invitons à régulariser votre paiement pour retrouver votre accès. Merci de votre compréhension."
};

const MENU_ITEMS = [
  { key: 'demo', label: 'Démo' },
  { key: 'lifetime', label: 'Accès à vie' },
  { key: 'suspension', label: 'Suspension' }
];

const LOG_LABELS = { demo: 'démo', lifetime: 'vie', suspension: 'suspension' };

export function normalizePhone(raw) {
  if (raw == null) return '';
  let p = String(raw).replace(/[\s+\-().]/g, '');
  if (!p) return '';
  if (p.startsWith('00')) p = p.slice(2);
  else if (p.startsWith('0')) p = '212' + p.slice(1);
  return /^\d{8,15}$/.test(p) ? p : '';
}

export function hasWhatsapp(user) {
  return normalizePhone(user.whatsapp) !== '';
}

export function suggestTemplate(user) {
  if (user.status === 'inactive' && !user.subs.some(s => s.is_demo === true)) return 'suspension';
  if (user.subs.some(s => s.is_demo === true)) return 'lifetime';
  if (user.status === 'pending') return 'demo';
  if (user.subs.some(s => s.is_demo !== true && s.status === 'active')) return 'lifetime';
  return 'demo';
}

export function fillTemplate(tpl, vars) {
  const emptyKeys = Object.keys(vars).filter(k => vars[k] == null || vars[k] === '');
  let sentences = String(tpl || '').split(/(?<=[.!?])\s+/);
  if (emptyKeys.length) {
    sentences = sentences.filter(s => !emptyKeys.some(k => s.includes(`{${k}}`)));
  }
  let out = sentences.join(' ');
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{${k}}`).join(v == null ? '' : String(v));
  }
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
}

async function getTemplates() {
  const supabase = getSupabase();
  const { data } = await supabase
    .from('platform_settings')
    .select('wa_msg_demo,wa_msg_lifetime,wa_msg_suspension')
    .eq('id', 1)
    .maybeSingle();
  return {
    demo: (data && data.wa_msg_demo) || DEFAULT_TEMPLATES.demo,
    lifetime: (data && data.wa_msg_lifetime) || DEFAULT_TEMPLATES.lifetime,
    suspension: (data && data.wa_msg_suspension) || DEFAULT_TEMPLATES.suspension
  };
}

function buildMessage(template, user) {
  const demo = user.subs.find(s => s.is_demo === true);
  let finDemo = '';
  if (demo && demo.expires_at) finDemo = formatDate(demo.expires_at);
  const vars = {
    nom: user.full_name || user.email || 'cher client',
    email: user.email || '',
    lien_app: window.location.origin,
    fin_demo: finDemo
  };
  return fillTemplate(template, vars);
}

function logWhatsApp(kind, userId, name) {
  const supabase = getSupabase();
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (!user) { console.warn('Log skipped: no authenticated user'); return; }
    supabase.from('admin_logs').insert({
      admin_id: user.id,
      action: 'whatsapp_message',
      target_user_id: userId,
      details: { target_name: name, summary: `Message WhatsApp envoyé (${LOG_LABELS[kind]})` }
    }).then(({ error }) => { if (error) console.warn('Log error:', error); });
  });
}

let activeClose = null;

export async function openWhatsAppMenu(anchor, user) {
  const phone = normalizePhone(user.whatsapp);
  if (!phone) return;

  if (activeClose) { const c = activeClose; activeClose = null; c(false); }

  const templates = await getTemplates();
  const suggested = suggestTemplate(user);

  const menu = document.createElement('div');
  menu.className = 'wa-menu';
  menu.setAttribute('role', 'menu');

  let closed = false;
  const close = (restore = true) => {
    if (closed) return;
    closed = true;
    if (activeClose === close) activeClose = null;
    anchor.setAttribute('aria-expanded', 'false');
    menu.remove();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('mousedown', onOutside, true);
    if (restore) { try { anchor.focus(); } catch (_) {} }
  };

  const choose = (key) => {
    const msg = buildMessage(templates[key], user);
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    logWhatsApp(key, user.id, user.full_name);
    close(false);
  };

  const buttons = MENU_ITEMS.map(item => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wa-menu-item' + (item.key === suggested ? ' wa-suggested' : '');
    b.setAttribute('role', 'menuitem');
    b.setAttribute('aria-label', item.key === suggested ? `${item.label} (suggéré)` : item.label);
    b.textContent = item.label;
    if (item.key === suggested) {
      const badge = document.createElement('span');
      badge.className = 'wa-suggested-badge';
      badge.textContent = 'Suggéré';
      b.appendChild(badge);
    }
    b.addEventListener('click', () => choose(item.key));
    menu.appendChild(b);
    return b;
  });

  document.body.appendChild(menu);

  const r = anchor.getBoundingClientRect();
  const menuW = menu.offsetWidth;
  const menuH = menu.offsetHeight;
  let left = r.left;
  let top = r.bottom + 4;
  if (left + menuW > window.innerWidth - 8) left = window.innerWidth - menuW - 8;
  if (left < 8) left = 8;
  if (top + menuH > window.innerHeight - 8) top = r.top - menuH - 4;
  if (top < 8) top = 8;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';

  const focusables = () => [...menu.querySelectorAll('button')];
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    const items = focusables();
    const idx = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      (items[(idx + 1) % items.length] || items[0])?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      (items[(idx - 1 + items.length) % items.length] || items[0])?.focus();
    } else if (e.key === 'Tab') {
      close();
    }
  };

  const onOutside = (e) => {
    if (!menu.contains(e.target) && e.target !== anchor) close();
  };

  document.addEventListener('keydown', onKey, true);
  document.addEventListener('mousedown', onOutside, true);

  activeClose = close;
  anchor.setAttribute('aria-expanded', 'true');
  const focusTarget = buttons.find(b => b.classList.contains('wa-suggested')) || buttons[0];
  focusTarget.focus();
}
