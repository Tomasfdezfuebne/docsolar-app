// api/pvgis.js
//
// Esta función vive en Vercel (backend) y actúa de "intermediario" entre
// tu formulario (frontend, en el navegador) y la API de PVGIS de la
// Comisión Europea.
//
// ¿Por qué hace falta? Porque PVGIS bloquea peticiones directas desde el
// navegador (CORS), pero SÍ permite peticiones desde un servidor. Vercel
// es ese servidor.
//
// Una vez subido, esta función estará disponible en:
//   https://tu-proyecto.vercel.app/api/pvgis
//
// El frontend le pedirá los datos a ESTA url (la tuya), y esta función
// se los pedirá a PVGIS por detrás, sin problemas de CORS.

export default async function handler(req, res) {
  // Permitir que tu formulario (desde cualquier origen) pueda llamar a este endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Petición de "pre-vuelo" CORS (el navegador la manda automáticamente, no es un error)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido. Usa GET.' });
  }

  const { lat, lon, peakpower, angle, aspect, loss } = req.query;

  // Validación básica de parámetros de entrada
  if (!lat || !lon || !peakpower) {
    return res.status(400).json({
      error: 'Faltan parámetros obligatorios: lat, lon y peakpower son requeridos.'
    });
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  const peakpowerNum = parseFloat(peakpower);

  if (isNaN(latNum) || latNum < -90 || latNum > 90) {
    return res.status(400).json({ error: 'Latitud no válida.' });
  }
  if (isNaN(lonNum) || lonNum < -180 || lonNum > 180) {
    return res.status(400).json({ error: 'Longitud no válida.' });
  }
  if (isNaN(peakpowerNum) || peakpowerNum <= 0 || peakpowerNum > 10000) {
    return res.status(400).json({ error: 'Potencia pico no válida.' });
  }

  // Construir la URL de PVGIS con los parámetros recibidos
  const params = new URLSearchParams({
    lat: latNum.toFixed(5),
    lon: lonNum.toFixed(5),
    peakpower: peakpowerNum.toString(),
    loss: (loss || '14').toString(),
    angle: (angle || '30').toString(),
    aspect: (aspect || '0').toString(),
    outputformat: 'json'
  });

  const pvgisUrl = `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?${params.toString()}`;

  try {
    const respuesta = await fetch(pvgisUrl);

    if (!respuesta.ok) {
      const textoError = await respuesta.text();
      return res.status(502).json({
        error: 'PVGIS devolvió un error',
        detalle: textoError,
        status: respuesta.status
      });
    }

    const datos = await respuesta.json();

    // Extraemos solo lo que nos interesa para no mandar al frontend
    // un JSON enorme con metadatos que no usamos
    const totales = datos?.outputs?.totals?.fixed;

    if (!totales) {
      return res.status(502).json({
        error: 'PVGIS devolvió una respuesta inesperada',
        datosCompletos: datos
      });
    }

    // PVGIS v5.2 no devuelve un campo "PR" directo en totals.fixed.
    // Lo calculamos a partir de las pérdidas totales (l_total, en %),
    // que sí vienen siempre informadas. PR = 1 - (pérdidas / 100).
    // l_total puede venir como número negativo o positivo según la
    // versión de la API, así que usamos su valor absoluto.
    const perdidasPorcentaje = totales.l_total;
    const performanceRatio = (typeof perdidasPorcentaje === 'number')
      ? Math.max(0, Math.min(1, 1 - Math.abs(perdidasPorcentaje) / 100))
      : null;

    return res.status(200).json({
      produccion_anual_kwh: totales.E_y,
      produccion_mensual_kwh: datos.outputs.monthly?.fixed || null,
      irradiacion_anual_kwh_m2: totales['H(i)_y'],
      performance_ratio: performanceRatio,
      perdidas_porcentaje: perdidasPorcentaje,
      ubicacion: {
        lat: latNum,
        lon: lonNum,
        elevacion_m: datos?.inputs?.location?.elevation ?? null
      },
      fuente: 'PVGIS v5.2 (re.jrc.ec.europa.eu) - Comisión Europea'
    });

  } catch (error) {
    return res.status(500).json({
      error: 'No se pudo conectar con PVGIS',
      detalle: error.message
    });
  }
}
