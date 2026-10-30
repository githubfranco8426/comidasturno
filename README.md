# MacroTurno

App de nutrición por turnos, con calendario continuo, respaldo y sincronización privada por cuenta.

## Publicar en Vercel

1. En el equipo `ftabilo2-1660s-projects`, abre **Add New → Project** e importa `githubfranco8426/comidasturno`.
2. Framework: **Other**. Directorio raíz: `./`. Desactiva los comandos de instalación y compilación; deja el directorio de salida en la raíz.
3. Publica `main`. Comprueba Cuenta y respaldo, registro en una fecha y recarga. Los siguientes pushes a `main` generarán despliegues automáticos mientras la integración de Git permanezca habilitada.
4. Para Google Sites: reemplaza la incorporación antigua por la URL de producción de Vercel y publica el sitio.

La configuración inicial de Vercel está pendiente: el conector devolvió 403 para ese equipo. No se ha creado ni publicado un proyecto desde esta sesión.

## Cuenta y datos

- Supabase: proyecto **Entrenamiento**, tabla exclusiva `public.macroturno_states`.
- El navegador usa una clave pública de Supabase. El acceso depende de la sesión y de las políticas de propiedad por `auth.uid()`; no hay claves secretas en el repositorio.
- Crea una cuenta desde **Cuenta y respaldo**, confirma el correo si Supabase lo solicita e inicia sesión. Si ya tienes una cuenta de Entrenamiento, usa esa cuenta.
- Cada edición se guarda primero en este navegador y luego se sincroniza. La app indica si está pendiente, sincronizada o tiene un error.
- Cada cuenta tiene una copia local separada. Al entrar en una cuenta con historial en la nube, se carga ese historial; los registros de invitado se conservan en la copia de invitado. Descárgalos antes de entrar si quieres importarlos a tu cuenta.
- Las versiones detectan ediciones concurrentes. Ante un conflicto se conserva la copia local: descarga un respaldo y usa **Cargar nube**. Para conservar ambos cambios, carga la nube y agrega los registros faltantes; no restaures una copia vieja sobre cambios nuevos sin revisarla.
- El guardado local depende del navegador y puede bloquearse dentro de Google Sites. Se recomienda abrir la URL directa de Vercel para iniciar sesión.
- El calendario usa `America/Santiago`. Al abrir la app selecciona el día actual; los días nuevos comienzan sin comidas ni mediciones de ejemplo. El turno se elige manualmente con el botón de ciclo.
- La versión anterior tenía fechas sin año: se migran jueves 15–domingo 18 a **15–18 de octubre de 2026**, que corresponden al HTML original. Se conserva una copia del JSON anterior antes de migrarlo.
- Descarga y restaura respaldos JSON desde **Cuenta y respaldo**. La restauración reemplaza el historial y descarga primero una copia del actual.
- Los registros de Google Sites no viajan automáticamente a un dominio nuevo: exporta desde la app antigua e importa el JSON en la nueva. La app anterior ya ofrece Exportar datos en Progreso.

## Desarrollo y verificaciones

Sirve esta carpeta con cualquier servidor estático. No requiere compilación.

```sh
npm ci
npm test
```

Las pruebas comprueban calendario, migración, persistencia, errores de almacenamiento y sincronización/conflictos con un servicio simulado. Las políticas y permisos se verificaron también por SQL en Supabase. Falta una prueba real de inicio de sesión y sincronización entre dos dispositivos una vez publicado; no se probó la apariencia en un navegador visual en esta sesión.

`supabase/schema.sql` documenta la tabla y las políticas ya instaladas. No debe ejecutarse de nuevo sobre la misma tabla. Las alertas del asesor de Supabase encontradas pertenecen a objetos previos del proyecto (app_state, funciones de entrenadores y configuración de contraseñas); la tabla de MacroTurno tiene RLS y políticas de propiedad.

Gemini continúa pendiente. El campo de comida usa la biblioteca local y estimaciones; todavía no consulta un modelo de IA.

## Recuperar desde un resumen de texto

En **Cuenta y respaldo → Importar resumen de la app anterior**, pega el texto de Copiar resumen, selecciona la fecha completa y confirma. La app valida los totales, agrega comidas faltantes sin duplicar coincidencias exactas y actualiza únicamente los indicadores presentes. Conserva los otros días y descarga un respaldo antes de importar. Para el Jueves 15 del HTML original, selecciona 2026-10-15. Si estás conectado, sincroniza el cambio con tu cuenta. El resumen no contiene las otras fechas ni los suplementos no mencionados.
# Chat de Gemini dentro de MacroTurno

La pestaña **Gemini** usa las comidas y metas del día seleccionado. Registra consumo confirmado, corrige porciones y horarios, elimina comidas a petición y responde con los totales del registro real. Las propuestas de comida quedan en la conversación hasta que se confirman.

- El chat se guarda por día dentro del estado existente, con el mismo respaldo y sincronización de cuenta. No requiere migraciones de base de datos. El chat anterior de Google Gemini no se importa automáticamente.
- `POST /api/chat` valida la sesión contra Supabase Auth. El servidor usa Vercel AI Gateway con `VERCEL_OIDC_TOKEN` (o `AI_GATEWAY_API_KEY` en otros entornos) y el modelo `google/gemini-3.8-flash`. Se puede configurar `MACROTURNO_GEMINI_MODEL` en el servidor. Las claves privadas nunca se envían al navegador. La cuenta de Vercel debe tener acceso y saldo disponible para AI Gateway; no se compran créditos automáticamente.
- Cada respuesta propone un lote validado de cambios. El navegador aplica el lote solo a la fecha y cuenta originales, comprueba que el día no cambió durante la respuesta y revierte si no puede guardar localmente. El estado de nube conserva sus avisos existentes. Los reintentos usan identificadores estables.
- El límite de doce mensajes por minuto y usuario es una protección por instancia, no un límite distribuido de gasto. Para abrir el servicio a gran escala, configurar límites de gasto en Vercel y un limitador distribuido.
- Se envían a Gemini, a través de Vercel, los últimos 24 mensajes de ese día, sus comidas y metas y hasta 60 entradas de la biblioteca; no se envían correo, contraseña, mediciones corporales ni el historial de otros días.
- `npm test` verifica los flujos existentes, el endpoint autenticado, las correcciones atómicas, persistencia y reintentos, las carreras por cambio de fecha/cuenta y fallos de almacenamiento. Las pruebas usan respuestas simuladas y no consumen IA.

