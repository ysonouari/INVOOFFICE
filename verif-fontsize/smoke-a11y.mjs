import { startServer, TestContext } from './runner.mjs';
const t = new TestContext(); await startServer();
if (!(await t.init())) { console.log('INIT FAILED'); process.exit(1); }

// Quick sanity: page loads, console clean, focus-visible CSS present
const checks = await t.page.evaluate(async () => {
  const results = {};
  // C2/C5: focus-visible rule exists
  results.focusVisible = [...document.styleSheets]
    .some(s => { try { return [...s.cssRules].some(r => r.selectorText && r.selectorText.includes(':focus-visible')); } catch { return false; } });
  // C3: checkbox NOT display:none
  const toggleInput = document.querySelector('label.toggle input');
  results.checkboxVisible = toggleInput && getComputedStyle(toggleInput).display !== 'none';
  // C4: landmarks exist
  results.hasMain = !!document.querySelector('main');
  results.hasNav = !!document.querySelector('nav');
  // I14: ARIA on modals
  const coModal = document.getElementById('companyModalOverlay');
  results.ariaModal = coModal.getAttribute('role') === 'dialog' && coModal.getAttribute('aria-modal') === 'true';
  // I14: dialog ARIA
  results.modalLabelledBy = !!coModal.getAttribute('aria-labelledby');
  return results;
});

const pass = (label, val) => val ? t.pass(label) : t.fail(label);
pass('C2/C5: focus-visible CSS', checks.focusVisible);
pass('C3: checkbox visible', checks.checkboxVisible);
pass('C4: main landmark', checks.hasMain);
pass('C4: nav landmark', checks.hasNav);
pass('I14: role=dialog+aria-modal', checks.ariaModal);
pass('I14: aria-labelledby', checks.modalLabelledBy);

process.exit((await t.done()) ? 0 : 1);
