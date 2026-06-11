# DocSolar — Generador de documentación técnica solar

## Qué hay en esta carpeta

```
docsolar-app/
├── index.html       → El formulario web (lo que ve el usuario)
├── api/
│   └── pvgis.js      → Backend: conecta con PVGIS (datos de irradiación solar)
├── package.json      → Archivo de configuración del proyecto
└── .gitignore        → Le dice a Git qué archivos ignorar
```

---

## PASO 1 — Subir esto a GitHub

Tienes dos formas de hacerlo. Elige la que te resulte más cómoda.

### Opción A: Subir los archivos desde la web de GitHub (sin usar la terminal)

1. Entra en tu repositorio vacío en github.com (el que creaste, ej:
   `github.com/tu-usuario/docsolar-app`)
2. Verás un enlace que dice algo como **"uploading an existing file"** —
   haz clic ahí
3. Arrastra estos archivos y carpetas:
   - `index.html`
   - `package.json`
   - `.gitignore`
   - la carpeta `api` completa (con `pvgis.js` dentro)
4. Abajo, escribe un mensaje tipo "Primera versión del formulario + backend
   PVGIS"
5. Pulsa **Commit changes**

Listo, ya está todo en GitHub.

### Opción B: Subir desde la terminal (si tienes Git instalado)

Abre una terminal en esta carpeta y ejecuta:

```bash
git init
git add .
git commit -m "Primera versión del formulario + backend PVGIS"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/docsolar-app.git
git push -u origin main
```

(Sustituye `TU-USUARIO` y `docsolar-app` por tu usuario y nombre de
repositorio reales).

---

## PASO 2 — Desplegar en Vercel

1. Entra en vercel.com (con tu cuenta ya conectada a GitHub)
2. Pulsa **Add New** → **Project**
3. Busca el repositorio `docsolar-app` en la lista y pulsa **Import**
4. Vercel detectará automáticamente que es un proyecto simple. NO hace
   falta que cambies ninguna configuración (Framework Preset puede quedar
   como "Other")
5. Pulsa **Deploy**
6. Espera 30-60 segundos. Te dará una URL del tipo:
   `https://docsolar-app.vercel.app`

---

## PASO 3 — Probarlo

1. Abre la URL que te ha dado Vercel (`https://docsolar-app-xxxx.vercel.app`)
2. Rellena los datos del formulario hasta llegar a la sección 2
   (datos del cliente y emplazamiento)
3. Escribe una dirección o municipio español, pulsa **Localizar dirección**
4. Pulsa **Calcular producción real con PVGIS**

Si todo va bien, verás un recuadro verde que dice **"Datos PVGIS reales"**
con la producción anual en kWh, irradiación, y Performance Ratio.

Si ves un aviso amarillo de "Estimación local", significa que algo falló
al llamar a `/api/pvgis`. Revisa el siguiente apartado.

---

## Solución de problemas

### "No se pudo contactar con tu backend"

- Comprueba que la carpeta `api/` con `pvgis.js` dentro se haya subido
  correctamente a GitHub (entra en tu repo y verifica que aparece la
  carpeta `api` con el archivo dentro)
- En Vercel, ve a tu proyecto → pestaña **Deployments** → abre el último
  despliegue → pestaña **Functions**. Deberías ver `api/pvgis` listada
  ahí. Si no aparece, Vercel no detectó la función (revisa que el archivo
  se llame exactamente `pvgis.js` y esté dentro de una carpeta llamada
  exactamente `api`)

### "PVGIS devolvió un error"

- Esto significa que tu backend SÍ funciona, pero PVGIS rechazó la
  petición (coordenadas fuera de rango, etc.). Prueba con otra ubicación.

### Cada vez que cambias el código

- Si usaste la Opción A (subida manual): vuelve a subir los archivos
  modificados a GitHub de la misma forma, sobrescribiendo los anteriores
- Si usaste Git: `git add .` → `git commit -m "cambios"` → `git push`
- Vercel detecta automáticamente el cambio en GitHub y vuelve a desplegar
  solo, en 30-60 segundos. No hay que hacer nada más en Vercel.

---

## Próximos pasos técnicos (para más adelante)

- Conectar la API de Claude para generar la memoria descriptiva con IA real
  (necesitará otra función en `api/`, ej. `api/generar-memoria.js`, y
  guardar tu API key como variable de entorno en Vercel — nunca en el
  código)
- Añadir una base de datos (Supabase es buena opción gratuita) para
  guardar el historial de proyectos de cada cliente
- Generar el documento final en PDF en lugar de .txt
