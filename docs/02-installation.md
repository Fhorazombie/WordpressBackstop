# Instalación y Requisitos

## Requisitos Previos

Antes de comenzar, asegúrate de tener instalado lo siguiente en tu sistema:

*   **Node.js**: Versión 14 o superior. Se recomienda la última versión LTS.
    *   Para verificar tu versión: `node -v`
*   **NPM**: Generalmente se instala junto con Node.js.

## Pasos de Instalación

1.  **Clonar o Descargar el Proyecto**
    Descarga el código fuente en tu máquina local.

2.  **Instalar Dependencias**
    Navega al directorio raíz del proyecto y ejecuta el siguiente comando para instalar todas las librerías necesarias (BackstopJS, sitemapper, etc.):

    ```bash
    npm install
    ```

    Esto instalará las dependencias listadas en `package.json`:
    *   `backstopjs`: El motor de pruebas visuales.
    *   `sitemapper`: Para analizar y extraer URLs de los sitemaps XML.
    *   `node-fetch`: Para realizar peticiones HTTP.
    *   `dotenv`: Para manejar variables de entorno.

## Verificación

Para verificar que la instalación fue exitosa, puedes intentar ejecutar el comando de ayuda de BackstopJS:

```bash
npx backstop --version
```

Si ves el número de versión, ¡estás listo para configurar el proyecto!
