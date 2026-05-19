# Salesforce Quiz App

App web simple para estudiar preguntas de certificaciones de Salesforce con una sola base de código.

## Stack

- Nuxt 3
- API routes de Nitro dentro del mismo proyecto
- SQLite local con `better-sqlite3`

## Requisito práctico de Node

- El proyecto se ha construido correctamente con Node `22.10.0`.
- Algunas dependencias muestran avisos de engine; para evitar ruido, es mejor usar Node `22.12+` o `20.19+`.

## Qué incluye el MVP

- CRUD de preguntas
- Varias respuestas por pregunta
- Marcado de una o varias respuestas correctas
- Explicación y nota rápida
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

## JSON de importación

Formato esperado:

```json
{
  "version": 1,
  "exportedAt": "2026-04-18T10:00:00.000Z",
  "questions": [
    {
      "prompt": "Question text",
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
