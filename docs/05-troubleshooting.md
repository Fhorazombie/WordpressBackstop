# Solución de Problemas (Troubleshooting)

Aquí encontrarás soluciones a los problemas más comunes al usar el generador.

## Problemas con el Sitemap

### "El sitemap está devolviendo HTML en lugar de XML"

**Síntoma:**
El script falla con un mensaje indicando que recibió HTML, o muestra errores de parseo.

**Causas Probables:**
1.  **Redirección a Login:** El sitio requiere autenticación y te está redirigiendo a una página de inicio de sesión.
2.  **URL Incorrecta:** La URL del sitemap no existe y el servidor devuelve una página 404 personalizada (HTML).
3.  **Bloqueo de Seguridad:** Un firewall o plugin de seguridad está bloqueando al User-Agent del script.

**Soluciones:**
*   **Verificar URL:** Abre la `SITEMAP_URL` en tu navegador (en modo incógnito) para asegurar que es accesible públicamente.
*   **Autenticación:** Si el sitio es privado, necesitas pasar cookies de sesión:
    ```bash
    REQUEST_HEADERS='{"Cookie":"wordpress_logged_in_xxx=..."}' npm run generate-sitemap
    ```
*   **User-Agent:** Algunos servidores bloquean bots. Intenta cambiar el User-Agent en `scripts/generate-from-sitemap.js` o vía variable de entorno.

### "No se encontraron URLs en el sitemap"

**Causas Probables:**
*   El sitemap está vacío.
*   El formato del XML no es estándar o compatible con `sitemapper`.
*   Es un índice de sitemaps que apunta a URLs vacías.

**Solución:**
*   Intenta apuntar directamente a un sub-sitemap (ej. `post-sitemap.xml`) en lugar del índice principal (`sitemap_index.xml`).

## Problemas con Listas de URLs

### "Error: El archivo JSON debe contener un array"

**Causa:**
El archivo `.json` proporcionado en `URL_LIST` no tiene la estructura correcta.

**Solución:**
Asegúrate de que el archivo contenga un array JSON válido en la raíz, no un objeto.
*   **Correcto:** `["https://site.com/1", "https://site.com/2"]`
*   **Incorrecto:** `{ "urls": [...] }`

### "Formato de archivo no soportado"

**Causa:**
Estás intentando usar un archivo con una extensión diferente a `.txt` o `.json`.

**Solución:**
Convierte tu lista a uno de los formatos soportados y asegúrate de que la extensión sea correcta.

## Problemas de Ejecución (BackstopJS)

### Timeouts durante `reference` o `test` (Sitios Grandes)

**Síntoma:**
BackstopJS falla con errores de "TimeoutError: waiting for selector..." o simplemente se cuelga, especialmente en sitios con muchas páginas o carga lenta.

**Soluciones:**
1.  **Aumentar Delay:** Edita `scripts/generate-from-sitemap.js` y aumenta el valor de `delay` en la función `generateScenarios` (default: 1500ms).
2.  **Reducir Concurrencia:** En `backstop.json`, reduce `asyncCaptureLimit` a 1 o 2. Esto hará la prueba más lenta pero más estable.
    ```json
    "asyncCaptureLimit": 2
    ```
3.  **Aumentar Timeout Global:** En `scripts/generate-from-sitemap.js`, ajusta la variable `TIMEOUT`.
4.  **Usar Muestreo:** Si usas sitemaps, activa `SITEMAP_SAMPLE_MODE=true` para probar una muestra representativa.
5.  **Dividir la Prueba:** Si usas listas, divide las URLs en varios archivos (`lote1.txt`, `lote2.txt`) y ejecútalos por separado.

### Errores SSL / Certificados

**Síntoma:**
Errores como `ERR_CERT_AUTHORITY_INVALID` o `unable to verify the first certificate`.

**Solución:**
El script intenta detectar automáticamente entornos locales (`.test`, `localhost`) y deshabilitar la verificación SSL. Si esto falla:
*   Fuerza la aceptación de certificados inseguros:
    ```bash
    REJECT_UNAUTHORIZED=false npm run generate-sitemap
    ```
*   Asegúrate de que `backstop.json` tenga la opción `ignoreHTTPSErrors: true` en `engineOptions` (aunque Puppeteer suele manejar esto con `--no-sandbox` y flags adicionales).

## Problemas con Puppeteer Recordings

### El script de grabación falla al ejecutarse en BackstopJS

**Causa:**
Los scripts generados por Chrome Recorder a veces incluyen pasos específicos del navegador que no son compatibles directamente dentro del contexto de BackstopJS.

**Solución:**
*   Revisa el wrapper generado en `backstop_data/engine_scripts/puppet/`.
*   Asegúrate de que el script exporte correctamente la función: `module.exports = async (page, scenario, vp) => { ... }`.
*   Verifica que no esté intentando abrir una nueva instancia de navegador (`puppeteer.launch`), ya que BackstopJS ya provee la instancia `page`.

### Selectores no encontrados (TimeoutError: waiting for selector)

**Causa:**
El script de Puppeteer intenta interactuar con un elemento que no existe en la página, o que ha cambiado de ID/Clase. Esto es común si grabaste el script en un entorno (ej. Producción) y lo ejecutas en otro (ej. Staging) donde el DOM es diferente.

**Solución:**
*   Abre el script original en `puppet/` y busca el selector problemático.
*   Verifica manualmente en el navegador que el selector sea correcto para el entorno actual.
*   Usa selectores más robustos (ej. `aria-label`, texto, atributos `data-testid`) en lugar de clases CSS generadas dinámicamente que pueden cambiar.
