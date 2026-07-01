import { startServer, TestContext } from './runner.mjs';
const t = new TestContext(); await startServer();
if (!(await t.init())) process.exit(1);

// I12+I13: dialog focus trap + restore
await t.page.selectOption('#docType', 'devis'); // trigger recalc

// Open and dismiss a confirm dialog
const dialogResult = await t.page.evaluate(async () => {
  return new Promise(async (res) => {
    const prevEl = document.activeElement && document.activeElement.tagName;
    const { showConfirmDialog } = await import('./js/dialog.js');
    showConfirmDialog('Test').then(result => {
      // After close, check focus was restored
      res({
        result,
        focusRestored: document.activeElement && document.activeElement.tagName === prevEl,
        ariaRole: document.querySelector('.dialog-overlay') ? 'still-present' : 'removed',
      });
    });

    // Simulate Tab queueing: overlay appears asynchronously
    await new Promise(r => setTimeout(r, 100));
    // Press Enter to confirm
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
});

dialogResult.result === true ? t.pass('I12: confirm dialog works') : t.fail('I12');
dialogResult.focusRestored ? t.pass('I13: focus restored') : t.fail('I13');
dialogResult.ariaRole === 'removed' ? t.pass('I14: dialog cleaned up') : t.fail('I14');

// ARIA on dialog overlay
const dialogAria = await t.page.evaluate(async () => {
  return new Promise(res => {
    const { showAlertDialog } = import('./js/dialog.js');
    showAlertDialog('aria test').then(() => res('done'));
    setTimeout(() => {
      const ov = document.querySelector('.dialog-overlay');
      res({
        role: ov ? ov.getAttribute('role') : 'none',
        ariaModal: ov ? ov.getAttribute('aria-modal') : 'none',
        labelledby: ov ? ov.getAttribute('aria-labelledby') : 'none',
        describedby: ov ? ov.getAttribute('aria-describedby') : 'none',
      });
      // Dismiss
      ov && ov.querySelector('button') && ov.querySelector('button').click();
    }, 100);
  });
});

dialogAria.role === 'dialog' ? t.pass('I14: dialog role') : t.fail('I14 role');
dialogAria.ariaModal === 'true' ? t.pass('I14: aria-modal') : t.fail('I14 ariaModal');
dialogAria.labelledby ? t.pass('I14: aria-labelledby') : t.fail('I14 labelledby');
dialogAria.describedby ? t.pass('I14: aria-describedby') : t.fail('I14 describedby');

process.exit((await t.done()) ? 0 : 1);
