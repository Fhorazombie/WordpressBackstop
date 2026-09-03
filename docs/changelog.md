# Changelog

---

## [Unreleased] — 2026-09-03 (login + concurrencia)

### Añadido

#### Login con Postgres

El panel web (`npm run ui`) ahora requiere iniciar sesión — pensado para que lo use un equipo (no una sola persona) sin exponer las pruebas de cada quien a cualquiera con el link.

- `DATABASE_URL` (obligatoria) apunta a una base Postgres donde se guardan los usuarios (`users`: email + contraseña con hash `bcrypt`) y las sesiones (`session`, gestionada por `connect-pg-simple` — sobreviven un reinicio del servidor). Ambas tablas se crean solas en el primer arranque.
- El primer registro (`/login.html`, pestaña "Crear cuenta") crea la cuenta inicial y entra automáticamente; a partir de ahí el registro se cierra para cualquiera sin sesión — sólo un usuario ya logueado puede dar de alta a un compañero ("+ Agregar compañero" en la barra lateral).
- Todo el panel (API, `/report`, `/backstop_data/<proyecto>/...`) exige sesión iniciada, salvo `/login.html` y `/api/auth/*`.
- No hay roles: cualquier cuenta tiene acceso completo al panel. Ver `docs/07-dashboard.md` sección 11.

#### Fin de la cola global: corridas en paralelo

Hasta ahora, todos los proyectos (principal y adicionales) compartían un único `backstop.json` en la raíz como "área de staging" para invocar el CLI de BackstopJS, así que sólo podía haber una corrida a la vez en todo el panel — un cuello de botella real para un equipo usando el panel al mismo tiempo.

- Cada corrida ahora recibe su **propio** `backstop.json` aislado (`data/runs/<id>.backstop.json`), pasado al CLI de BackstopJS vía `--config` y a los scripts de generación vía la nueva variable `BACKSTOP_CONFIG_FILE` (con fallback al `backstop.json` de la raíz para quien siga usando sólo la línea de comandos).
- Corridas de **proyectos distintos** (o de un proyecto adicional y el principal) ahora se ejecutan **en paralelo de verdad**, hasta el límite `MAX_CONCURRENT_RUNS` (nueva variable, default `3`, editable desde la pestaña Configuración) — pensado para varias personas disparando pruebas de páginas distintas al mismo tiempo.
- Corridas del **mismo** proyecto se siguen sirviendo en orden entre sí (ahora por una cola *por proyecto*, no una cola global), porque comparten la configuración persistida que hay que leer y volver a guardar al terminar de generar.
- Verificado en vivo: dos proyectos generando y luego corriendo `reference` (Puppeteer real) al mismo tiempo, sin cruzarse — cada uno con sus propios escenarios, bitmaps y reporte.



### Añadido

#### Panel Visual (Dashboard)

Interfaz web completa (`npm run ui`) sobre un servidor Express nuevo en `server/`, como alternativa al flujo por línea de comandos. Referencia completa en [`docs/07-dashboard.md`](07-dashboard.md).

**Funcionalidad principal:**
- Gestión visual de escenarios y viewports del proyecto principal (alta/edición/borrado), sin regenerar desde sitemap/lista.
- Disparo de `generate-from-sitemap` / `generate-from-list` desde el navegador, con log en vivo vía Server-Sent Events.
- Gestión de los archivos de `url-lists/`.
- Programación de pruebas con expresión cron (`node-cron`), historial de corridas, ejecución manual y activar/pausar.
- Editor de las variables principales del `.env`.
- Historial completo de corridas (manuales y programadas) con su log.

**Proyectos múltiples (páginas adicionales aisladas):**
- Cada proyecto adicional tiene su propia carpeta de datos (`backstop_data/<id>/`), su propio modo de generación (Sitemap / URL-Lista / Diseño vs. Live — con subida de imagen incluida), su propia configuración/escenarios/viewports, y sus propias acciones (generar/referencias/pruebas/aprobar/reporte).
- Los schedules pueden apuntar a un proyecto específico o al principal.
- En modo Diseño, "Crear Referencias" queda oculto y "Generar" encadena `generate-design` + `reference` en una sola corrida, ya que la referencia sale directamente de la imagen subida.

**Correcciones de fondo encontradas y resueltas durante el desarrollo:**
- *Condición de carrera al generar en paralelo*: todos los proyectos comparten el mismo `backstop.json` de la raíz para invocar el CLI de BackstopJS; dos corridas concurrentes podían pisarse. Se agregó una cola global en el runner que serializa toda ejecución.
- *Pérdida de viewports/escenarios al regenerar*: la config guardada de un proyecto no se "activaba" en el `backstop.json` compartido antes de generar, así que el script heredaba lo que hubiera quedado ahí (de una corrida vieja, o de otro proyecto) y lo volvía a guardar, pisando lo recién editado. Se corrigió sincronizando siempre la config justo antes de que la corrida salga de la cola (no antes).
- *Mezcla entre el proyecto principal y los adicionales*: el proyecto principal no tenía almacenamiento propio — leía/escribía directamente el `backstop.json` compartido. Ahora tiene su propio archivo persistente (`data/default-project.json`), igual que cada proyecto adicional.

#### Tiempo de espera y contenido con lazy-load

- `SCENARIO_DELAY`: tiempo de espera (ms) configurable antes de capturar cada página — global, por proyecto adicional, o por escenario puntual.
- `backstop_data/engine_scripts/onReady.js`: recorre la página antes de capturar para disparar contenido con lazy-load (imágenes, secciones con IntersectionObserver, sliders), espera a que las imágenes terminen de cargar de verdad (no una pausa fija, para que la Referencia y la Prueba no terminen con alturas de página distintas) y congela animaciones/transiciones CSS antes de la captura. Se activa automáticamente (`onReadyScript` en la config base) para todo escenario nuevo.
- `generate-from-design.js` ahora respeta `BACKSTOP_DATA_DIR`, aislando también sus referencias de diseño por proyecto.

#### Ocultar vs. quitar selectores

- `SCENARIO_HIDE` / `SCENARIO_REMOVE` (proyecto principal, sitemap y lista) y `DESIGN_REMOVE` (modo Diseño, nueva — complementa a `DESIGN_HIDE`): selectores CSS aplicados a todos los escenarios generados. "Ocultar" usa `visibility:hidden` (reserva el espacio); "Quitar" usa `display:none` (el contenido de abajo sube a ocupar el lugar). Expuestos en la pestaña Configuración y en el detalle de cada proyecto adicional.

---

## [Unreleased] — 2026-06-22

### Añadido

#### Modo 3: Comparación Diseño vs. Live URL

Nueva funcionalidad que permite comparar una imagen de diseño estática (exportada de Figma o enviada por un diseñador UX/UI) contra una URL viva utilizando BackstopJS.

**Archivos creados:**
- `scripts/generate-from-design.js` — script principal del nuevo modo

**Archivos modificados:**
- `package.json` — nuevos scripts `design-generate` y `design-compare`
- `scripts/reset-backstop.js` — agrega `backstop_data/design_reference/` al cleanup
- `.gitignore` — agrega `backstop_data/design_reference/` explícitamente
- `.env.EXAMPLE` — documenta las nuevas variables de entorno
- `docs/01-overview.md` — actualiza características, arquitectura y flujo de trabajo
- `docs/04-usage.md` — agrega Modo 3 con workflow completo

**Carpetas nuevas:**
- `img/` — carpeta para guardar imágenes de diseño exportadas de Figma (versionada)
- `backstop_data/design_reference/` — generada en runtime, en `.gitignore`

#### Comportamiento clave

- El **ancho del viewport** se extrae automáticamente del ancho de la imagen PNG/JPG (sin dependencias npm adicionales — lee el chunk IHDR de PNG y el marcador SOF0/SOF2 de JPEG con Node.js puro).
- Dominios locales (`localhost`, `.test`, `.local`, `192.168.x`, `10.x`) se detectan automáticamente: se omite la verificación SSL del navegador (`--ignore-certificate-errors`) y de Node.js (`NODE_TLS_REJECT_UNAUTHORIZED=0`).
- `requireSameDimensions: false` para permitir que el diseño (altura fija) y el live site (altura variable) difieran en alto sin causar falsos positivos.
- La imagen de diseño se sirve como `file://` URL local vía un wrapper HTML — no se necesita servidor HTTP.

#### Comandos

```bash
# Paso 1: generar config (lee DESIGN_IMAGE y DESIGN_URL del .env)
npm run design-generate

# Paso 2: capturar diseño como referencia + comparar contra live
npm run design-compare

# Limpiar todo (incluye design_reference/)
npm run reset
```

#### Variables de entorno nuevas

| Variable | Descripción | Default |
|----------|-------------|---------|
| `DESIGN_IMAGE` | Ruta a la imagen PNG/JPG de diseño | — (requerida) |
| `DESIGN_URL` | URL a comparar (fallback: `SITE_URL`) | — (requerida) |
| `DESIGN_LABEL` | Nombre del escenario en el reporte | nombre del archivo |
| `DESIGN_THRESHOLD` | Tolerancia de diferencia (0–100) | `0.1` |
| `DESIGN_HIDE` | Selectores CSS a ocultar (separados por coma) | — |
| `DESIGN_VIEWPORT_HEIGHT` | Alto del viewport en px | `900` |

#### Configuración activa (`.env`)

```
DESIGN_IMAGE=./img/5a3f4d26-6c45-4686-a963-df06c64f4382.png
DESIGN_URL=http://www.amcedh.casamecate.local/
```
