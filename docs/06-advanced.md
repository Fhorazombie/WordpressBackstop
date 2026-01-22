# Uso Avanzado y Personalización

Para usuarios que necesitan ir más allá de la configuración básica.

## Filtrado de URLs

Si tu sitemap es muy grande o contiene URLs que no deseas probar (como archivos PDF, imágenes directas, o páginas de administración), puedes modificar la lógica de filtrado en `scripts/generate-from-sitemap.js`.

Busca la función `getAllUrlsFromSitemap` o donde se procesan las URLs y añade un filtro:

```javascript
// Ejemplo: Excluir URLs que contengan '/category/' o '/tag/'
const filteredUrls = urls.filter(url => 
  !url.includes('/category/') && 
  !url.includes('/tag/') &&
  !url.endsWith('.pdf')
);
```

## Integración con Puppeteer Recordings

BackstopJS es excelente para pruebas estáticas, pero a veces necesitas probar interacciones (clic en menús, llenar formularios, scroll infinito). Puedes usar las grabaciones de Chrome DevTools para esto.

1.  **Grabar:** Abre Chrome DevTools > Recorder y graba tu flujo.
2.  **Exportar:** Exporta la grabación como "Puppeteer script" (.js).
3.  **Colocar:** Guarda el archivo `.js` en la carpeta `puppet/` en la raíz del proyecto.
4.  **Generar:** Ejecuta `npm run generate-sitemap`.

El script detectará automáticamente los archivos en `puppet/`, creará "wrappers" compatibles con BackstopJS y los añadirá como escenarios en `backstop.json`.

### Cómo funciona el Wrapper
El script `generate-from-sitemap.js` transforma el código de Puppeteer independiente para que funcione dentro de BackstopJS:
*   Elimina `puppeteer.launch()` y `browser.close()`.
*   Convierte el script en un módulo que exporta `async (page, scenario, vp)`.
*   Permite que BackstopJS inyecte la instancia de `page` existente.

## Personalización de Escenarios

Puedes modificar la función `generateScenarios` en `scripts/generate-from-sitemap.js` para añadir propiedades avanzadas de BackstopJS a cada escenario generado automáticamente:

```javascript
function generateScenarios(urls) {
  return urls.map(url => ({
    label: generateLabel(url),
    // ...
    delay: 2000, // Aumentar espera
    hideSelectors: ['#anuncio-dinamico', '.fecha-actual'], // Ocultar elementos cambiantes
    removeSelectors: ['.cookie-banner'], // Eliminar elementos del DOM
    misMatchThreshold: 0.5, // Ser más tolerante con las diferencias (0.1% default)
    // ...
  }));
}
```

## Integración CI/CD

Para integrar este proyecto en un pipeline de CI/CD (Jenkins, GitHub Actions, GitLab CI):

1.  Asegúrate de instalar las dependencias (`npm ci`).
2.  Ejecuta las pruebas (`npm run test`).
3.  Configura el pipeline para que falle si `npm run test` devuelve un código de salida distinto de 0.
4.  Guarda los reportes (`backstop_data/html_report`) como artefactos de la build para poder revisarlos en caso de fallo.

Ejemplo básico para GitHub Actions:

```yaml
steps:
  - uses: actions/checkout@v2
  - uses: actions/setup-node@v2
    with:
      node-version: '16'
  - run: npm ci
  - run: npm run generate-sitemap
    env:
      SITE_URL: ${{ secrets.STAGING_URL }}
  - run: npm run reference # O descargar referencias previas
  - run: npm run test
```
