# Visión General del Proyecto

## Introducción

**BackstopJS Sitemap Generator** es una herramienta de automatización diseñada para facilitar las pruebas de regresión visual en sitios web. Su función principal es generar automáticamente escenarios de prueba para [BackstopJS](https://github.com/garris/BackstopJS) a partir de múltiples fuentes: mapas del sitio (sitemap.xml), listas de URLs personalizadas o grabaciones de interacciones de usuario.

Este proyecto es ideal para desarrolladores y equipos de QA que necesitan asegurar que los cambios en el código o contenido no rompan visualmente el sitio web.

## 🚀 Características Principales

*   **Múltiples Fuentes de Generación**:
    *   **Sitemaps**: Extrae todas las URLs de un `sitemap.xml` (incluyendo sitemaps indexados anidados).
    *   **Listas de URLs**: Permite definir escenarios específicos mediante archivos `.txt` o `.json`.
    *   **Imagen de Diseño vs. Live URL**: Compara imágenes exportadas de Figma (o enviadas por diseñador UX/UI) contra la implementación real en el navegador para medir fidelidad pixel a pixel.
*   **Soporte para Puppeteer Recordings**: Integra scripts de grabación de Puppeteer para probar flujos de usuario complejos (interacciones, formularios, clics) junto con las pruebas estáticas.
*   **Reporte de Progreso Visual**: Incluye una herramienta de CLI (`backstop-progress.js`) que muestra una barra de progreso en tiempo real, estimaciones de tiempo (ETA) y estadísticas detalladas durante la ejecución de las pruebas.
*   **Muestreo Inteligente**: Capacidad de extraer una muestra representativa de URLs de sitemaps grandes para pruebas rápidas (smoke tests).
*   **Configuración Flexible**: Personalización total mediante variables de entorno (URLs, límites, timeouts, headers).
*   **Manejo de Errores Robusto**: Detecta problemas comunes como respuestas HTML en lugar de XML, errores de SSL en entornos locales y dominios `.test`, y timeouts.

## 🏗 Arquitectura del Proyecto

El proyecto se estructura de la siguiente manera:

```
backstop/
├── backstop.json                    # Archivo de configuración principal de BackstopJS (generado)
├── package.json                     # Dependencias y scripts NPM
├── .env                             # Variables de entorno (no versionado)
├── scripts/
│   ├── generate-from-sitemap.js     # Generador desde sitemap.xml
│   ├── generate-from-list.js        # Generador desde listas de URLs (.txt, .json)
│   ├── generate-from-design.js      # Generador para comparación Diseño vs. Live URL
│   ├── backstop-progress.js         # Wrapper para ejecutar BackstopJS con barra de progreso
│   └── reset-backstop.js            # Utilidad para limpiar reportes y referencias
├── img/                             # Imágenes de diseño exportadas de Figma / diseñador
├── backstop_data/                   # Directorio de datos de BackstopJS
│   ├── bitmaps_reference/           # Imágenes de referencia (la "verdad" visual)
│   ├── bitmaps_test/                # Imágenes de la prueba actual
│   ├── engine_scripts/              # Scripts de Puppeteer (cookies, interacciones)
│   │   └── puppet/                  # Wrappers generados para recordings
│   ├── design_reference/            # Copia de la imagen de diseño + wrapper HTML (generado)
│   └── html_report/                 # Reportes visuales generados
├── puppet/                          # Directorio para colocar scripts de grabación de Puppeteer (.js)
└── url-lists/                       # Directorio para listas de URLs (.txt, .json)
```

### Flujo de Trabajo

**Modo sitemap / lista de URLs:**
1.  **Generación**: Se ejecuta `generate-from-sitemap.js` o `generate-from-list.js` para crear `backstop.json`.
2.  **Referencia**: BackstopJS toma capturas del estado "correcto" del sitio (`npm run reference`).
3.  **Prueba**: BackstopJS compara el estado actual contra las referencias (`npm run test`).
4.  **Reporte**: Se genera un reporte HTML con las diferencias visuales.

**Modo Diseño vs. Live URL:**
1.  **Generación**: `generate-from-design.js` detecta las dimensiones de la imagen de diseño, crea el `backstop.json` con el viewport al ancho exacto de la imagen, y prepara el wrapper HTML local.
2.  **Comparación**: `npm run design-compare` captura la imagen de diseño como referencia y luego captura la URL viva para hacer el diff.
3.  **Reporte**: El mismo reporte HTML muestra lado a lado el diseño (izquierda) vs. la implementación real (derecha).

## Panel Visual (Dashboard)

Todo lo descripto arriba también está disponible como interfaz web (`npm run ui`), sin tocar la terminal: gestión visual de escenarios, un sistema de **proyectos adicionales** para manejar varias páginas/sitios en paralelo (cada uno con su propia carpeta de datos aislada y su propio modo de generación), y programación de pruebas por cron. Ver la referencia completa en [`07-dashboard.md`](07-dashboard.md).
