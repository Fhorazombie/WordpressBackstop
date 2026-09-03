## 🎬 *Nota del autor*

*Este proyecto no nació en un garaje lleno de pizarrones ni en una noche interminable de café y código.*  
*Nació de una conversación con la inteligencia artificial. Y sí, eso incomodará a más de uno.*

*La intención nunca fue crear una obra “profesional”, ni sentar cátedra, ni competir en festivales de ingeniería.*  
*Esto es, más bien, una **pieza experimental**: un ejercicio consciente para explorar hasta dónde puede llegar la IA cuando se le pide construir una herramienta útil para el día a día. En este caso, facilitar y acelerar el testeo de sitios WordPress.*

*Puedes juzgarlo. Todos somos críticos.*  
*Puedes decir que no debería usarse en producción. Y tendrás toda la maldita razón.*

*Este proyecto **no pretende ser una solución definitiva**, ni un estándar, ni una verdad absoluta.*  
*Es una prueba de límites.*
*Un “¿qué pasaría si…?” llevado a código.*

*Aquí la inteligencia artificial no es protagonista ni reemplazo del humano; es un **asistente de rodaje**.*  
*La imaginación, el criterio y la intención siguen siendo humanas. Porque la tecnología puede sugerir planos, pero no puede sentir la historia que quiere contar.*

*> Usar la inteligencia artificial para **mejorar nuestra vida**, ahorrar tiempo y explorar ideas,*  
*> no para sustituir aquello que nos hace humanos: la imaginación, el criterio y la capacidad de crear lo inimaginable.*

*Esto tambien fue escrito por la IA. Todo es artificial, hasta tu sopa y carne de pollo tiene saborisantes artificiales.*


# BackstopJS Sitemap Generator

**Pruebas de regresión visual automatizadas y dinámicas para sitios web modernos.**

Este proyecto es una solución integral para automatizar la generación de escenarios de prueba para [BackstopJS](https://github.com/garris/BackstopJS). Permite crear pruebas de regresión visual a partir de sitemaps XML, listas de URLs personalizadas y grabaciones de interacciones de usuario, facilitando la detección de cambios visuales no deseados en tus aplicaciones web.

---

## 🚀 Características Clave

*   **Generación Automática desde Sitemaps**: Extrae URLs directamente de `sitemap.xml`, soportando índices de sitemaps anidados.
*   **Listas de URLs Personalizadas**: Soporte para definir escenarios específicos mediante archivos `.txt` o `.json`.
*   **Integración con Puppeteer**: Ejecuta flujos de usuario complejos (formularios, clics, navegación) exportados desde Chrome DevTools.
*   **Progreso Visual en CLI**: Monitor de progreso en tiempo real con estimaciones de tiempo (ETA) y estadísticas detalladas.
*   **Muestreo Inteligente**: Capacidad de probar una muestra representativa de URLs para sitios grandes, optimizando tiempos de ejecución.
*   **Configuración Flexible**: Control total mediante variables de entorno y archivos de configuración.

---

## 🏗 Arquitectura del Sistema

El sistema actúa como un orquestador que analiza las fuentes de entrada (Sitemaps, Listas, Scripts) y genera dinámicamente la configuración necesaria para que BackstopJS ejecute las pruebas visuales.

![Arquitectura del Sistema](assets/architecture.svg)

---

## 📋 Requisitos Previos

*   **Node.js**: Versión 14 o superior.
*   **NPM**: Incluido con Node.js.
*   **Chrome/Chromium**: Necesario para Puppeteer (se descarga automáticamente, pero es bueno tenerlo en cuenta).

---

## 📦 Instalación

1.  **Clonar el repositorio:**
    ```bash
    git clone <url-del-repositorio>
    cd backstop
    ```

2.  **Instalar dependencias:**
    ```bash
    npm install
    ```

---

## ⚙️ Configuración Rápida

El proyecto utiliza un archivo `.env` para la configuración. Puedes copiar el ejemplo incluido para empezar:

```bash
cp .env.EXAMPLE .env
```

### Variables Principales

| Variable | Descripción | Ejemplo |
| :--- | :--- | :--- |
| `SITE_URL` | URL base del sitio a probar. | `https://mi-sitio.com` |
| `SITEMAP_URL` | URL completa del sitemap XML. | `https://mi-sitio.com/sitemap.xml` |
| `URL_LIST` | Ruta al archivo de lista (para `generate-list`). | `url-lists/mis-urls.txt` |
| `SITEMAP_SAMPLE_MODE` | Activa el muestreo para sitios grandes. | `true` |

> Para una guía completa de todas las opciones disponibles, consulta la [Documentación de Configuración](docs/03-configuration.md).

---

## 💻 Uso

### Flujo de Trabajo General

![Flujo de Generación](assets/flowchart.svg)

El sistema ofrece dos modos principales de operación para generar tus escenarios de prueba:

### Modo 1: Generación desde Sitemap
**Ideal para:** Sitios dinámicos, CMS, o cuando necesitas cubrir todo el sitio automáticamente.
Este modo descarga el `sitemap.xml` de tu sitio, extrae todas las URLs y genera escenarios para cada una.

```bash
npm run generate-sitemap
```

### Modo 2: Generación desde Lista
**Ideal para:** Pruebas específicas (Smoke Tests), nuevas funcionalidades, o páginas que no están en el sitemap.
Este modo lee un archivo de texto o JSON con una lista de URLs y genera escenarios solo para esas páginas.

```bash
# Usando la lista por defecto (url-lists/urls.txt)
npm run generate-list

# O especificando una lista personalizada
URL_LIST=url-lists/mis-urls-criticas.txt npm run generate-list
```

### Pasos Siguientes (Comunes para ambos modos)

Una vez generados los escenarios (archivo `backstop.json`), el flujo es el mismo:

**1. Crear Referencias (Base Line)**
Captura el estado actual del sitio como la "verdad" visual.
```bash
npm run reference
# O con barra de progreso:
npm run reference:progress
```

**2. Ejecutar Pruebas (Test)**
Compara el estado actual contra las referencias guardadas.
```bash
npm run test
# O con barra de progreso:
npm run test:progress
```

**3. Aprobar Cambios**
Si los cambios detectados son correctos, actualiza las referencias.
```bash
npm run approve
```

### Secuencia de Ejecución Interna

![Secuencia de Ejecución](assets/sequence.svg)

---

---

## 🖥️ Panel Visual (Dashboard)

Además del flujo por línea de comandos, el proyecto incluye una interfaz web para gestionar y programar las pruebas sin tocar la terminal.

El panel requiere una base de datos **Postgres** para el login (usuarios y sesiones):

```bash
createdb backstop_ui
echo "DATABASE_URL=postgres://usuario:password@localhost:5432/backstop_ui" >> .env
echo "SESSION_SECRET=$(openssl rand -hex 32)" >> .env

npm run ui
```

La primera vez, `http://localhost:4780` te redirige a una pantalla de login donde te creás la cuenta inicial (el primer registro entra directo, sin invitación); de ahí en adelante, sólo alguien ya logueado puede dar de alta a un compañero nuevo. Ver el detalle completo en [`docs/07-dashboard.md`](docs/07-dashboard.md#11-login-usuarios-y-sesión-postgres).

Una vez logueado, esto levanta un servidor local (por defecto en `http://localhost:4780`, configurable con `UI_PORT`) con:

*   **Dashboard**: contadores rápidos (escenarios, viewports, schedules activos, proyectos adicionales, última corrida) y botones de acción rápida (generar, crear referencias, ejecutar pruebas, aprobar cambios), cada uno con el log en vivo de la ejecución.
*   **Escenarios**: alta, edición y borrado de escenarios del proyecto principal (`backstop.json`) — URL, selectores a ocultar/remover, umbral de comparación, tiempo de espera antes de capturar, etc. — y gestión de sus viewports, sin necesidad de regenerar desde sitemap/lista.
*   **Proyectos**: páginas o sitios *adicionales*, cada uno con su propia carpeta aislada (`backstop_data/<proyecto>/`) y su propio modo de generación — **Sitemap** (crawl completo), **URL/Lista** (una o varias URLs puntuales) o **Diseño vs. Live** (comparar una imagen exportada de Figma contra la URL real, con subida de imagen incluida). Cada proyecto tiene su propia configuración, sus propios escenarios y viewports, y sus propias acciones (Generar / Crear Referencias / Ejecutar Pruebas / Aprobar Cambios / Ver reporte) — completamente independiente del proyecto principal y del resto de los proyectos.
*   **Generar**: dispara `generate-from-sitemap` o `generate-from-list` para el proyecto principal desde el navegador, con los mismos parámetros que las variables de entorno (`SITE_URL`, `SITEMAP_URL`, muestreo, límites, tiempo de espera), mostrando el progreso en tiempo real.
*   **Listas de URLs**: crear, editar y borrar los archivos de `url-lists/` directamente desde la UI.
*   **Programación**: crear *schedules* con expresión cron (con atajos comunes) que ejecutan un pipeline configurable, para el proyecto principal o para cualquier proyecto adicional — por ejemplo "generar desde sitemap → crear referencias" cada noche, o "ejecutar pruebas" cada hora — con historial de la última corrida, ejecución manual ("Ejecutar ahora") y activar/pausar sin perder la configuración.
*   **Configuración**: editor de las variables principales del archivo `.env`, incluyendo `SCENARIO_DELAY` (ver abajo).
*   **Historial**: registro de todas las corridas (manuales y programadas, de cualquier proyecto) con su log completo.

Cada corrida —del proyecto principal o de cualquier proyecto adicional— usa su propio `backstop.json` aislado, así que corridas de proyectos distintos se ejecutan **en paralelo de verdad** (hasta `MAX_CONCURRENT_RUNS`, default `3`); sólo dos corridas del mismo proyecto se siguen esperando entre sí, para no pisar su configuración compartida. Ver el detalle en [`docs/07-dashboard.md`](docs/07-dashboard.md#4-proyectos-páginas-adicionales-aisladas).

Los datos de esta interfaz (historial de corridas, schedules y proyectos adicionales) se guardan en `data/` (ignorado por git, igual que `.env`), por lo que cada entorno mantiene su propia configuración.

### ⏱️ Tiempo de espera antes de capturar (`SCENARIO_DELAY`)

Algunas páginas tardan en terminar de cargar (animaciones, lazy-load de imágenes, contenido que llega por JS) y una captura tomada demasiado pronto genera falsos positivos en el reporte. La variable `SCENARIO_DELAY` (en milisegundos, default `5000`; `1000` en modo Diseño) controla cuánto espera BackstopJS antes de sacar la foto:

*   Para el proyecto principal: editala en la pestaña **Configuración**, o por corrida puntual en el campo "Espera antes de capturar" de la pestaña **Generar**.
*   Para cada proyecto adicional: cada uno tiene su propio campo de espera en su panel de **Proyectos**, independiente del resto — así una página lenta puede tener más margen que una rápida sin afectar a las demás.
*   Por línea de comandos: `SCENARIO_DELAY=8000 npm run generate-sitemap`.

Este valor es el *default* de todos los escenarios generados automáticamente; también podés ajustar el `delay` de un escenario puntual a mano desde su formulario de edición.

> **Importante — `SCENARIO_DELAY` no alcanza para contenido con lazy-load.** Si tu página tiene secciones que sólo cargan cuando el usuario hace scroll (imágenes `loading="lazy"`, animaciones por IntersectionObserver, plugins de lazy-load de WordPress, sliders, videos incrustados a mitad de página, etc.), esas partes van a aparecer **en blanco** en la captura sin importar cuánto subas el delay — el delay sólo espera, no simula que alguien scrollea la página, y BackstopJS por sí solo nunca la scrollea. Por eso el proyecto trae `backstop_data/engine_scripts/onReady.js`: un script que recorre toda la página de arriba a abajo (disparando ese contenido, como haría una persona real) y vuelve al tope antes de capturar. Se activa automáticamente en todo escenario nuevo desde esta versión. Si ya tenías proyectos generados con una versión anterior, simplemente volvé a **Generar** (o corré `npm run generate-sitemap` / `generate-list` de nuevo) para que tomen el fix — no hace falta tocar nada más.

---

## 📚 Documentación Detallada

Para profundizar en cada aspecto del proyecto, consulta los siguientes documentos:

*   [**01. Visión General**](docs/01-overview.md): Introducción detallada y filosofía del proyecto.
*   [**02. Instalación**](docs/02-installation.md): Guía paso a paso para diferentes entornos.
*   [**03. Configuración**](docs/03-configuration.md): Variables de entorno, headers y opciones avanzadas.
*   [**04. Guía de Uso**](docs/04-usage.md): Explicación detallada de todos los comandos y flujos.
*   [**05. Solución de Problemas**](docs/05-troubleshooting.md): Errores comunes y cómo resolverlos.
*   [**06. Configuración Avanzada**](docs/06-advanced.md): Personalización de Puppeteer y escenarios complejos.
*   [**07. Panel Visual (Dashboard)**](docs/07-dashboard.md): Referencia completa del panel web — proyectos múltiples aislados, programación, ocultar/quitar selectores y todas las variables de entorno que trajo.

---

## 🔧 Troubleshooting

Si encuentras problemas comunes como:
*   **El sitemap devuelve HTML en lugar de XML.**
*   **Timeouts en sitios grandes.**
*   **Errores de certificados SSL.**

Consulta la guía de [Solución de Problemas (Troubleshooting)](docs/05-troubleshooting.md) para soluciones rápidas.

---

## 🤝 Contribución

Las contribuciones son bienvenidas. Por favor, abre un issue para discutir cambios mayores antes de enviar un Pull Request.

## 📄 Licencia

Este proyecto está bajo la licencia MIT.
