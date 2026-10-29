# Salesforce Quiz App

App web simple para estudiar preguntas de certificaciones de Salesforce con una sola base de código.

## Stack

- Nuxt 3
- API routes de Nitro dentro del mismo proyecto
- SQLite local o Turso remoto con `@libsql/client`
- Cuentas propias con correo y contraseña, sesiones y acceso por invitación

## Requisito práctico de Node

- Usa Node `22.12+` o `20.19+` para desarrollo y compilación.
- La build actual se ha validado con Node `22.14.0`; Node `22.10.0` puede quedarse bloqueado con esta versión de Nuxt.

## Qué incluye el MVP

- CRUD de preguntas
- Exámenes independientes: crear, renombrar, estudiar y hacer simulacros por certificación
- Varias respuestas por pregunta
- Marcado de una o varias respuestas correctas
- Explicación y nota rápida
- Imagen opcional de apoyo por pregunta (PNG, JPG, WEBP o GIF)
- Etiquetas por tema
- Vista de estudio
- Vista tipo examen
- Import/export JSON
- Interfaz en español, inglés e italiano

## Idioma de la interfaz

El selector de la cabecera cambia menús, botones y mensajes sin reiniciar el simulacro.
La elección se guarda en una cookie del navegador durante un año y también se aplica
al iniciar sesión. Las preguntas, respuestas, explicaciones, etiquetas y nombres de
examen conservan su contenido original; no se traducen ni se modifican en la base de datos.

Las traducciones están en `utils/localization.mjs` y la preferencia compartida en
`composables/useLanguage.ts`. No se necesitan servicios externos ni nuevas variables
de entorno. Para añadir un texto de interfaz usa `t('Texto en español')` y añade sus
versiones inglesa e italiana al diccionario.

## Rendimiento y navegación

Al navegar entre Preguntas, Estudiar y Simulacro se reutiliza el banco del examen
ya descargado en esa pestaña. `Actualizar preguntas` o recargar la página obtiene
los cambios de otros usuarios; guardar, borrar e importar fuerza una actualización.
La caché vive solo en la app del navegador, no se comparte entre cuentas ni se
guarda en disco. El servidor sigue validando la sesión y los permisos en cada petición.

`vercel.json` sitúa el servidor en Dublín (`dub1`), cerca de la base Turso actual en
AWS `eu-west-1`. Si cambia la región de la base, ajusta también esta configuración.
Los recursos estáticos siguen distribuidos por la CDN; el HTML y la API de las
cuentas llevan `private, no-store`. El favicon SVG se sirve incluso sin sesión.

## Simulacros aleatorios

Antes de empezar puedes elegir **Simulacro normal** (por defecto) o **Examen real**.
El primero muestra acierto/fallo, solución, explicación y nota al elegir una respuesta;
permite rectificar. Con varias respuestas correctas, una selección parcial se indica
como incompleta, no como incorrecta. El resultado de práctica usa las selecciones finales,
no los primeros intentos. Examen real oculta estas pistas hasta pulsar Finalizar examen.
El modo queda fijado durante la sesión; cambiarlo después no altera la revisión anterior.
Las preguntas de una sola respuesta usan radio y las de varias respuestas usan casillas.
Es una herramienta de estudio: el modo Examen real no es un sistema de examen supervisado.

En Simulacro puedes escribir cualquier cantidad entera entre 1 y las preguntas
disponibles, usar los accesos rápidos de 10, 20, 50 o 100 (cuando haya suficientes),
o seleccionar todas. El filtro de etiqueta limita el sorteo al tema elegido.
Cada simulacro toma exactamente esa cantidad sin repetir preguntas y sin modificar
el banco. Tras corregirlo puedes generar otro; algunas preguntas pueden reaparecer
entre simulacros distintos, pues cada sorteo es independiente.
Durante una sesión la configuración está bloqueada. Descartarla requiere confirmación dentro de la página
y solo borra las respuestas temporales de esa sesión, nunca preguntas del banco.

## Apoyos de memoria de Peñíscola

`content/peniscola-2026/` contiene explicaciones breves en castellano y sus
fuentes para las 415 preguntas. Se añaden al texto de solución ya existente,
sin traducir los enunciados ni cambiar claves, opciones o notas. Las claves
dudosas se señalan, no se corrigen silenciosamente.
Consulta el README de esa carpeta antes de aplicar `npm run db:explain-peniscola`:
por defecto solo comprueba y para actualizar exige `--apply`, crea una copia
privada y verifica que el banco no haya cambiado. No se ejecuta al desplegar.

## Revisión responsive y accesibilidad

La interfaz conserva el zoom del navegador, inputs de al menos 16 px, foco visible,
un enlace para saltar al contenido y áreas táctiles de 44 px o más. Los colores de
texto y los bordes de formulario se comprueban con pruebas de contraste.
En móvil, Opciones despliega los filtros de estudio; el menú Cuenta contiene las
acciones de cuenta. Los controles inferiores reservan espacio y respetan las zonas
seguras de iOS; en ventanas de poca altura vuelven al flujo normal para no tapar texto.
Las comprobaciones de navegador usan tamaños equivalentes a iPhone 16 Pro (402×874),
iPad (820×1180 y horizontal) y Mac (1440×900), además de 320 px para reflujo. Esto no
sustituye pruebas con Safari/VoiceOver y dispositivos físicos, ni certifica WCAG.

También se ha probado Safari de macOS en su modo de diseño adaptable, con datos
ficticios locales: 402x874 (3x), 820x1180 (2x), iPad horizontal e iPhone horizontal.
Se comprobaron navegación de preguntas, solución, filtro de tema, mezcla, formularios,
cantidad personalizada, conservación de respuestas, cancelar descarte, corrección y
nuevo sorteo. Los `select` mantienen el selector HTML nativo, con apariencia CSS
normalizada para evitar que WebKit los dibuje como controles de altura reducida.
El menú de cuenta no se cierra con un `focusout` sin destino: Safari puede emitirlo
al pulsar un botón con el ratón y cerrarlo entonces impediría ejecutar su acción.
El modo adaptable no reproduce todas las particularidades del teclado y las barras
de Safari en iOS/iPadOS; estas quedan pendientes de comprobar en dispositivos físicos.

## Arquitectura mínima

- `pages/`: interfaz web
- `components/`: formulario y listado
- `server/api/`: endpoints internos
- `server/utils/questions.ts`: lógica de preguntas y exámenes
- `server/database/`: esquema y hash de contraseñas
- `server/middleware/auth.ts`: protección de páginas y API
- `types/quiz.ts`: contratos compartidos
- `data/`: base de datos local

## Arranque local

1. Copia `.env.example` a `.env` si quieres cambiar la ruta de la base de datos.
2. Instala dependencias:

```bash
npm install
```

3. Arranca en desarrollo:

```bash
npm run dev
```

4. Abre `http://127.0.0.1:4321`.

Si prefieres validar la build de producción localmente:

```bash
npm run build
npm run preview
```

Para detener o reiniciar la preview en el puerto `4321`:

```bash
npm run stop
npm run stop-dev
npm run restart-dev
npm run restart-preview
```

## JSON de importación

Al entrar, elige un examen en `/exams`. Las preguntas existentes pasan automáticamente
a `General`, que puedes renombrar. Las etiquetas, búsquedas y simulacros se limitan al
examen seleccionado. El enlace conserva el examen al recargar o cambiar de vista.
Al editar una pregunta, puedes cambiar su examen para moverla con sus respuestas e imagen.

La exportación incluye solo sus preguntas e imágenes y el nombre del examen.
Al importar, las preguntas se añaden al examen abierto, también con JSON antiguos.
`Importar reemplazando` sustituye únicamente las preguntas de ese examen.

Para validar migración y aislamiento con una base temporal: `npm run build` y `npm test`.

Formato esperado:

```json
{
  "version": 1,
  "exportedAt": "2026-04-18T10:00:00.000Z",
  "questions": [
    {
      "prompt": "Question text",
      "imageDataUrl": "data:image/png;base64,...",
      "explanation": "Why this is correct",
      "note": "Short note",
      "tags": ["Security", "Flows"],
      "answers": [
        { "text": "Option A", "isCorrect": false },
        { "text": "Option B", "isCorrect": true }
      ]
    }
  ]
}
```

## Vercel y Turso

1. Crea una base **libSQL** en Turso. Copia su URL `libsql://...` y token en `.env`, en `NUXT_TURSO_DATABASE_URL` y `NUXT_TURSO_AUTH_TOKEN`.
2. Genera una clave de sesión con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Guárdala en `.env` como `NUXT_SESSION_PASSWORD` y configura `NUXT_AUTH_MODE=accounts`.
3. Si quieres llevar las preguntas locales a Turso, ejecuta `npm run db:migrate`. Solo admite una base de destino vacía; conserva exámenes, respuestas, etiquetas e imágenes. Haz antes una copia de seguridad de tu SQLite con la app detenida. El esquema local debe estar actualizado por esta app.
4. Añade `QUIZ_ADMIN_EMAIL` y `QUIZ_ADMIN_PASSWORD` a `.env` y ejecuta `npm run user:create`. La contraseña necesita entre 12 y 128 caracteres. Después elimina esas dos variables del archivo.
5. Importa este repositorio de GitHub en Vercel. Usa Nuxt y Node 22, y añade estas cuatro variables tanto en Production como en Preview: `NUXT_TURSO_DATABASE_URL`, `NUXT_TURSO_AUTH_TOKEN`, `NUXT_SESSION_PASSWORD` y `NUXT_AUTH_MODE=accounts`. Puedes usar una base y una clave distintas para Preview.
6. Despliega y entra con tu cuenta. Desde **Invitar** puedes generar un enlace para cada amigo. Los enlaces caducan a las 48 horas y solo sirven una vez. Comparte el enlace de forma privada.

Vercel sirve la app y Turso conserva los datos. El despliegue no guarda nada en el disco de Vercel. El esquema se actualiza automáticamente al conectar con la base. La app exige cuentas en Vercel y cuando usa Turso; si falta la configuración, rechaza el acceso.

El administrador gestiona el banco común; los miembros pueden consultar, estudiar, hacer tests y exportar. No hay envío de correos ni recuperación automática de contraseña. Para restablecer tu cuenta administradora, configura de nuevo sus dos variables y ejecuta `npm run user:create -- --reset`; se revocan sus sesiones anteriores.

Las imágenes tienen un máximo de 2 MiB y se descargan por separado. La importación admite hasta 100 preguntas por petición y archivos JSON de hasta 3 MB. Para bancos mayores divide el archivo. La exportación desde la interfaz reúne las imágenes en el navegador; el endpoint directo de exportación tiene un límite de 4 MB.

No subas `.env`, tokens, contraseñas ni `data/` a GitHub. Para pruebas locales sin cuentas deja las variables Turso vacías y `NUXT_AUTH_MODE=local`; así solo se usa SQLite en tu equipo.

La actualización de dependencias mantiene Nuxt 3. La auditoría aún informa de avisos en herramientas transitivas de desarrollo y compilación (devtools, simple-git, glob y certificados de desarrollo). No uses `npm audit fix --force`: propone una versión antigua de Nuxt. Revisa esos avisos al actualizar las herramientas; devtools permanece desactivado y esas herramientas no se incluyen en el servidor compilado.
