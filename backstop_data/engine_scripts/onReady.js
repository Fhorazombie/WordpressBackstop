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
 * Este script recorre toda la página hacia abajo en pasos (simulando el
 * scroll real de una persona, que es lo que la mayoría de las técnicas
 * de lazy-load necesitan para dispararse), y vuelve arriba antes de que
 * BackstopJS capture la imagen final.
 */
module.exports = async (page, scenario) => {
  console.log('SCENARIO > ' + scenario.label);

  await page.evaluate(async () => {
    await new Promise(resolve => {
      const step = 400; // px por paso
      const pauseMs = 200; // pausa entre pasos, para dar tiempo a que cargue
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

  // Dar un margen extra para que terminen de cargar las imágenes/secciones
  // que el scroll recién disparó.
  await new Promise(resolve => setTimeout(resolve, 500));

  // Volver arriba: la captura debe empezar desde el tope de la página.
  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(resolve => setTimeout(resolve, 300));
};
