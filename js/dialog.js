function showDialog(message, opts = {}) {
  const type = opts.type || 'alert';
  const title = opts.title || i18next.t('dialog.confirm_title');
  const id = 'dialog-' + Date.now();

  const prevFocus = document.activeElement;

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', id + '-title');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(4,8,16,.75);display:flex;align-items:center;justify-content:center;z-index:9999;';

    const box = document.createElement('div');
    box.className = 'dialog-box';
    box.style.cssText = 'background:var(--panel);border:1px solid var(--border);border-radius:var(--radius-lg);padding:24px;max-width:460px;width:90%;box-shadow:0 8px 40px rgba(0,0,0,.5);';

    const h3 = document.createElement('h3');
    h3.id = id + '-title';
    h3.textContent = title;
    h3.style.cssText = 'margin:0 0 12px;font-size:16px;font-weight:600;color:var(--text);';

    const p = document.createElement('p');
    p.textContent = message;
    p.id = id + '-desc';
    p.style.cssText = 'margin:0 0 20px;font-size:13.5px;color:var(--muted);line-height:1.6;white-space:pre-wrap;';

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;';

    const buttons = [];

    function close(value) {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      if (prevFocus && typeof prevFocus.focus === 'function') {
        try { prevFocus.focus(); } catch (_) {}
      }
      resolve(value);
    }

    function onKey(e) {
      if (e.key === 'Escape') { close(type === 'confirm' ? false : undefined); return; }
      if (e.key === 'Enter') {
        const active = document.activeElement;
        if (active && active.tagName === 'BUTTON' && overlay.contains(active)) {
          active.click();
        } else {
          close(type === 'confirm' ? true : undefined);
        }
        return;
      }
      if (e.key === 'Tab') {
        const focusable = Array.from(overlay.querySelectorAll('button, [tabindex]:not([tabindex="-1"])'));
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last.focus(); }
        } else {
          if (document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        return;
      }
    }
    document.addEventListener('keydown', onKey);

    if (type === 'confirm') {
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = i18next.t('dialog.cancel');
      cancelBtn.style.cssText = 'padding:9px 18px;border-radius:var(--radius);border:1px solid var(--border);background:var(--panel);color:var(--text);font-size:13px;cursor:pointer;';
      cancelBtn.addEventListener('click', () => close(false));
      buttons.push(cancelBtn);

      const confirmBtn = document.createElement('button');
      confirmBtn.textContent = i18next.t('dialog.ok');
      confirmBtn.style.cssText = 'padding:9px 18px;border-radius:var(--radius);border:1px solid var(--accent-2);background:var(--accent-2);color:#fff;font-size:13px;cursor:pointer;';
      confirmBtn.addEventListener('click', () => close(true));
      buttons.push(confirmBtn);

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      confirmBtn.focus();
    } else {
      const okBtn = document.createElement('button');
      okBtn.textContent = i18next.t('dialog.ok');
      okBtn.style.cssText = 'padding:9px 24px;border-radius:var(--radius);border:1px solid var(--accent-2);background:var(--accent-2);color:#fff;font-size:13px;cursor:pointer;';
      okBtn.addEventListener('click', () => close(undefined));
      buttons.push(okBtn);
      actions.appendChild(okBtn);
      okBtn.focus();
    }

    overlay.setAttribute('aria-describedby', id + '-desc');

    box.appendChild(h3);
    box.appendChild(p);
    box.appendChild(actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
}

export function showAlertDialog(message) {
  return showDialog(message, { type: 'alert' });
}

export function showConfirmDialog(message) {
  return showDialog(message, { type: 'confirm' });
}
