// api/generar-memoria.js
//
// Función serverless (Vercel) que recibe los datos del proyecto desde el
// formulario y llama a la API de Claude (Anthropic) para redactar la
// memoria descriptiva de forma adaptada al proyecto concreto, en vez de
// usar la plantilla fija del frontend.
//
// SEGURIDAD:
//   - La API key NUNCA está en este archivo ni en el frontend. Se lee de
//     la variable de entorno ANTHROPIC_API_KEY, configurada en Vercel
//     (Settings → Environment Variables). Así nunca llega a GitHub.
//   - No se ponen cabeceras CORS permisivas (Access-Control-Allow-Origin: *)
//     a propósito: este endpoint cuesta dinero por llamada, así que solo
//     debe poder llamarlo tu propio frontend (mismo dominio). Una petición
//     desde otro origen será bloqueada por el navegador.
//
// Una vez desplegado, estará disponible en:
//   https://docsolar-app.vercel.app/api/generar-memoria

// ─────────────────────────────────────────────────────────────
// Base normativa por comunidad autónoma.
// Extremadura está más detallada (es la zona de prueba / Incalexa).
// Para el resto se inyecta lo que haya; si no hay, la IA usa solo
// normativa estatal y marca lo autonómico como "a verificar".
// ─────────────────────────────────────────────────────────────
const NORMATIVA_CCAA = {
  "Extremadura":
    "Órgano competente: Dirección General de Industria, Energía y Minas (Junta de Extremadura), tramitación a través de SEXPE/sede electrónica. " +
    "Instalaciones de autoconsumo > 50 kWp pueden requerir autorización administrativa previa; por debajo, suele bastar comunicación previa / declaración responsable de baja tensión. " +
    "Alta irradiación (de las mayores de España). Distribuidora habitual en la zona: i-DE (Grupo Iberdrola). " +
    "Verificar siempre la convocatoria autonómica de subvenciones vigente y los plazos del registro de autoconsumo.",
  "Andalucía":
    "Órgano competente: Industria de la Junta de Andalucía. Instalaciones > 100 kWp pueden requerir evaluación de impacto ambiental simplificada. Verificar tramitación telemática y subvenciones autonómicas vigentes.",
  "Madrid":
    "Órgano competente: tramitación telemática autonómica. Instalaciones residenciales de baja potencia (< 15 kWp) suelen requerir solo comunicación previa. Verificar ordenanzas municipales y bonificaciones de IBI/ICIO.",
  "Cataluña":
    "Órgano competente: Oficina de Gestió Empresarial (OGE). Distribuidora según zona (e-distribución / i-DE). Verificar tramitación telemática y bonificaciones municipales.",
  "C. Valenciana":
    "Órgano competente: tramitación autonómica (IVACE en programas de ayudas). Regulación específica de autoconsumo colectivo. Verificar convocatorias y plazos vigentes.",
  "Murcia":
    "Órgano competente: Dirección General de Industria. Plazos de resolución típicos de 3-6 meses en instalaciones industriales. Verificar tramitación y subvenciones.",
  "Galicia":
    "Órgano competente y gestión de ayudas: INEGA. Existen subvenciones autonómicas propias. Verificar convocatoria vigente.",
  "Castilla y León":
    "Tramitación ante la Junta de Castilla y León. < 25 kWp suele ir con declaración responsable; > 25 kWp con proyecto técnico. Verificar.",
  "País Vasco":
    "Tramitación ante Industria del Gobierno Vasco. Subvenciones del Ente Vasco de la Energía (EVE). Verificar convocatoria.",
  "Aragón":
    "Tramitación ante el Departamento de Industria. Alta irradiación en el valle del Ebro. Verificar subvenciones autonómicas.",
  "Castilla-La Mancha":
    "Tramitación autonómica. Una de las regiones líderes en fotovoltaica en suelo. Verificar convocatorias y plazos."
};

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT — rol y reglas fijas (el "cinturón de seguridad").
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres un técnico proyectista experto en instalaciones fotovoltaicas de autoconsumo en España, especializado en la redacción de memorias descriptivas técnicas para su tramitación administrativa.

Tu tarea es redactar la MEMORIA DESCRIPTIVA de una instalación fotovoltaica a partir de los datos del proyecto que se te facilitan en formato JSON, en español de España, con tono técnico-profesional, claro y formal.

REGLAS OBLIGATORIAS (no las incumplas nunca):

1. NO INVENTES NORMATIVA. Cita únicamente normativa estatal que conoces con seguridad (Real Decreto 244/2019 de autoconsumo; REBT RD 842/2002, especialmente ITC-BT-40; RD 1699/2011; norma UNE-EN 62446). Para la normativa autonómica, usa SOLO la información que se te proporcione en el bloque de contexto normativo. Si no se proporciona, escribe "normativa autonómica aplicable (a verificar por el técnico)" en lugar de inventar decretos, números o plazos.

2. NO INVENTES DATOS DEL PROYECTO. Usa exclusivamente los datos del JSON. Si un campo viene como "Por determinar", "No facilitado", "En tramitación" o similar, refléjalo así en el documento, no lo rellenes con valores inventados.

3. USA LENGUAJE CONDICIONAL Y NO CONCLUSIVO en materia de cumplimiento. No afirmes de forma categórica "la instalación cumple X decreto". Usa fórmulas como "la instalación se ha diseñado conforme a..." o "se ajustará a lo establecido en...". El documento es un borrador que debe revisar y firmar un técnico competente.

4. NO incluyas cálculos de ingeniería que no se deriven directamente de los datos aportados (secciones de cable, caídas de tensión exactas, etc.). Si son necesarios, indícalos como "a dimensionar/justificar en el proyecto técnico".

5. Estructura el documento en secciones numeradas y con encabezados claros. Mantén una estructura coherente y profesional.

6. Termina SIEMPRE con un aviso de que se trata de un borrador generado con asistencia de IA, pendiente de revisión y firma técnica antes de su presentación oficial.

Devuelve ÚNICAMENTE el texto de la memoria, sin preámbulos tipo "Aquí tienes..." ni comentarios finales fuera del documento.`;

// ─────────────────────────────────────────────────────────────
// Construye el mensaje de usuario: contexto normativo + datos + formato.
// ─────────────────────────────────────────────────────────────
function construirMensajeUsuario(d) {
  const ccaa = d.ccaa || "";
  const contextoNormativo = NORMATIVA_CCAA[ccaa]
    ? `CONTEXTO NORMATIVO AUTONÓMICO (${ccaa}):\n${NORMATIVA_CCAA[ccaa]}`
    : `CONTEXTO NORMATIVO AUTONÓMICO (${ccaa || "no especificada"}):\nNo se dispone de detalle autonómico verificado. Refiérete a "normativa autonómica aplicable (a verificar por el técnico)" sin inventar decretos ni plazos.`;

  return `${contextoNormativo}

DATOS DEL PROYECTO (en JSON):
${JSON.stringify(d, null, 2)}

INSTRUCCIONES DE SALIDA:
Redacta la memoria descriptiva con esta estructura mínima (puedes adaptar la numeración según haya o no batería y observaciones):

1. Datos del documento (fecha, revisión, normativa aplicada)
2. Datos de la empresa instaladora
3. Datos del titular y emplazamiento
4. Objeto de la instalación
5. Descripción técnica de la instalación (generador fotovoltaico, inversor, almacenamiento si aplica, modalidad de conexión)
6. Estimación de producción y ahorro (usa los datos de producción y la fuente indicada; si la fuente es PVGIS, menciónalo como dato de referencia oficial)
7. Normativa y reglamentación aplicable
8. Declaración del técnico responsable
9. Observaciones adicionales (solo si el campo "notas" tiene contenido)

Adapta la redacción al tipo de inmueble, la modalidad de conexión y las condiciones de sombra y orientación reales del proyecto. Si hay notas del técnico, intégralas de forma coherente en el documento. Cierra con el aviso de borrador pendiente de revisión.`;
}

// ─────────────────────────────────────────────────────────────
// Handler principal
// ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Solo se permite POST (los datos del proyecto viajan en el cuerpo).
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido. Usa POST." });
  }

  // Comprobación de la API key (en el servidor).
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error:
        "Falta la variable de entorno ANTHROPIC_API_KEY en Vercel. Configúrala en Settings → Environment Variables y vuelve a desplegar."
    });
  }

  // Parseo del cuerpo (Vercel suele parsear JSON automáticamente, pero
  // por robustez aceptamos también string).
  let d;
  try {
    d = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: "Cuerpo de la petición no es JSON válido." });
  }
  if (!d || typeof d !== "object") {
    return res.status(400).json({ error: "Faltan los datos del proyecto." });
  }

  // Validación mínima de campos imprescindibles.
  const faltan = ["empresa", "tecnico", "titular", "direccion", "ccaa"].filter(
    (k) => !d[k] || String(d[k]).trim() === ""
  );
  if (faltan.length) {
    return res.status(400).json({
      error: "Faltan campos obligatorios: " + faltan.join(", ")
    });
  }

  // Llamada a la API de Claude (Messages API).
  try {
    const respuesta = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: construirMensajeUsuario(d) }]
      })
    });

    if (!respuesta.ok) {
      const textoError = await respuesta.text();
      return res.status(502).json({
        error: "La API de Claude devolvió un error",
        status: respuesta.status,
        detalle: textoError
      });
    }

    const data = await respuesta.json();

    // Extraemos el texto de los bloques de tipo "text".
    const texto = (data.content || [])
      .filter((bloque) => bloque.type === "text")
      .map((bloque) => bloque.text)
      .join("\n")
      .trim();

    if (!texto) {
      return res.status(502).json({
        error: "La respuesta de Claude no contenía texto.",
        datosCompletos: data
      });
    }

    return res.status(200).json({
      memoria: texto,
      modelo: "claude-sonnet-4-6",
      generado_por: "Claude (Anthropic) vía API",
      uso: data.usage || null
    });
  } catch (error) {
    return res.status(500).json({
      error: "No se pudo conectar con la API de Claude",
      detalle: error.message
    });
  }
}
