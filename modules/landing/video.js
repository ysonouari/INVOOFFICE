/*
  video — lecture paresseuse de la vidéo de démo de la landing.
  La vidéo reste au repos (preload="metadata") tant qu'elle n'approche pas du
  viewport : au déclenchement de l'IntersectionObserver elle est jouée, puis
  mise en pause dès qu'elle sort de la zone. Évite de transférer ~1,2 Mo au
  chargement initial de la page.
*/
const video = document.getElementById('demoVideo');
if (video) {
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        }
      },
      { rootMargin: '200px 0px', threshold: 0.2 }
    );
    observer.observe(video);
  } else {
    video.play().catch(() => {});
  }
}