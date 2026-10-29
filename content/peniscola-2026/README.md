# Apoyos de memoria para Peñíscola

Los tres archivos `explanations-*.json` contienen una explicación breve en
castellano para cada una de las 415 preguntas. Relacionan enunciado y respuesta
con una razón, un contraste o una asociación para recordarla. Las fuentes
consultadas figuran en `sources`; una lista vacía no implica verificación
independiente. No se añaden anécdotas inventadas para rellenar preguntas.

Se conserva la clave del solucionario aportado, incluso cuando es discutible.
En esos casos el apoyo debe advertirlo, no justificarla como un hecho. Las
cifras institucionales o de competiciones pueden depender de la edición.
Los contenidos de salud y legislación no son consejos para beber o conducir.

El programa añade el apoyo al campo `explanation`, sin eliminar el texto previo,
la nota documental ni las advertencias. Así aparece al mostrar la solución en
Estudiar, inmediatamente en Simulacro normal y solo al finalizar en Examen real.
El texto se mantiene en castellano aunque los menús estén en inglés o italiano.

## Aplicación segura

Con las credenciales de Turso en el archivo privado `.env`:

```bash
# Comprueba los 415 enunciados y claves; no modifica nada.
npm run db:explain-peniscola -- --exam-id=2

# Guarda una copia privada en data/ y aplica las explicaciones.
npm run db:explain-peniscola -- --exam-id=2 --apply
```

Es una actualización de contenido, no una importación de preguntas. No cargar
estos archivos desde Importar JSON: no usan ese formato y no deben crear
duplicados. Publicar código en Vercel tampoco ejecuta esta actualización.

El programa exige el nombre Peñíscola, el recuento completo, la numeración sin
duplicados, el enunciado exacto y una única respuesta correcta coincidente.
Se permiten exclusivamente seis diferencias de transcripción concretas entre
el texto del solucionario y la opción original: 39, 81, 207, 290, 363 y 412.
No se usa coincidencia aproximada ni se cambia ninguna clave.

La actualización se realiza en una transacción y se cancela si el banco cambió
después de la copia previa. Solo se escriben `explanation` y `updated_at` de las
preguntas seleccionadas. No toca usuarios, opciones, fotos, notas ni otros exámenes.
Repetir la misma ejecución no duplica el apoyo; si existe uno diferente, se
detiene para no sobrescribirlo silenciosamente.

Para una base local aislada se puede añadir `--local`; comprueba primero que
no haya variables de Turso y establece `NUXT_QUIZ_DATABASE_PATH` a la base de prueba.

## Restauración

La copia guarda el banco de ese examen y los textos anteriores/posteriores, sin
cuentas ni credenciales. Se crea con permisos privados y no se incluye en Git.
Para deshacer únicamente las explicaciones de una ejecución:

```bash
npm run db:explain-peniscola -- --exam-id=2 --restore=data/NOMBRE-DE-LA-COPIA.json
npm run db:explain-peniscola -- --exam-id=2 --restore=data/NOMBRE-DE-LA-COPIA.json --apply
```

La primera orden solo comprueba. La segunda crea otra copia antes de restaurar.
Si alguien editó después una de esas explicaciones, la restauración se detiene
para no perder su trabajo. Revisa los cambios manualmente en ese caso.
