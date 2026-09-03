# Panel Visual (Dashboard)

Documentación completa del panel web (`npm run ui`) que se sumó al flujo por línea de comandos: gestión visual de escenarios, proyectos múltiples aislados, programación de pruebas y las variables de entorno nuevas que trajo cada una de estas funcionalidades.

---

## 1. Arrancar el panel

```bash
npm run ui
```

Levanta un servidor Express local en `http://localhost:4780` (configurable con `UI_PORT`, y `UI_HOST` si necesitás escucharlo en otra interfaz). Todo lo que hace el panel usa exactamente los mismos scripts (`generate-from-sitemap.js`, `generate-from-list.js`, `generate-from-design.js`) y el mismo `backstop` (CLI de BackstopJS) que ya usa el flujo de terminal — el panel es una capa encima, no un motor distinto.

**Dependencias que agrega:** `express`, `node-cron`, `multer` (para subir la imagen en proyectos de Diseño). No son necesarias si sólo usás la línea de comandos.

---

## 2. Estructura del código

```
server/
├── index.js                 # App Express: monta las rutas, sirve el panel, arranca el scheduler
├── lib/
│   ├── paths.js              # Rutas de archivos centralizadas (backstop.json, data/*.json, etc.)
│   ├── store.js               # Lectura/escritura genérica de JSON
│   ├── backstopConfig.js      # CRUD de escenarios/viewports del proyecto PRINCIPAL
│   ├── envFile.js             # Lee/escribe las variables conocidas del .env
│   ├── runner.js              # Cola global de ejecuciones + streaming de logs por SSE
│   ├── projects.js            # CRUD de proyectos adicionales (páginas aisladas)
│   ├── projectRunner.js       # Orquesta la ejecución de un pipeline para un proyecto adicional
│   └── scheduler.js           # Programación de pruebas (node-cron)
├── routes/                  # Endpoints REST (uno por área: scenarios, projects, schedules, etc.)
└── public/                  # Frontend: index.html + css/app.css + js/app.js (sin build step)

data/                        # Estado del panel (historial, schedules, proyectos) — en .gitignore, igual que .env
├── default-project.json      # Config persistente del proyecto principal
├── projects.json             # Config persistente de cada proyecto adicional
├── schedules.json            # Programaciones (cron)
├── runs.json                 # Índice del historial de corridas
├── runs/                     # Un archivo .log por corrida
└── uploads/<proyecto>/       # Imágenes subidas para proyectos en modo Diseño
```

---

## 3. Pestañas del panel

### Dashboard
Contadores rápidos (escenarios, viewports, schedules activos, proyectos adicionales, última corrida) y botones de acción rápida (Generar, Crear Referencias, Ejecutar Pruebas, Aprobar Cambios) para el **proyecto principal**, cada uno con el log en vivo de la ejecución.

### Escenarios
Alta, edición y borrado de los escenarios del **proyecto principal** — label, URL, selectores a ocultar/quitar, umbral de comparación, tiempo de espera — y gestión de sus viewports. No hace falta regenerar desde sitemap/lista para hacer un ajuste puntual.

### Proyectos
Ver [sección 4](#4-proyectos-páginas-adicionales-aisladas) más abajo.

### Generar
Dispara `generate-from-sitemap` o `generate-from-list` para el **proyecto principal**, con los mismos parámetros que las variables de entorno (`SITE_URL`, `SITEMAP_URL`, muestreo, límites, tiempo de espera).

### Listas de URLs
Crear, editar y borrar los archivos de `url-lists/` directamente desde la UI (usados por el modo "Desde Lista", tanto del proyecto principal como del modo URL de los proyectos adicionales).

### Programación
Ver [sección 6](#6-programación-schedules) más abajo.

### Configuración
Editor de las variables principales del `.env` del **proyecto principal**: `SITE_URL`, `SITEMAP_URL`, muestreo, `SCENARIO_DELAY`, `SCENARIO_HIDE`/`SCENARIO_REMOVE`, `PROJECT_ID`, `BACKSTOP_DATA_DIR`, `URL_LIST`, headers, SSL, debug.

### Historial
Todas las corridas (manuales y programadas, del proyecto principal y de cualquier proyecto adicional) con su log completo. Cada corrida queda con estado `queued` → `running` → `success`/`failed`.

---

## 4. Proyectos (páginas adicionales aisladas)

Pensado para gestionar varios sitios/páginas desde el mismo panel sin que se pisen entre sí. Cada proyecto adicional tiene:

- **Su propia carpeta de datos**: `backstop_data/<id-del-proyecto>/` (bitmaps de referencia, de test, reporte HTML) — completamente separada de `backstop_data/` del proyecto principal y de la de cualquier otro proyecto. Internamente esto se logra seteando `PROJECT_ID` y `BACKSTOP_DATA_DIR` al id del proyecto en cada corrida.
- **Su propio modo de generación**, elegido al crearlo y fijo después (no se puede cambiar sin borrar y recrear el proyecto):
  - 🗺️ **Sitemap** — crawl completo de un sitio (`SITE_URL`, `SITEMAP_URL`, muestreo, límites).
  - 🔗 **URL / Lista** — una o varias URLs puntuales, escritas directamente en un textarea (se guardan como `url-lists/<id-del-proyecto>.txt` al generar).
  - 🎨 **Diseño vs. Live** — compara una imagen subida (PNG/JPG) contra una URL viva. Ver [sección 5](#5-proyectos-en-modo-diseño).
- **Su propia configuración, escenarios y viewports**, editables desde su panel de detalle (botón "Abrir").
- **Sus propias acciones**: Generar, Crear Referencias, Ejecutar Pruebas, Aprobar Cambios, Ver reporte (`/backstop_data/<id>/html_report/index.html`).
- **Eliminar un proyecto** borra su entrada en `data/projects.json`, toda su carpeta `backstop_data/<id>/`, su lista de URLs y su imagen subida. No se puede deshacer.

### Cómo conviven con el proyecto principal (detalle técnico)

BackstopJS sólo sabe leer/escribir un `backstop.json` en la raíz del repo — es el único archivo que el CLI y los scripts de generación entienden. Como todos los proyectos (principal + adicionales) lo comparten como "área de trabajo" para invocar el CLI, el panel:

1. Guarda la configuración *real* de cada proyecto por separado (`data/default-project.json` para el principal, `data/projects.json` para los adicionales).
2. Justo antes de correr algo para un proyecto — nunca antes, sino recién cuando le toca el turno en la cola (ver más abajo) — copia esa configuración guardada al `backstop.json` de la raíz ("activarla").
3. Corre el paso (generar / referenciar / probar / aprobar).
4. Si el paso generó escenarios nuevos, vuelve a guardar lo que quedó en `backstop.json` en el almacenamiento persistente del proyecto.

Esto es necesario porque, si no se sincroniza así, cualquier operación de un proyecto podría heredar o pisar la configuración que dejó la última corrida de otro proyecto — un bug real que se encontró y corrigió durante el desarrollo (ver el registro en `docs/changelog.md`).

### Cola global de ejecuciones

Como todos los proyectos comparten ese mismo `backstop.json` de la raíz, sólo puede haber **una corrida a la vez** tocándolo. El panel encola automáticamente cualquier corrida que se dispare mientras otra está en curso (estado `queued` en el Historial, con un mensaje "⏳ En cola…" al principio del log) y la arranca apenas termina la anterior. No hace falta coordinar esto manualmente — sólo tené en cuenta que, si disparás varias corridas seguidas, no van a ejecutarse literalmente en paralelo.

---

## 5. Proyectos en modo Diseño

- Subí la imagen (PNG o JPG) desde el panel de detalle del proyecto, en el campo "Imagen de diseño" — se guarda en `data/uploads/<id-del-proyecto>/design.png`.
- El ancho del viewport se toma automáticamente del ancho de la imagen (igual que en `generate-from-design.js` por línea de comandos).
- **El botón "Crear Referencias" no aparece en este modo**: como la referencia sale directamente de la imagen subida (no de una captura del sitio), no tiene sentido como paso manual aparte. El botón **"Generar"** ya encadena `generate-design` + `reference` en una sola corrida — un click deja todo listo para correr "Ejecutar Pruebas" contra el sitio en vivo.
- Campos disponibles: `DESIGN_URL`, etiqueta, umbral de diferencia (%), alto del viewport, selectores a ocultar/quitar (ver sección 7), tiempo de espera antes de capturar.

---

## 6. Programación (schedules)

Crear *schedules* con expresión cron (con atajos: cada hora, diario, etc.) que ejecutan un pipeline configurable — para el **proyecto principal** o para **cualquier proyecto adicional**.

- Al elegir un proyecto en el formulario, el pipeline pasa a mostrar pasos abstractos (Generar / Referencias / Pruebas / Aprobar) en vez de los nombres concretos (`generate-sitemap`, `generate-list`, etc.) — el paso "Generar" se resuelve automáticamente al modo real de ESE proyecto en el momento de disparar.
- Cada schedule guarda el resultado de su última corrida (estado + fecha) y se puede disparar manualmente con "Ejecutar ahora", sin esperar al cron.
- Activar/pausar un schedule no borra su configuración.
- Las corridas programadas pasan por la misma cola global que las manuales — si una corrida programada coincide con otra en curso, se encola igual que cualquier otra.

---

## 7. Ocultar vs. quitar elementos antes de capturar

BackstopJS tiene dos mecanismos distintos para que un elemento no aparezca en la captura, y **no son intercambiables**:

| | Selectores a **ocultar** | Selectores a **quitar** |
|---|---|---|
| Variable (proyecto principal / sitemap / lista) | `SCENARIO_HIDE` | `SCENARIO_REMOVE` |
| Variable (modo Diseño) | `DESIGN_HIDE` | `DESIGN_REMOVE` |
| Campo del escenario | `hideSelectors` | `removeSelectors` |
| CSS que aplica | `visibility: hidden` | `display: none` |
| ¿Reserva el espacio? | **Sí** — queda un hueco en blanco donde estaba | **No** — el contenido de abajo sube a ocupar su lugar |

Si el objetivo es que un header, banner o widget **no deje un hueco** en la captura, hay que usar **"Quitar selectores" / `SCENARIO_REMOVE` (o `DESIGN_REMOVE` en modo Diseño)** — no "Ocultar".

Ambas variables aceptan una lista de selectores CSS separados por coma, y se aplican a **todos** los escenarios que se generen mientras estén configuradas (a diferencia de editar `hideSelectors`/`removeSelectors` a mano en un escenario puntual desde la pestaña Escenarios o el detalle de un proyecto, que sólo afecta a ese escenario).

Un selector no necesita clase ni id: si el elemento es, por ejemplo, un `<header>` único en la página, alcanza con escribir `header` tal cual — es un selector CSS válido por nombre de etiqueta. Para casos más específicos también funciona cualquier selector CSS estándar (`body > header`, `header:first-of-type`, `#id .clase`, etc.).

**Dónde configurarlo:**
- Proyecto principal → pestaña **Configuración** (`SCENARIO_HIDE` / `SCENARIO_REMOVE`, se guardan en `.env`).
- Proyecto adicional (Sitemap o URL/Lista) → su panel de detalle, sección Configuración.
- Proyecto adicional (Diseño) → su panel de detalle, campos "Ocultar selectores" / "Quitar selectores".
- Por línea de comandos: `SCENARIO_HIDE=.cookie-banner SCENARIO_REMOVE=header npm run generate-sitemap`.

---

## 8. Tiempo de espera antes de capturar (`SCENARIO_DELAY`) y contenido con lazy-load

Ver el detalle completo en `docs/03-configuration.md` (tabla de variables) y `docs/05-troubleshooting.md` (sección "Secciones en blanco en la captura"). En resumen:

- `SCENARIO_DELAY` (ms) controla cuánto espera BackstopJS, una vez cargada la página, antes de sacar la foto. Configurable de forma global, por proyecto adicional, o por escenario puntual.
- Para sitios con contenido de carga diferida (lazy-load) que sólo aparece al hacer scroll, el delay solo no alcanza: `backstop_data/engine_scripts/onReady.js` recorre la página antes de capturar (disparando ese contenido), espera a que las imágenes terminen de cargar de verdad y congela animaciones/transiciones CSS, para que la Referencia y la Prueba siempre queden en el mismo estado visual. Se activa automáticamente (`onReadyScript` en la config base) en todo escenario nuevo.

---

## 9. Variables de entorno agregadas por el panel

Además de las ya documentadas en `docs/03-configuration.md`, el panel introdujo:

| Variable | Alcance | Descripción |
|---|---|---|
| `UI_PORT` | Servidor del panel | Puerto donde escucha `npm run ui` (default `4780`). |
| `UI_HOST` | Servidor del panel | Interfaz donde escucha (default `0.0.0.0`). |
| `SCENARIO_DELAY` | Generación de escenarios | Ver sección 8. |
| `SCENARIO_HIDE` / `SCENARIO_REMOVE` | Generación de escenarios (sitemap/lista) | Ver sección 7. |
| `DESIGN_REMOVE` | Modo Diseño | Ver sección 7 (par de `DESIGN_HIDE`, que ya existía). |

Ninguna de estas variables es obligatoria — el comportamiento por defecto es idéntico al de antes de que existieran.

---

## 10. Notas de migración

Si venís de una versión del proyecto anterior a que existiera `data/default-project.json`: la primera vez que el panel lee la configuración del proyecto principal, si ese archivo todavía no existe pero `backstop.json` sí, lo adopta como punto de partida (siempre que nunca hayas usado el sistema de proyectos múltiples — si `data/projects.json` ya existe, arranca vacío en su lugar, para no heredar por accidente lo que haya quedado en `backstop.json` de la corrida de otro proyecto). Después de esa primera vez, `data/default-project.json` es la fuente de verdad y `backstop.json` vuelve a ser sólo el archivo de trabajo que usa el CLI.
