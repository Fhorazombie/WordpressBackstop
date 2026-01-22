# Visión General del Proyecto

## Introducción

**BackstopJS Sitemap Generator** es una herramienta de automatización diseñada para facilitar las pruebas de regresión visual en sitios web. Su función principal es generar automáticamente escenarios de prueba para [BackstopJS](https://github.com/garris/BackstopJS) a partir de múltiples fuentes: mapas del sitio (sitemap.xml), listas de URLs personalizadas o grabaciones de interacciones de usuario.

Este proyecto es ideal para desarrolladores y equipos de QA que necesitan asegurar que los cambios en el código o contenido no rompan visualmente el sitio web.

## 🚀 Características Principales

*   **Múltiples Fuentes de Generación**:
    *   **Sitemaps**: Extrae todas las URLs de un `sitemap.xml` (incluyendo sitemaps indexados anidados).
    *   **Listas de URLs**: Permite definir escenarios específicos mediante archivos `.txt` o `.json`.
*   **Soporte para Puppeteer Recordings**: Integra scripts de grabación de Puppeteer para probar flujos de usuario complejos (interacciones, formularios, clics) junto con las pruebas estáticas.
*   **Reporte de Progreso Visual**: Incluye una herramienta de CLI (`backstop-progress.js`) que muestra una barra de progreso en tiempo real, estimaciones de tiempo (ETA) y estadísticas detalladas durante la ejecución de las pruebas.
*   **Muestreo Inteligente**: Capacidad de extraer una muestra representativa de URLs de sitemaps grandes para pruebas rápidas (smoke tests).
*   **Configuración Flexible**: Personalización total mediante variables de entorno (URLs, límites, timeouts, headers).
*   **Manejo de Errores Robusto**: Detecta problemas comunes como respuestas HTML en lugar de XML, errores de SSL en entornos locales, y timeouts.

## 🏗 Arquitectura del Proyecto

El proyecto se estructura de la siguiente manera:

```
backstop/
├── backstop.json                    # Archivo de configuración principal de BackstopJS (generado)
├── package.json                     # Dependencias y scripts NPM
├── .env                             # Variables de entorno (opcional)
├── scripts/
│   ├── generate-from-sitemap.js     # Generador desde sitemap.xml
│   ├── generate-from-list.js        # Generador desde listas de URLs (.txt, .json)
│   ├── backstop-progress.js         # Wrapper para ejecutar BackstopJS con barra de progreso
│   └── reset-backstop.js            # Utilidad para limpiar reportes y referencias
├── backstop_data/                   # Directorio de datos de BackstopJS
│   ├── bitmaps_reference/           # Imágenes de referencia (la "verdad" visual)
│   ├── bitmaps_test/                # Imágenes de la prueba actual
│   ├── engine_scripts/              # Scripts de Puppeteer (cookies, interacciones)
│   │   └── puppet/                  # Wrappers generados para recordings
│   └── html_report/                 # Reportes visuales generados
├── puppet/                          # Directorio para colocar scripts de grabación de Puppeteer (.js)
└── url-lists/                       # Directorio para listas de URLs (.txt, .json)
```

### Flujo de Trabajo

1.  **Generación**: Se ejecuta uno de los scripts de generación (`generate-from-sitemap.js` o `generate-from-list.js`) para crear la configuración.
    *   El script lee la fuente (sitemap o lista) y la carpeta `puppet/`.
    *   Se crea o actualiza `backstop.json` con los escenarios detectados.
2.  **Referencia**: BackstopJS toma capturas de pantalla del estado "correcto" del sitio (`npm run reference` o `npm run reference:progress`).
3.  **Prueba**: BackstopJS toma nuevas capturas y las compara píxel a píxel con las referencias (`npm run test` o `npm run test:progress`).
4.  **Reporte**: Se genera un reporte HTML mostrando las diferencias visuales.
