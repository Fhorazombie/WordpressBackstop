/**
 * onReady.js — se ejecuta después de que BackstopJS espera el `delay`
 * configurado del escenario, y justo antes de tomar la captura.
 *
 * Muchos sitios (WordPress con lazy-load de imágenes, secciones que
 * aparecen recién cuando entran en pantalla vía IntersectionObserver,
 * sliders, videos, etc.) no terminan de renderizar su contenido si la
 * página nunca se scrollea: BackstopJS calcula el alto total de la
 * página y toma la captura completa "de una", sin que nada dispare ese
 * contenido — por más alto que sea el `delay`, si nadie scrollea, ese
 * contenido queda en blanco.
 *
 * Este script:
 *   1. Recorre toda la página hacia abajo en pasos (simulando el scroll
 *      real de una persona, que es lo que la mayoría de las técnicas de
 *      lazy-load necesitan para dispararse).
 *   2. Espera a que las imágenes disparadas realmente terminen de cargar
 *      — no una pausa fija — porque una espera fija puede alcanzar en una
 *      corrida y quedarse corta en la siguiente (según qué tan rápido
 *      responda el servidor en ese momento), y eso hace que la Referencia
 *      y la Prueba terminen con alturas de página distintas: ahí es donde
 *      un reporte de BackstopJS empieza a verse "raro" (mismatch de
 *      dimensiones, contenido desalineado) aunque visualmente el sitio
 *      esté bien las dos veces.
 *   3. Vuelve arriba (la captura debe empezar desde el tope) y espera de
 *      nuevo a que las imágenes terminen.
 *   4. Congela animaciones y transiciones CSS (contadores que suman
 *      números, carruseles, fade-ins) para que la Referencia y la Prueba
 *      capturen siempre el mismo cuadro final, en vez de lo que sea que
 *      esté animando en ese instante.
 */
module.exports = async (page, scenario) => {
  console.log('SCENARIO > ' + scenario.label);

  const waitForImages = () => page.evaluate(async () => {
    const images = Array.from(document.images);
    await Promise.all(images.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
      });
    }));
  });

  // 1. Recorrer la página hacia abajo, en pasos, para disparar el lazy-load.
  await page.evaluate(async () => {
    await new Promise(resolve => {
      const step = 400; // px por paso
      const pauseMs = 200; // pausa entre pasos
      const maxSteps = 60; // tope de seguridad ante scroll infinito

      let scrolled = 0;
      let steps = 0;

      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, step);
        scrolled += step;
        steps += 1;

        if (scrolled >= scrollHeight || steps >= maxSteps) {
          clearInterval(timer);
          resolve();
        }
      }, pauseMs);
    });
  });

  // 2. Esperar a que las imágenes disparadas por el scroll terminen de
  //    cargar de verdad, para que la altura final de la página sea
  //    consistente entre la Referencia y la Prueba.
  await waitForImages();
  await new Promise(resolve => setTimeout(resolve, 300));

  // 3. Volver arriba: la captura debe empezar desde el tope de la página.
  await page.evaluate(() => window.scrollTo(0, 0));
  await waitForImages();
  await new Promise(resolve => setTimeout(resolve, 400));

  // 4. Congelar animaciones/transiciones CSS: cualquier animación queda
  //    en su cuadro final (duración 0), y las transiciones se desactivan,
  //    para que dos corridas nunca difieran por caer en un instante
  //    distinto de una misma animación.
  await page.addStyleTag({
    content: `*, *::before, *::after {
      animation-play-state: paused !important;
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition: none !important;
      scroll-behavior: auto !important;
    }`
  });
  await new Promise(resolve => setTimeout(resolve, 100));
};
