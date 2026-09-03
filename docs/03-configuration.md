# Configuración

El proyecto es altamente configurable a través de variables de entorno y el archivo `backstop.json`.

## Variables de Entorno

Puedes configurar el comportamiento del generador pasando variables de entorno antes del comando o creando un archivo `.env` en la raíz del proyecto.

| Variable | Descripción | Valor por Defecto |
| :--- | :--- | :--- |
| `SITE_URL` | La URL base de tu sitio web. | `https://wordpress.org` |
| `SITEMAP_URL` | La URL completa del sitemap XML. | `${SITE_URL}/sitemap.xml` |
| `URL_LIST` | Ruta al archivo de lista de URLs (.txt o .json) para `generate-from-list.js`. | N/A (Requerido para `generate-list`) |
| `MAX_URLS` | Límite máximo de URLs a procesar del sitemap. Útil para pruebas rápidas. | `null` (sin límite) |
| `TIMEOUT` | Tiempo de espera máximo (en ms) para descargar el sitemap. | `30000` (30s) |
| `SCENARIO_DELAY` | Tiempo de espera (en ms) antes de capturar cada página, una vez cargada. Súbelo para sitios con animaciones, lazy-load o contenido que tarda en renderizar. | `5000` (`1000` en modo Diseño) |
| `SCENARIO_HIDE` | Selectores CSS (separados por coma) a **ocultar** en todos los escenarios generados. Usa `visibility: hidden` — el elemento desaparece pero su espacio queda reservado (un hueco en blanco). | N/A |
| `SCENARIO_REMOVE` | Selectores CSS (separados por coma) a **quitar** en todos los escenarios generados. Usa `display: none` — el elemento sale del flujo del documento y el contenido de abajo sube a ocupar su lugar. Para un elemento sin clase ni id alcanza con su nombre de etiqueta (ej. `header`). | N/A |
| `DEBUG` | Activa logs detallados de depuración. | `false` |
| `REQUEST_HEADERS` | JSON string con headers HTTP personalizados (ej. cookies de autenticación). | Ver abajo |
| `REJECT_UNAUTHORIZED`| Fuerza la validación estricta de SSL (`true`/`false`). | Auto-detectado (false para local) |
| `SITEMAP` | Habilita (`1`) o deshabilita (`0`) el procesamiento del sitemap en `generate-from-sitemap.js`. | `1` |
| `PUPPET` | Habilita (`1`) o deshabilita (`0`) la búsqueda de scripts en `puppet/`. | `1` |
| `SITEMAP_SAMPLE_MODE` | Activa el modo de muestreo para sitios grandes. | `false` |
| `SAMPLE_SIZE` | Número de URLs a extraer por cada sub-sitemap (solo con `SITEMAP_SAMPLE_MODE=true`). | `5` |

### Headers por Defecto
Si no se especifica `REQUEST_HEADERS`, se usa:
```json
{
  "User-Agent": "Mozilla/5.0 (compatible; BackstopJS-SitemapParser/1.0)",
  "Accept": "application/xml, text/xml, */*"
}
```

### Ejemplos de Configuración

**Prueba básica:**
```bash
SITE_URL=https://mi-sitio.com npm run generate-sitemap
```

**Usar un sitemap específico:**
```bash
SITEMAP_URL=https://mi-sitio.com/sitemap_index.xml npm run generate-sitemap
```

**Sitio con autenticación (Basic Auth o Cookies):**
```bash
REQUEST_HEADERS='{"Cookie":"session_id=xyz123"}' npm run generate-sitemap
```

## Modo de Muestreo (Sitios Grandes)

Para sitios con más de 100 URLs, el modo de muestreo permite extraer una muestra representativa de cada sección del sitio, reduciendo significativamente el tiempo de prueba.

### ¿Cómo funciona?

1. **Detección de sitemaps anidados**: Cuando el sitemap principal (`sitemap.xml`) es un índice que contiene referencias a otros sitemaps (ej: `page-sitemap.xml`, `post-sitemap.xml`), el script navega a cada uno.

2. **Selección por fecha**: De cada sub-sitemap, se seleccionan las URLs más recientes basándose en la etiqueta `<lastmod>`. Si no hay fecha disponible, se toman las últimas URLs del listado.

3. **Límite configurable**: Por defecto se extraen 5 URLs por sub-sitemap, pero puedes ajustarlo con `SAMPLE_SIZE`.

### Ejemplo de uso

```bash
# Activar modo de muestreo (5 URLs por sub-sitemap)
SITEMAP_SAMPLE_MODE=true npm run generate-sitemap

# Personalizar el tamaño de la muestra (10 URLs por sub-sitemap)
SITEMAP_SAMPLE_MODE=true SAMPLE_SIZE=10 npm run generate-sitemap
```

### Ejemplo de salida

```
📥 Descargando sitemap: https://example.com/sitemap.xml
🔍 Verificando tipo de contenido...

🎯 Modo de muestreo activado: 5 URLs por sub-sitemap
📋 Detectado sitemap index con 16 sub-sitemaps

   📥 Procesando: https://example.com/page-sitemap.xml
      ✓ 5/45 URLs seleccionadas (más recientes)
   📥 Procesando: https://example.com/post-sitemap.xml
      ✓ 5/120 URLs seleccionadas (más recientes)
   ...

✅ Total de URLs muestreadas: 80
```

### Caso de uso típico

| Sitio | URLs totales | Con muestreo (5/sub) | Reducción |
|-------|-------------|---------------------|-----------|
| Blog pequeño | 50 | 50 | 0% |
| Sitio corporativo | 200 | ~40 | 80% |
| E-commerce | 1,000+ | ~80 | 92% |

## Configuración de BackstopJS (`backstop.json`)

El archivo `backstop.json` define cómo se ejecutan las pruebas. Aunque el script `generate-from-sitemap.js` genera la sección `scenarios`, puedes personalizar la configuración base.

### Viewports (Tamaños de Pantalla)
Define en qué resoluciones se probará el sitio.
```json
"viewports": [
  {
    "label": "phone",
    "width": 320,
    "height": 480
  },
  {
    "label": "tablet",
    "width": 1024,
    "height": 768
  }
]
```

### Engine Options
Configuración de Puppeteer.
```json
"engineOptions": {
  "args": ["--no-sandbox"]
}
```

### Límites de Concurrencia
Controla la carga en tu máquina y en el servidor.
*   `asyncCaptureLimit`: Cuántas capturas de pantalla tomar en paralelo (default: 5).
*   `asyncCompareLimit`: Cuántas comparaciones de imágenes hacer en paralelo (default: 50).

> **Nota:** Si experimentas timeouts o errores de red, reduce `asyncCaptureLimit`.
