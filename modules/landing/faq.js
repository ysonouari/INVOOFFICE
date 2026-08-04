/**
 * FAQ accordéon — landing page
 * Gère l'ouverture/fermeture des questions avec animation et accessibilité
 */

function initFaq() {
  const faqQuestions = document.querySelectorAll('.lp-faq-question');

  faqQuestions.forEach(button => {
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      const answer = button.nextElementSibling;

      // Fermer toutes les autres réponses
      faqQuestions.forEach(other => {
        if (other !== button) {
          other.setAttribute('aria-expanded', 'false');
          other.nextElementSibling.hidden = true;
        }
      });

      // Basculer la question courante
      button.setAttribute('aria-expanded', String(!expanded));
      answer.hidden = expanded;
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFaq);
} else {
  initFaq();
}
