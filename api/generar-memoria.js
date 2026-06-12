// api/generar-memoria.js
//
// Función serverless (Vercel) que recibe los datos del proyecto desde el
// formulario y llama a la API de Claude (Anthropic) para redactar la
// MEMORIA DESCRIPTIVA siguiendo la estructura profesional estándar que usan
// las ingenierías en España y que pide la administración para tramitación.
//
// SEGURIDAD:
//   - La API key se lee de la variable de entorno ANTHROPIC_API_KEY (Vercel),
//     nunca está en el código ni llega a GitHub.
//   - Sin CORS permisivo: solo lo llama tu propio frontend (mismo dominio).
//
// FORMATO DE SALIDA (markup ligero que el PDF del frontend sabe maquetar):
//   # 1. TÍTULO        -> cabecera de sección
//   ## 4.1. Subtítulo  -> subsección
//   - Campo: Valor     -> fila de tabla de datos (varias seguidas = tabla)
//   * texto            -> viñeta de lista
//   (línea normal)     -> párrafo de texto

const NORMATIVA_CCAA = {
  "Extremadura":
    "Órgano competente: Dirección General de Industria, Energía y Minas (Junta de Extremadura), tramitación a través de la sede electrónica. " +
    "Instalaciones de autoconsumo > 50 kWp pueden requerir autorización administrativa previa; por debajo suele bastar comunicación previa / declaración responsable de baja tensión. " +
    "Alta irradiación (de las mayores de España). Distribuidora habitual en la zona: i-DE (Grupo Iberdrola). " +
    "Verificar la convocatoria autonómica de subvenciones vigente y los plazos del registro de autoconsumo.",
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

const SYSTEM_PROMPT = `Eres un ingeniero técnico industrial experto en la redacción de MEMORIAS DESCRIPTIVAS de instalaciones fotovoltaicas de autoconsumo en España, para su tramitación ante la administración (legalización de baja tensión).

Redactas el documento a partir de los datos del proyecto (en JSON), en español de España, con tono técnico, formal y profesional, siguiendo la estructura estándar que usan las ingenierías del sector.

FORMATO DE SALIDA OBLIGATORIO (markup ligero; NO uses Markdown con asteriscos de negrita, NO uses líneas de guiones decorativas):
- Cabecera de sección principal: una línea que empiece por "# " seguida del número y título en mayúsculas. Ej: "# 1. OBJETO Y ANTECEDENTES".
- Subsección: una línea que empiece por "## ". Ej: "## 4.1. Generador fotovoltaico".
- Dato estructurado (para tablas): una línea que empiece por "- " con formato "- Campo: Valor". Pon juntas todas las filas de datos de un mismo bloque, una por línea.
- Viñeta de lista: una línea que empiece por "* ".
- Párrafos de texto: líneas normales, sin prefijo. Separa los bloques con una línea en blanco.

REGLAS OBLIGATORIAS (no las incumplas nunca):
1. NO INVENTES NORMATIVA. Cita solo normativa estatal que conoces con seguridad (RD 244/2019 de autoconsumo; REBT RD 842/2002, en especial ITC-BT-40; RD 1699/2011; UNE-EN 62446). Para la normativa autonómica usa SOLO el contexto que se te proporcione; si no hay, escribe "normativa autonómica aplicable (a verificar por el técnico)" sin inventar decretos, números ni plazos.
2. NO INVENTES DATOS. Usa exclusivamente los del JSON. Si un campo viene como "Por determinar", "No facilitado", "En tramitación" o similar, refléjalo así.
3. NO INVENTES CÁLCULOS DE INGENIERÍA. No des secciones de cable, caídas de tensión, intensidades de cortocircuito ni valores de puesta a tierra concretos. Descríbelos cualitativamente e indica que "se dimensionarán y justificarán en el anexo de cálculos del proyecto, conforme al REBT" (caída de tensión en CC y CA inferior a los límites reglamentarios, conductores de cobre, etc.).
4. USA LENGUAJE CONDICIONAL en cumplimiento: "la instalación se ha diseñado conforme a...", "se ajustará a lo establecido en...". Nunca afirmes de forma categórica que "cumple" un decreto.
5. Termina SIEMPRE indicando que es un borrador generado con asistencia de IA, pendiente de cálculos, esquema unifilar y firma de técnico competente.

Devuelve ÚNICAMENTE el cuerpo de la memoria en el markup descrito, sin preámbulos ni comentarios fuera del documento. No incluyas la portada ni el bloque de firma final (los añade el sistema).`;

function construirMensajeUsuario(d) {
  const ccaa = d.ccaa || "";
  const contextoNormativo = NORMATIVA_CCAA[ccaa]
    ? `CONTEXTO NORMATIVO AUTONÓMICO (${ccaa}):\n${NORMATIVA_CCAA[ccaa]}`
    : `CONTEXTO NORMATIVO AUTONÓMICO (${ccaa || "no especificada"}):\nNo se dispone de detalle autonómico verificado. Refiérete a "normativa autonómica aplicable (a verificar por el técnico)" sin inventar decretos ni plazos.`;

  return `${contextoNormativo}

DATOS DEL PROYECTO (JSON):
${JSON.stringify(d, null, 2)}

Redacta la memoria descriptiva con ESTA estructura de secciones (usa el markup indicado; incluye la 4.4 de almacenamiento solo si hay batería):

# 1. OBJETO Y ANTECEDENTES
(párrafo: objeto de la memoria, potencia pico, modalidad, finalidad de autoconsumo)

# 2. TITULAR Y EMPLAZAMIENTO
(filas "- Campo: Valor": Titular, Dirección, Municipio, Comunidad Autónoma, Referencia catastral, Tipo de inmueble, Coordenadas)

# 3. DESCRIPCIÓN GENERAL DE LA INSTALACIÓN
(párrafo: tipo de instalación, modalidad de conexión, descripción del emplazamiento y de la solución adoptada)

# 4. DESCRIPCIÓN DE LOS EQUIPOS Y COMPONENTES
## 4.1. Generador fotovoltaico
(filas de datos de módulos + breve párrafo)
## 4.2. Estructura soporte
(párrafo: tipo de cubierta, orientación, inclinación; sobrecargas a justificar por el técnico)
## 4.3. Inversor
(filas de datos del inversor + párrafo con protecciones integradas)
## 4.4. Sistema de almacenamiento
(solo si hay batería)
## 4.5. Cableado y canalizaciones
(párrafo: conductores de cobre, caída de tensión a justificar en anexo de cálculos según REBT)
## 4.6. Protecciones
(párrafo: protecciones CC y CA, protección de interconexión y anti-isla según RD 1699/2011, magnetotérmicos y diferenciales; valores a justificar)
## 4.7. Puesta a tierra
(párrafo)
## 4.8. Equipo de medida
(párrafo: contador bidireccional, a solicitar a la distribuidora)

# 5. MODALIDAD DE CONEXIÓN Y AUTOCONSUMO
(párrafo + filas: modalidad, punto de conexión)

# 6. ESTIMACIÓN DE PRODUCCIÓN ENERGÉTICA
(filas: Fuente de datos, Producción anual estimada, Factor de rendimiento (PR), Orientación/inclinación; si la fuente es PVGIS menciónalo como referencia oficial de la Comisión Europea + breve párrafo)

# 7. ESTUDIO ECONÓMICO
(filas: Ahorro económico estimado, Período de retorno + párrafo aclaratorio de hipótesis)

# 8. NORMATIVA Y REGLAMENTACIÓN APLICABLE
(viñetas "* ")

# 9. DOCUMENTOS ANEXOS AL PROYECTO
(viñetas "* ": esquema unifilar, anexo de cálculos eléctricos, fichas técnicas de equipos, estudio de producción, estudio básico de seguridad y salud, gestión de residuos — los que correspondan)

# 10. CONCLUSIÓN
(párrafo)

# 11. DECLARACIÓN DEL TÉCNICO RESPONSABLE
(párrafo en lenguaje condicional)

Si el campo "notas" tiene contenido, intégralo de forma natural en las secciones que correspondan. Adapta la redacción al tipo de inmueble, la modalidad y las condiciones de sombra y orientación reales.`;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Método no permitido. Usa POST." });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Falta la variable de entorno ANTHROPIC_API_KEY en Vercel."
    });
  }

  let d;
  try {
    d = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch (e) {
    return res.status(400).json({ error: "Cuerpo de la petición no es JSON válido." });
  }
  if (!d || typeof d !== "object") {
    return res.status(400).json({ error: "Faltan los datos del proyecto." });
  }

  const faltan = ["empresa", "tecnico", "titular", "direccion", "ccaa"].filter(
    (k) => !d[k] || String(d[k]).trim() === ""
  );
  if (faltan.length) {
    return res.status(400).json({ error: "Faltan campos obligatorios: " + faltan.join(", ") });
  }

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
        max_tokens: 5000,
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
    const texto = (data.content || [])
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    if (!texto) {
      return res.status(502).json({ error: "La respuesta de Claude no contenía texto." });
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
