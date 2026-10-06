# Salesforce Quiz App

App web simple para estudiar preguntas de certificaciones de Salesforce con una sola base de código.

## Stack

- Nuxt 3
- API routes de Nitro dentro del mismo proyecto
- SQLite local con `better-sqlite3`

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

## Arquitectura mínima

- `pages/`: interfaz web
- `components/`: formulario y listado
- `server/api/`: endpoints internos
- `server/utils/questions.ts`: acceso a SQLite, esquema y lógica de datos
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

## Siguiente paso natural para despliegue

Cuando quieras subirla fuera, esta misma app puede desplegarse en un servidor Node pequeño o en un VPS con persistencia de disco. Si más adelante necesitas multiusuario o base de datos remota, la lógica ya está aislada detrás de `server/api/` y `server/utils/questions.ts`, así que el cambio quedará acotado.
