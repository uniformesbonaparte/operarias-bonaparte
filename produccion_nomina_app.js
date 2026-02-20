// produccion_nomina_v5_app.js
// Backend V5: Funcionalidades completas con sistema de pagos y gestión avanzada
// Puerto 8080 | Persistencia mejorada con backups automáticos
// Compatible con frontend moderno glassmorphism

// ⏰ Zona horaria: México Central (UTC-6 / UTC-5 en horario de verano)
// IMPORTANTE: Debe estar ANTES de cualquier new Date()
process.env.TZ = 'America/Mexico_City';

const express = require("express");
const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ENABLED = !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
const supabase = SUPABASE_ENABLED ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;

const app = express();
const PORT = process.env.PORT || 8080;

app.use(express.json());

// Servir archivos estáticos si existe la carpeta public
const publicPath = path.join(__dirname, "public");
app.use(express.static(publicPath));

// ========================= 
// RUTAS DEL FRONTEND
// =========================

/**
 * Función helper para servir archivos HTML
 */
function servirPagina(nombreArchivo) {
  return (req, res) => {
    const filePath = path.join(__dirname, "public", nombreArchivo);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).send(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Archivo no encontrado</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              text-align: center;
              background: rgba(255,255,255,0.1);
              padding: 3rem;
              border-radius: 20px;
              backdrop-filter: blur(10px);
            }
            h1 { margin: 0 0 1rem 0; }
            a { color: #fbbf24; text-decoration: none; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>⚠️ Archivo no encontrado</h1>
            <p>No se encontró: <strong>${nombreArchivo}</strong></p>
            <p>Asegúrate de tener la carpeta <strong>/public</strong> con todos los archivos HTML.</p>
            <p><a href="/">← Volver al inicio</a></p>
          </div>
        </body>
        </html>
      `);
    }
  };
}

// Ruta principal: Login
app.get("/", servirPagina("login.html"));
app.get("/login", servirPagina("login.html"));
app.get("/login.html", servirPagina("login.html"));

// Dashboard
app.get("/dashboard", servirPagina("dashboard_mobile.html"));
app.get("/dashboard.html", servirPagina("dashboard_mobile.html"));

// Módulos
app.get("/produccion", servirPagina("produccion.html"));
app.get("/produccion.html", servirPagina("produccion.html"));

// Registrar costura - Página separada para encargada y operarias
app.get("/registrar_costura", servirPagina("registrar_costura.html"));
app.get("/registrar_costura.html", servirPagina("registrar_costura.html"));

app.get("/operarias", servirPagina("operarias.html"));
app.get("/operarias.html", servirPagina("operarias.html"));

app.get("/pedidos", servirPagina("pedidos.html"));
app.get("/pedidos.html", servirPagina("pedidos.html"));

app.get("/reporte_semanal", servirPagina("reporte_semanal.html"));
app.get("/reporte_semanal.html", servirPagina("reporte_semanal.html"));

app.get("/configuracion", servirPagina("configuracion.html"));
app.get("/configuracion.html", servirPagina("configuracion.html"));

const DATA_FILE = path.join(__dirname, "datos_taller.json");

// =========================
// VARIABLES GLOBALES
// =========================
let operarias = [];
let maquinas = [];
let pedidos = [];
let registros = [];
let operariaIdCounter = 1;
let pedidoIdCounter = 1;
let registroIdCounter = 1;

// Array de prendas predeterminadas
let prendas = [
  { id: 1, nombre: "Playera polo" },
  { id: 2, nombre: "Playera deportiva" },
  { id: 3, nombre: "Pants" },
  { id: 4, nombre: "Chamarra" },
  { id: 5, nombre: "Pantalón gala" },
  { id: 6, nombre: "Camisa gala" },
  { id: 7, nombre: "Short deportivo" },
  { id: 8, nombre: "Short gala" },
  { id: 9, nombre: "Falda" },
  { id: 10, nombre: "Short falda" },
  { id: 11, nombre: "Yumper" },
  { id: 12, nombre: "Blusa" },
  { id: 13, nombre: "Bata" }
];

// Usuarios para admin y encargada (para cambio de credenciales)
let usuarios = [
  { id: 1, nombre: "admin", password: "admin123", tipo: "admin" },
  { id: 2, nombre: "encargada", password: "enc2025", tipo: "encargada" }
];

// =========================
// COSTURAS: CATÁLOGO Y PLANTILLAS POR PRENDA
// =========================
let costuraIdCounter = 1;
let operacionIdCounter = 1;

// Catálogo simple de nombres de costura (para autocompletado)
let costuras = [];

// Plantillas de costuras por prenda (se cargan al crear pedido)
// Key = prendaId (int), Value = [{ costura, maquina }]
let plantillasCosturas = {};

// Función para inicializar plantillas default (solo si están vacías)
function inicializarPlantillasCosturas() {
  // Mapeo: prendaId -> costuras por máquina
  const defaults = {
    3: { // Pants
      "Recta": ["pegar bolsa", "pespunte corte de franja", "pespuntes costado", "pespuntes tiro", "pespuntes completos", "pegar etiqueta y talla"],
      "Recta doble aguja": ["pespunte franja", "pespuntes costado", "pespuntes tiro", "pespuntes completos"],
      "Overlock": ["armar prenda completa"],
      "Multiagujas": ["resorte", "pegar bies"],
      "Collareta": ["bastilla"]
    },
    4: { // Chamarra
      "Overlock": ["armar prenda completa"],
      "Recta": ["pegar bolsa", "pespuntes manga", "pespuntes frente", "pespuntes espalda", "pespuntes sisas", "cerrar cuello con etiqueta", "cerrar cuello sin etiqueta", "pespunte de cierre", "pegar cierre", "bastilla cintura", "bastilla puños", "terminado completo"],
      "Recta doble aguja": ["pegar bolsa", "pespuntes manga", "pespuntes frente", "pespuntes espalda", "pespuntes sisas", "cerrar cuello con etiqueta", "cerrar cuello sin etiqueta", "pespunte de cierre", "pegar cierre", "bastilla cintura", "bastilla puños", "terminado completo"],
      "Multiagujas": ["pegar cinta mangas", "pegar cinta frente", "pegar cinta espalda", "pegar cinta completo"]
    },
    2: { // Playera deportiva
      "Overlock": ["armado completo"],
      "Recta": ["pespuntes frente", "pespuntes manga", "pespuntes espalda", "pespuntes hombro", "pespuntes puños", "pespunte cuello y etiqueta", "pegar etiqueta y talla", "pespunte cuello", "tapacostura y etiqueta", "tapacostura", "fijar cuello v"],
      "Collareta": ["bastilla puños", "bastilla cintura", "pespunte manga", "pespunte frente", "pespuntes sisas"],
      "Multiagujas": ["pegar bies"],
      "Recta doble aguja": ["tapacostura y etiqueta"]
    },
    1: { // Playera polo
      "Recta": ["pegar aletilla", "pespuntes hombros", "pespunte puños", "pespunte mangas", "pespunte frente", "pespunte espalda", "tapacostura y pespunte de aletilla", "remate puño", "costura completa"],
      "Collareta": ["bastilla puños", "bastilla cintura"],
      "Multiagujas": ["pegar bies"],
      "Overlock": ["armado completo"]
    },
    7: { // Short deportivo
      "Recta": ["pegar bolsa", "pespunte corte de franja", "pespuntes costado", "pespuntes tiro", "pespuntes completos", "pegar etiqueta y talla"],
      "Recta doble aguja": ["pespunte franja", "pespuntes costado", "pespuntes tiro", "pespuntes completos"],
      "Overlock": ["armar prenda completa"],
      "Multiagujas": ["resorte", "pegar bies"],
      "Collareta": ["bastilla", "pespuntes costado", "pespunte tiro"]
    },
    9: { // Falda
      "Overlock": ["orlear piezas", "armar completa"],
      "Recta": ["tablas delantero", "pinzas espalda", "armar cadera", "armar flecha", "pegar flecha", "pespuntes cadera", "bastilla", "pegar cierre", "armar pretina y talla", "pegar talla", "hacer bolsa", "hacer corte delantero", "tablas trasero", "completa"]
    },
    11: { // Yumper
      "Overlock": ["armar peto", "orlear falda", "orlear peto"],
      "Recta": ["tablas delanteras", "tablas traseras", "cierre", "bastilla", "armar pretina", "armar peto", "pespuntes peto", "armar cuello", "pespuntes de cuello", "pespuntes de sisa", "armar cinto", "pinzas frente peto", "pinzas traseras peto"]
    },
    6: { // Camisa gala
      "Overlock": ["prenda completa"],
      "Recta": ["armar cuello", "pespunte de hombros", "pespuntes canesú", "armar puños", "aletilla puños", "aletilla frente", "pespuntes mangas", "cerrar cuello y etiqueta", "pespunte cuello", "dobladillo", "completa"]
    },
    8: { // Short gala
      "Overlock": ["prenda completa"],
      "Recta": ["armar carterita", "pegar carterita", "pegar cierre", "bolsa delantera", "bolsa trasera", "bastilla", "pegar presillas", "cierre", "bolsas y carterita", "bastilla presillas y pretina", "cerrar pretina y etiqueta", "completo"],
      "Collareta": ["hacer presillas"]
    },
    5: { // Pantalón gala
      "Overlock": ["prenda completa"],
      "Recta": ["armar carterita", "pegar carterita", "pegar cierre", "bolsa delantera", "bolsa trasera", "bastilla", "pegar presillas", "cierre", "bolsas y carterita", "bastilla presillas y pretina", "cerrar pretina y etiqueta", "completo"],
      "Collareta": ["hacer presillas"]
    },
    10: { // Short falda
      "Overlock": ["prenda completa", "short", "falda"],
      "Recta": ["pespuntes costado", "pespuntes tiro", "pespuntes completos", "cerrar pretina y etiqueta", "etiqueta y talla", "bastilla", "fijar bolsa", "completo"],
      "Collareta": ["bastilla"],
      "Multiagujas": ["resorte"]
    },
    12: { // Blusa
      "Overlock": ["completo"],
      "Recta": ["armar cuello", "pespunte de hombros", "pespuntes canesú", "armar puños", "aletilla puños", "aletilla frente", "pespuntes mangas", "cerrar cuello y etiqueta", "pespunte cuello", "dobladillo", "completa", "pespuntes puño"]
    },
    13: { // Bata (jardín de niños)
      "Overlock": ["completa"],
      "Recta": ["armar cintas", "pegar cinta", "remates cintas", "remate cuello"]
    }
  };

  // Solo inicializar si plantillasCosturas está vacío
  if (Object.keys(plantillasCosturas).length > 0) return;

  for (const [prendaId, maquinas] of Object.entries(defaults)) {
    plantillasCosturas[Number(prendaId)] = [];
    for (const [maquina, ops] of Object.entries(maquinas)) {
      for (const costura of ops) {
        plantillasCosturas[Number(prendaId)].push({ costura, maquina });
      }
    }
  }

  // Generar catálogo de costuras únicas
  if (costuras.length === 0) {
    const nombresUnicos = new Set();
    for (const ops of Object.values(plantillasCosturas)) {
      for (const op of ops) {
        nombresUnicos.add(op.costura);
      }
    }
    costuras = [...nombresUnicos].sort().map(nombre => ({
      id: costuraIdCounter++,
      nombre
    }));
  }
}



// =========================
// SUPABASE (REMOTE) - FALLBACK AUTOMÁTICO
// =========================
async function cargarDatosDesdeSupabase() {
  if (!SUPABASE_ENABLED) return false;

  const [ops, maq, peds, regs, prnds, usrs, costs, plts] = await Promise.all([
    supabase.from("operarias").select("*").order("id", { ascending: true }),
    supabase.from("maquinas").select("*").order("nombre", { ascending: true }),
    supabase.from("pedidos").select("*").order("id", { ascending: true }),
    supabase.from("registros").select("*").order("id", { ascending: true }),
    supabase.from("prendas").select("*").order("id", { ascending: true }),
    supabase.from("usuarios").select("*").order("id", { ascending: true }),
    supabase.from("costuras").select("*").order("id", { ascending: true }).then(r => r).catch(() => ({ data: [], error: null })),
    supabase.from("plantillas_costuras").select("*").order("id", { ascending: true }).then(r => r).catch(() => ({ data: [], error: null }))
  ]);

  if (ops.error) throw ops.error;
  if (maq.error) throw maq.error;
  if (peds.error) throw peds.error;
  if (regs.error) throw regs.error;
  if (prnds.error) throw prnds.error;
  if (usrs.error) throw usrs.error;

  // Si está vacío (primera vez), no sobre-escribimos con vacío
  const vacioTotal =
    (ops.data?.length || 0) === 0 &&
    (peds.data?.length || 0) === 0 &&
    (regs.data?.length || 0) === 0;

  if (vacioTotal) return false;

  operarias = (ops.data || []).map(o => ({
    id: Number(o.id),
    nombre: o.nombre,
    password: o.password,
    usuario: o.usuario || null,
    rol: o.rol || "operaria",
    pagoPorPrenda: Number(o.pagoporprenda || 0),
    activa: o.activa !== undefined ? !!o.activa : true
  }));

  maquinas = (maq.data || []).map(m => m.nombre);

  pedidos = (peds.data || []).map(p => ({
    id: Number(p.id),
    escuela: p.escuela,
    folio: p.folio,
    prendas: Array.isArray(p.prendas) ? p.prendas.map(n => Number(n)) : [],
    items: p.items || [],
    estado: p.estado || "activo",
    fechaTerminado: p.fechaterminado ? new Date(p.fechaterminado).toISOString() : (p.fechaterminado || null),
    pagoPorPieza: Number(p.pagoporpieza || 0)
  }));

  registros = (regs.data || []).map(r => ({
    id: Number(r.id),
    operariaId: Number(r.operariaid),
    pedidoId: Number(r.pedidoid),
    prendaId: (r.prendaid === null || r.prendaid === undefined) ? null : Number(r.prendaid),
    operacionId: r.operacionid ? Number(r.operacionid) : null,
    maquina: r.maquina,
    descripcion: r.descripcion,
    cantidad: Number(r.cantidad),
    pagoPorPieza: Number(r.pagoporpieza || 0),
    totalGanado: Number(r.totalganado || 0),
    fecha: r.fecha ? new Date(r.fecha).toISOString() : new Date().toISOString(),
    fuente: r.fuente || "operaria",
    estadoPago: r.estadopago || "pendiente",
    semanaPago: r.semanapago || null,
    fechaPago: r.fechapago || null
  }));

  prendas = (prnds.data || []).map(p => ({ id: Number(p.id), nombre: p.nombre }));
  usuarios = (usrs.data || []).map(u => ({ id: Number(u.id), nombre: u.nombre, password: u.password, tipo: u.tipo }));

  operariaIdCounter = Math.max(0, ...operarias.map(o => o.id)) + 1;
  pedidoIdCounter = Math.max(0, ...pedidos.map(p => p.id)) + 1;
  registroIdCounter = Math.max(0, ...registros.map(r => r.id)) + 1;

  // Cargar costuras
  if (costs.data && costs.data.length > 0) {
    costuras = costs.data.map(c => ({ id: Number(c.id), nombre: c.nombre }));
    costuraIdCounter = Math.max(0, ...costuras.map(c => c.id)) + 1;
  }

  // Cargar plantillas de costuras por prenda
  if (plts.data && plts.data.length > 0) {
    plantillasCosturas = {};
    plts.data.forEach(p => {
      const pid = Number(p.prenda_id);
      if (!plantillasCosturas[pid]) plantillasCosturas[pid] = [];
      plantillasCosturas[pid].push({ costura: p.costura, maquina: p.maquina });
    });
  }

  // Calcular operacionIdCounter desde operaciones en pedidos existentes
  let maxOpId = 0;
  pedidos.forEach(p => {
    if (p.items && Array.isArray(p.items)) {
      p.items.forEach(item => {
        if (item.operaciones && Array.isArray(item.operaciones)) {
          item.operaciones.forEach(op => {
            if (op.opId && op.opId > maxOpId) maxOpId = op.opId;
          });
        }
      });
    }
  });
  operacionIdCounter = maxOpId + 1;

  // Inicializar plantillas default si no hay datos
  inicializarPlantillasCosturas();

  console.log("✅ Datos cargados desde Supabase");
  console.log(`   - ${operarias.length} operarias`);
  console.log(`   - ${pedidos.length} pedidos`);
  console.log(`   - ${registros.length} registros`);
  console.log(`   - ${costuras.length} costuras en catálogo`);
  console.log(`   - ${Object.keys(plantillasCosturas).length} plantillas de prendas`);
  return true;
}

async function guardarTodoASupabase() {
  if (!SUPABASE_ENABLED) return;

  const ops = operarias.map(o => ({
    id: o.id,
    nombre: o.nombre,
    password: o.password,
    usuario: o.usuario || null,
    rol: o.rol || "operaria",
    pagoporprenda: Number(o.pagoPorPrenda || 0),
    activa: o.activa !== undefined ? !!o.activa : true
  }));

  const maq = maquinas.map(n => ({ nombre: n }));

  const prnds = prendas.map(p => ({ id: p.id, nombre: p.nombre }));

  const usrs = usuarios.map(u => ({
    id: u.id,
    nombre: u.nombre,
    password: u.password,
    tipo: u.tipo
  }));

  const peds = pedidos.map(p => ({
    id: p.id,
    escuela: p.escuela,
    folio: p.folio,
    prendas: Array.isArray(p.prendas) ? p.prendas.map(n => Number(n)) : [],
    items: p.items || [],
    estado: p.estado || "activo",
    fechaterminado: p.fechaTerminado ? new Date(p.fechaTerminado).toISOString() : null,
    pagoporpieza: Number(p.pagoPorPieza || 0)
  }));

  const regs = registros.map(r => ({
    id: r.id,
    operariaid: r.operariaId,
    pedidoid: r.pedidoId,
    prendaid: r.prendaId,
    operacionid: r.operacionId || null,
    maquina: r.maquina,
    descripcion: r.descripcion,
    cantidad: Number(r.cantidad),
    pagoporpieza: Number(r.pagoPorPieza || 0),
    totalganado: Number(r.totalGanado || 0),
    fecha: r.fecha ? new Date(r.fecha).toISOString() : new Date().toISOString(),
    fuente: r.fuente || "operaria",
    estadopago: r.estadoPago || "pendiente",
    semanapago: r.semanaPago || null,
    fechapago: r.fechaPago || null
  }));

  // Upserts (por bloques para evitar límites)
  const upsertChunked = async (table, rows, onConflict, chunkSize = 500) => {
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase.from(table).upsert(chunk, { onConflict });
      if (error) throw error;
    }
  };

  await upsertChunked("operarias", ops, "id");
  await upsertChunked("maquinas", maq, "nombre");
  await upsertChunked("prendas", prnds, "id");
  await upsertChunked("usuarios", usrs, "id");
  await upsertChunked("pedidos", peds, "id");
  await upsertChunked("registros", regs, "id", 300);

  // Guardar costuras
  const costsRows = costuras.map(c => ({ id: c.id, nombre: c.nombre }));
  if (costsRows.length > 0) {
    try { await upsertChunked("costuras", costsRows, "id"); } catch(e) { console.warn("⚠️ Error guardando costuras:", e.message); }
  }

  // Guardar plantillas de costuras por prenda (DELETE + INSERT para sync completo)
  try {
    await supabase.from("plantillas_costuras").delete().neq("id", 0);
    const pltRows = [];
    let pltId = 1;
    for (const [prendaId, ops] of Object.entries(plantillasCosturas)) {
      for (const op of ops) {
        pltRows.push({ id: pltId++, prenda_id: Number(prendaId), costura: op.costura, maquina: op.maquina });
      }
    }
    if (pltRows.length > 0) {
      await upsertChunked("plantillas_costuras", pltRows, "id");
    }
  } catch(e) { console.warn("⚠️ Error guardando plantillas:", e.message); }

  console.log("💾 Datos guardados en Supabase");
}
// =========================
// PERSISTENCIA OPTIMIZADA CON CACHÉ
// =========================

// Variables para optimización
let datosEnMemoria = null;
let ultimoCambio = Date.now();
let guardadoPendiente = false;
let timeoutGuardado = null;
let guardadoReintentar = false; // si hay cambios mientras se guarda


/**
 * Carga datos desde el archivo JSON
 * Solo carga 1 vez y mantiene en memoria (caché)
 */
function cargarDatos() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      console.log("📖 Cargando datos desde " + DATA_FILE + "...");
      const raw = fs.readFileSync(DATA_FILE, "utf8");
      const data = JSON.parse(raw);

      operarias = data.operarias || [];
      maquinas = data.maquinas || [];
      pedidos = data.pedidos || [];
      registros = data.registros || [];
      prendas = data.prendas || prendas;
      usuarios = data.usuarios || usuarios;
      costuras = data.costuras || [];
      plantillasCosturas = data.plantillasCosturas || {};

      operariaIdCounter = data.operariaIdCounter || (operarias.length + 1);
      pedidoIdCounter = data.pedidoIdCounter || (pedidos.length + 1);
      registroIdCounter = data.registroIdCounter || (registros.length + 1);
      costuraIdCounter = data.costuraIdCounter || (costuras.length + 1);
      operacionIdCounter = data.operacionIdCounter || 1;

      // Inicializar plantillas default si no hay datos
      inicializarPlantillasCosturas();

      // Guardar en caché
      datosEnMemoria = data;

      console.log("✅ Datos cargados exitosamente");
      console.log(`   - ${operarias.length} operarias`);
      console.log(`   - ${pedidos.length} pedidos`);
      console.log(`   - ${registros.length} registros`);
      return;
    }
  } catch (err) {
    console.error("❌ Error cargando datos:", err.message);
  }

  // Si no hay archivo o hubo error, iniciamos con datos base
  console.log("📝 Inicializando con datos de ejemplo...");
  
  operarias = [
    { id: 1, nombre: "Ana", password: "1234", usuario: "ana", rol: "operaria", pagoPorPrenda: 0, activa: true },
    { id: 2, nombre: "Lupita", password: "1234", usuario: "lupita", rol: "operaria", pagoPorPrenda: 0, activa: true },
    { id: 3, nombre: "María", password: "1234", usuario: "maria", rol: "operaria", pagoPorPrenda: 0, activa: true },
    { id: 4, nombre: "Claudia", password: "1234", usuario: "claudia", rol: "operaria", pagoPorPrenda: 0, activa: true },
    { id: 5, nombre: "Rosa", password: "1234", usuario: "rosa", rol: "operaria", pagoPorPrenda: 0, activa: true },
    { id: 6, nombre: "Carmen", password: "1234", usuario: "carmen", rol: "operaria", pagoPorPrenda: 0, activa: true }
  ];
  operariaIdCounter = 7;

  maquinas = ["Recta", "Over", "Collareta", "Otra"];

  pedidos = [
    { id: 1, escuela: "Primaria Benito Juárez", folio: "FOL-001", pagoPorPieza: 2.5, estado: "activo", fechaTerminado: null },
    { id: 2, escuela: "Secundaria 20 de Noviembre", folio: "FOL-002", pagoPorPieza: 3.0, estado: "activo", fechaTerminado: null },
    { id: 3, escuela: "Colegio Las Américas", folio: "FOL-003", pagoPorPieza: 2.8, estado: "activo", fechaTerminado: null }
  ];
  pedidoIdCounter = 4;

  registros = [];
  registroIdCounter = 1;

  guardarDatos();
}

/**
 * Guarda datos en JSON con sistema optimizado
 * - Guardado ASÍNCRONO (no bloquea el servidor)
 * - Agrupa múltiples cambios (debouncing)
 * - Crea backup automático
 */
function guardarDatos() {
  // Marcar que hay cambios pendientes
  ultimoCambio = Date.now();
  
  // Si ya hay un guardado programado, cancelarlo
  if (timeoutGuardado) {
    clearTimeout(timeoutGuardado);
  }
  
  // Programar guardado después de 200ms
  // Esto agrupa múltiples cambios en un solo guardado
  timeoutGuardado = setTimeout(() => {
    guardarDatosAhora();
  }, 200);
}

/**
 * Ejecuta el guardado inmediatamente
 */
function guardarDatosAhora() {
  if (guardadoPendiente) {
    // Si llegan más cambios mientras se está guardando, reintentar al finalizar
    guardadoReintentar = true;
    return;
  }

  guardadoPendiente = true;

  const data = {
    operarias,
    maquinas,
    pedidos,
    registros,
    prendas,
    usuarios,
    costuras,
    plantillasCosturas,
    operariaIdCounter,
    pedidoIdCounter,
    registroIdCounter,
    costuraIdCounter,
    operacionIdCounter
  };

  
// ✅ Si estamos en Render con variables SUPABASE_*, guardamos remoto y NO escribimos JSON
if (SUPABASE_ENABLED) {
  (async () => {
    try {
      await guardarTodoASupabase();
    } catch (err) {
      console.error("❌ Error guardando en Supabase:", err.message || err);
    } finally {
      guardadoPendiente = false;
      if (guardadoReintentar) {
        guardadoReintentar = false;
        setTimeout(() => guardarDatosAhora(), 0);
      }
    }
  })();
  return;
}

try {
    const json = JSON.stringify(data, null, 2);
    const tempFile = DATA_FILE + ".tmp";
    const backupFile = DATA_FILE + ".bak";

    // Escribir en archivo temporal (ASÍNCRONO)
    fs.writeFile(tempFile, json, "utf8", (err) => {
      if (err) {
        console.error("❌ Error escribiendo temporal:", err.message);
        guardadoPendiente = false;
        if (guardadoReintentar) {
          guardadoReintentar = false;
          setTimeout(() => guardarDatosAhora(), 0);
        }
        return;
      }

      // Hacer backup del archivo anterior
      if (fs.existsSync(DATA_FILE)) {
        fs.copyFile(DATA_FILE, backupFile, (errBackup) => {
          if (errBackup) {
            console.warn("⚠️ No se pudo crear backup:", errBackup.message);
          }
          
          // Reemplazar archivo original
          fs.rename(tempFile, DATA_FILE, (errRename) => {
            if (errRename) {
              console.error("❌ Error renombrando archivo:", errRename.message);
            } else {
              // Actualizar caché
              datosEnMemoria = data;
              console.log("💾 Datos guardados exitosamente");
            }
            guardadoPendiente = false;
            if (guardadoReintentar) {
              guardadoReintentar = false;
              setTimeout(() => guardarDatosAhora(), 0);
            }
          });
        });
      } else {
        // Si no existe archivo anterior, solo renombrar
        fs.rename(tempFile, DATA_FILE, (errRename) => {
          if (errRename) {
            console.error("❌ Error creando archivo:", errRename.message);
          } else {
            datosEnMemoria = data;
            console.log("💾 Datos guardados exitosamente");
          }
          guardadoPendiente = false;
          if (guardadoReintentar) {
            guardadoReintentar = false;
            setTimeout(() => guardarDatosAhora(), 0);
          }
        });
      }
    });
    
  } catch (err) {
    console.error("❌ Error preparando datos:", err.message);
    guardadoPendiente = false;
    if (guardadoReintentar) {
      guardadoReintentar = false;
      setTimeout(() => guardarDatosAhora(), 0);
    }
  }
}

/**
 * Forzar guardado inmediato (usar solo en casos críticos)
 */
function forzarGuardado() {
  if (timeoutGuardado) {
    clearTimeout(timeoutGuardado);
    timeoutGuardado = null;
  }
  guardarDatosAhora();
}

// Guardar automáticamente cada 30 segundos si hay cambios pendientes
setInterval(() => {
  const tiempoSinGuardar = Date.now() - ultimoCambio;
  if (tiempoSinGuardar < 30000 && !guardadoPendiente) {
    console.log("🔄 Auto-guardado periódico...");
    guardarDatosAhora();
  }
}, 30000);

// Guardar al cerrar el servidor
process.on('SIGINT', () => {
  console.log('\n🛑 Cerrando servidor...');
  console.log('💾 Guardando datos finales...');

  // Si está Supabase activo (Render), guardamos remoto best-effort y salimos.
  if (SUPABASE_ENABLED) {
    try {
      forzarGuardado(); // dispara guardarDatosAhora() debounced
    } catch (e) {}
    setTimeout(() => process.exit(0), 1500);
    return;
  }

  // Local: Guardado SÍNCRONO al cerrar (para garantizar que se guarda)
  const data = {
    operarias,
    maquinas,
    pedidos,
    registros,
    prendas,
    usuarios,
    costuras,
    plantillasCosturas,
    operariaIdCounter,
    pedidoIdCounter,
    registroIdCounter,
    costuraIdCounter,
    operacionIdCounter
  };

  try {
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(DATA_FILE, json, "utf8");
    console.log('✅ Datos guardados exitosamente');
  } catch (err) {
    console.error('❌ Error guardando datos finales:', err.message);
  }

  process.exit(0);
});


process.on('SIGTERM', () => {
  forzarGuardado();
  setTimeout(() => process.exit(0), 1000);
});

// Cargar datos al iniciar (Supabase en Render / JSON en local)
(async () => {
  try {
    const ok = await cargarDatosDesdeSupabase();
    if (!ok) cargarDatos();
  } catch (e) {
    console.error("❌ Error cargando desde Supabase:", e.message || e);
    cargarDatos();
  }
  // Asegurar que las plantillas existan siempre
  inicializarPlantillasCosturas();
})();
// =========================
// CREDENCIALES (compatibilidad)
// =========================
function getAdminPassword() {
  const admin = usuarios.find(u => u.tipo === "admin");
  return admin ? admin.password : "admin123";
}

function getEncargadaPassword() {
  const encargada = usuarios.find(u => u.tipo === "encargada");
  return encargada ? encargada.password : "enc2025";
}

// =========================
// ENDPOINTS DE LOGIN
// =========================

/**
 * Login de Admin (endpoint original)
 */
app.post("/api/login/admin", (req, res) => {
  const { password } = req.body;
  const admin = usuarios.find(u => u.tipo === "admin");
  if (password === getAdminPassword()) {
    return res.json({ 
      mensaje: "Login admin correcto", 
      ok: true, 
      rol: "admin",
      nombre: admin ? admin.nombre : "admin"
    });
  }
  return res.status(401).json({ error: "Contraseña de admin incorrecta.", ok: false });
});

/**
 * Login de Encargada (endpoint original)
 */
app.post("/api/login/encargada", (req, res) => {
  const { password } = req.body;
  const encargada = usuarios.find(u => u.tipo === "encargada");
  if (password === getEncargadaPassword()) {
    return res.json({ 
      mensaje: "Login encargada correcto", 
      ok: true, 
      rol: "encargada",
      nombre: encargada ? encargada.nombre : "encargada"
    });
  }
  return res.status(401).json({ error: "Contraseña de encargada incorrecta.", ok: false });
});

/**
 * Login de Operaria con validación de contraseña (endpoint original)
 */
app.post("/api/login/operaria", (req, res) => {
  const { operariaId, password } = req.body;
  const id = Number(operariaId);
  const op = operarias.find(o => o.id === id);
  
  if (!op) {
    return res.status(404).json({ error: "Operaria no encontrada.", ok: false });
  }
  if (op.password !== String(password)) {
    return res.status(401).json({ error: "Contraseña incorrecta.", ok: false });
  }
  
  res.json({ 
    mensaje: "Login correcto", 
    ok: true,
    operaria: { id: op.id, nombre: op.nombre } 
  });
});

/**
 * Login unificado (compatible con frontend nuevo)
 * Acepta: usuario + password
 */
app.post("/api/login", (req, res) => {
  const { usuario, password } = req.body || {};
  
  if (!usuario || !password) {
    return res.status(400).json({ ok: false, mensaje: "Faltan usuario o contraseña" });
  }

  // Admin
  if (usuario === "admin") {
    if (password === getAdminPassword()) {
      return res.json({
        ok: true,
        rol: "admin",
        tipo: "admin",
        nombre: "Administrador",
        id: "admin"
      });
    }
    return res.status(401).json({ ok: false, mensaje: "Contraseña incorrecta" });
  }

  // Encargada
  if (usuario === "encargada") {
    if (password === getEncargadaPassword()) {
      return res.json({
        ok: true,
        rol: "encargada",
        tipo: "encargada",
        nombre: "Encargada",
        id: "encargada"
      });
    }
    return res.status(401).json({ ok: false, mensaje: "Contraseña incorrecta" });
  }

  // Operarias: búsqueda flexible por usuario, nombre o id
  const operaria = operarias.find(o =>
    (o.usuario && o.usuario === usuario) ||
    o.nombre.toLowerCase() === usuario.toLowerCase() ||
    String(o.id) === String(usuario)
  );

  if (!operaria) {
    return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
  }

  if (operaria.password !== password) {
    return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
  }

  return res.json({
    ok: true,
    rol: operaria.rol || "operaria",
    tipo: "operaria",
    nombre: operaria.nombre,
    idOperaria: operaria.id,
    id: operaria.id
  });
});



// =========================
// MIGRACIÓN (1 sola vez) - OPCIONAL
// =========================
// Para migrar tu JSON local a Supabase:
// 1) En Render agrega ENV: MIGRATION_KEY
// 2) Haz POST a /api/migrar con header: x-migration-key: TU_CLAVE
// 3) Cuando termine, borra este endpoint y la ENV.
app.post("/api/migrar", async (req, res) => {
  try {
    if (!SUPABASE_ENABLED) {
      return res.status(400).json({ ok: false, mensaje: "Supabase no está configurado (ENV faltante)" });
    }

    const key = req.headers["x-migration-key"];
    if (!process.env.MIGRATION_KEY || key !== process.env.MIGRATION_KEY) {
      return res.status(401).json({ ok: false, mensaje: "No autorizado" });
    }

    // Cargar desde JSON local
    cargarDatos();

    // Guardar todo a Supabase
    await guardarTodoASupabase();

    return res.json({ ok: true, mensaje: "Migración completada a Supabase" });
  } catch (e) {
    return res.status(500).json({ ok: false, mensaje: e.message || String(e) });
  }
});

// =========================
// OPERARIAS - CRUD COMPLETO
// =========================

/**
 * GET /api/operarias
 * Lista todas las operarias
 */
app.get("/api/operarias", (req, res) => {
  res.json(operarias);
});

/**
 * POST /api/operarias
 * Crea una nueva operaria
 */
app.post("/api/operarias", (req, res) => {
  const { nombre, password, usuario, rol, pagoPorPrenda, activa } = req.body || {};
  
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre de la operaria es obligatorio." });
  }
  if (!password || !password.trim()) {
    return res.status(400).json({ error: "La contraseña es obligatoria." });
  }

  const nuevoUsuario = (usuario || nombre).trim().toLowerCase();
  
  const nueva = {
    id: operariaIdCounter++,
    nombre: nombre.trim(),
    password: String(password).trim(),
    usuario: nuevoUsuario,
    rol: rol || "operaria",
    pagoPorPrenda: Number(pagoPorPrenda) || 0,
    activa: activa !== undefined ? !!activa : true
  };

  operarias.push(nueva);
  guardarDatos();
  
  res.status(201).json({ 
    mensaje: "Operaria creada correctamente", 
    ok: true,
    operaria: nueva 
  });
});

/**
 * PUT /api/operarias/:id
 * Actualiza una operaria existente
 */
app.put("/api/operarias/:id", (req, res) => {
  const id = Number(req.params.id);
  const op = operarias.find(o => o.id === id);
  
  if (!op) {
    return res.status(404).json({ error: "Operaria no encontrada." });
  }

  const { nombre, password, usuario, rol, pagoPorPrenda, activa } = req.body || {};

  if (nombre && nombre.trim()) {
    op.nombre = nombre.trim();
  }
  if (password && password.trim()) {
    op.password = String(password).trim();
  }
  if (usuario && usuario.trim()) {
    op.usuario = usuario.trim().toLowerCase();
  }
  if (rol) {
    op.rol = rol;
  }
  if (pagoPorPrenda !== undefined) {
    op.pagoPorPrenda = Number(pagoPorPrenda) || 0;
  }
  if (activa !== undefined) {
    op.activa = !!activa;
  }

  guardarDatos();
  
  res.json({ 
    mensaje: "Operaria actualizada correctamente.", 
    ok: true,
    operaria: op 
  });
});

/**
 * DELETE /api/operarias/:id
 * Elimina una operaria (solo si no tiene registros)
 */
app.delete("/api/operarias/:id", (req, res) => {
  const id = Number(req.params.id);
  const op = operarias.find(o => o.id === id);
  
  if (!op) {
    return res.status(404).json({ error: "Operaria no encontrada." });
  }

  // Validar que no tenga registros
  const tieneRegistros = registros.some(r => r.operariaId === id);
  if (tieneRegistros) {
    return res.status(400).json({ 
      error: "No se puede eliminar la operaria porque tiene registros de costuras." 
    });
  }

  operarias = operarias.filter(o => o.id !== id);
  guardarDatos();
  
  res.json({ 
    mensaje: "Operaria eliminada correctamente.", 
    ok: true 
  });
});

/**
 * GET /api/operarias/:id/perfil
 * Obtiene el perfil completo de una operaria con estadísticas
 * Incluye: resumen por fuente (operaria/encargada), total general, registros
 */
app.get("/api/operarias/:id/perfil", (req, res) => {
  const id = Number(req.params.id);
  const operaria = operarias.find(o => o.id === id);
  
  if (!operaria) {
    return res.status(404).json({ error: "Operaria no encontrada." });
  }

  // Filtrar todos los registros de esta operaria (solo pendientes)
  const registrosOperaria = registros.filter(r => 
    r.operariaId === id && 
    (r.estadoPago || "pendiente") === "pendiente"
  );

  // Separar por fuente
  const regOperaria = registrosOperaria.filter(r => (r.fuente || "operaria") === "operaria");
  const regEncargada = registrosOperaria.filter(r => r.fuente === "encargada");

  // Calcular totales por fuente
  const totalPiezasOperaria = regOperaria.reduce((sum, r) => sum + r.cantidad, 0);
  const totalGanadoOperaria = regOperaria.reduce((sum, r) => sum + r.totalGanado, 0);

  const totalPiezasEncargada = regEncargada.reduce((sum, r) => sum + r.cantidad, 0);
  const totalGanadoEncargada = regEncargada.reduce((sum, r) => sum + r.totalGanado, 0);

  // Totales generales
  const totalPiezas = totalPiezasOperaria + totalPiezasEncargada;
  const totalGanado = totalGanadoOperaria + totalGanadoEncargada;

  // Enriquecer registros con información de pedidos
  const registrosDetallados = registrosOperaria.map(r => {
    const pedido = pedidos.find(p => p.id === r.pedidoId);
    return {
      ...r,
      escuela: pedido ? pedido.escuela : "N/A",
      folio: pedido ? pedido.folio : "N/A"
    };
  });

  res.json({
    operaria: {
      id: operaria.id,
      nombre: operaria.nombre,
      usuario: operaria.usuario,
      rol: operaria.rol,
      activa: operaria.activa
    },
    resumenPorFuente: {
      operaria: {
        piezas: totalPiezasOperaria,
        ganado: totalGanadoOperaria,
        registros: regOperaria.length
      },
      encargada: {
        piezas: totalPiezasEncargada,
        ganado: totalGanadoEncargada,
        registros: regEncargada.length
      }
    },
    totalGeneral: {
      piezas: totalPiezas,
      ganado: totalGanado,
      registros: registrosOperaria.length
    },
    registros: registrosDetallados
  });
});

/**
 * GET /api/operarias/:id/resumen-dia-semana
 * Obtiene resumen de producción del día y la semana para una operaria
 */
app.get("/api/operarias/:id/resumen-dia-semana", (req, res) => {
  const id = Number(req.params.id);
  const operaria = operarias.find(o => o.id === id);
  
  if (!operaria) {
    return res.status(404).json({ error: "Operaria no encontrada." });
  }

  const hoy = new Date();
  const hoyStr = formatYMDLocal(hoy);

  // Calcular inicio de semana (lunes)
  const day = hoy.getDay();
  const offset = (day === 0 ? -6 : 1 - day);
  const inicioSemana = new Date(hoy);
  inicioSemana.setDate(hoy.getDate() + offset);
  const inicioSemanaStr = formatYMDLocal(inicioSemana);

  // Filtrar registros pendientes de esta operaria
  const registrosOperaria = registros.filter(r => 
    r.operariaId === id && 
    (r.estadoPago || "pendiente") === "pendiente"
  );

  // Registros del día (convertir UTC a local)
  const registrosDia = registrosOperaria.filter(r => {
    const fechaUTC = new Date(r.fecha);
    const year = fechaUTC.getFullYear();
    const month = String(fechaUTC.getMonth() + 1).padStart(2, '0');
    const day = String(fechaUTC.getDate()).padStart(2, '0');
    const fechaLocal = `${year}-${month}-${day}`;
    return fechaLocal === hoyStr;
  });
  const piezasDia = registrosDia.reduce((sum, r) => sum + r.cantidad, 0);
  const ganadoDia = registrosDia.reduce((sum, r) => sum + r.totalGanado, 0);

  // Registros de la semana (convertir UTC a local)
  const registrosSemana = registrosOperaria.filter(r => {
    const fechaUTC = new Date(r.fecha);
    const year = fechaUTC.getFullYear();
    const month = String(fechaUTC.getMonth() + 1).padStart(2, '0');
    const day = String(fechaUTC.getDate()).padStart(2, '0');
    const fechaReg = `${year}-${month}-${day}`;
    return fechaReg >= inicioSemanaStr && fechaReg <= hoyStr;
  });
  const piezasSemana = registrosSemana.reduce((sum, r) => sum + r.cantidad, 0);
  const ganadoSemana = registrosSemana.reduce((sum, r) => sum + r.totalGanado, 0);

  res.json({
    operaria: {
      id: operaria.id,
      nombre: operaria.nombre
    },
    dia: {
      fecha: hoyStr,
      piezas: piezasDia,
      ganado: ganadoDia,
      registros: registrosDia.length
    },
    semana: {
      inicio: inicioSemanaStr,
      fin: hoyStr,
      piezas: piezasSemana,
      ganado: ganadoSemana,
      registros: registrosSemana.length
    }
  });
});

// =========================
// MÁQUINAS
// =========================

/**
 * GET /api/maquinas
 * Lista todas las máquinas disponibles
 */
app.get("/api/maquinas", (req, res) => {
  res.json(maquinas);
});

/**
 * POST /api/maquinas
 * Agrega una nueva máquina
 */
app.post("/api/maquinas", (req, res) => {
  const { nombre } = req.body;
  
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre de la máquina es obligatorio." });
  }

  const nombreTrim = nombre.trim();
  
  if (!maquinas.includes(nombreTrim)) {
    maquinas.push(nombreTrim);
    guardarDatos();
  }

  res.json({ 
    mensaje: "Máquina agregada correctamente.",
    ok: true, 
    maquinas 
  });
});

/**
 * DELETE /api/maquinas/:nombre
 * Elimina una máquina
 */
app.delete("/api/maquinas/:nombre", (req, res) => {
  const nombre = req.params.nombre;
  
  if (!maquinas.includes(nombre)) {
    return res.status(404).json({ error: "Máquina no encontrada." });
  }

  maquinas = maquinas.filter(m => m !== nombre);
  guardarDatos();
  
  res.json({ 
    mensaje: "Máquina eliminada correctamente.",
    ok: true,
    maquinas
  });
});

// =========================
// PEDIDOS - CRUD COMPLETO + ESTADO
// =========================

/**
 * GET /api/pedidos
 * Lista todos los pedidos
 * Query params:
 * - estado: "activo" | "terminado" | "todos" (default: "todos")
 * - conTotales: true para incluir totales de producción
 */
app.get("/api/pedidos", (req, res) => {
  const { estado, conTotales, conPrendas, conDesglose } = req.query;
  
  let pedidosFiltrados = pedidos;
  
  // Filtrar por estado si se especifica
  if (estado && estado !== "todos") {
    pedidosFiltrados = pedidos.filter(p => (p.estado || "activo") === estado);
  }

  // Si se solicitan totales, calcular producción por pedido
  if (conTotales === "true") {
    const pedidosConTotales = pedidosFiltrados.map(pedido => {
      // Filtrar registros de este pedido (TODOS los estados Y solo de operarias)
      const registrosPedido = registros.filter(r => 
        r.pedidoId === pedido.id && 
        (r.fuente || "operaria") !== "encargada"  // EXCLUIR ENCARGADA
        // NO filtrar por estadoPago → cuenta pendientes Y pagados
      );
      
      const totalPiezas = registrosPedido.reduce((sum, r) => sum + r.cantidad, 0);
      const totalPagado = registrosPedido.reduce((sum, r) => sum + r.totalGanado, 0);
      
      // Contar operarias únicas
      const operariasUnicas = [...new Set(registrosPedido.map(r => r.operariaId))];
      
      return {
        ...pedido,
        totalPiezas,
        totalPagado,
        numeroOperarias: operariasUnicas.length,
        costoEstimado: (pedido.items || []).reduce((sum, item) => {
          return sum + (item.operaciones || []).reduce((s, op) => s + (op.precio * item.cantidad), 0);
        }, 0)
      };
    });
    
    pedidosFiltrados = pedidosConTotales;
  }

  // Si se solicita con nombres de prendas
  if (conPrendas === "true") {
    pedidosFiltrados = pedidosFiltrados.map(pedido => {
      if (pedido.prendas && pedido.prendas.length > 0) {
        const nombresPrendas = pedido.prendas.map(prendaId => {
          const prenda = prendas.find(p => p.id === prendaId);
          return prenda ? prenda.nombre : "Desconocida";
        });
        
        return {
          ...pedido,
          prendasIds: pedido.prendas,
          prendas: nombresPrendas
        };
      }
      return pedido;
    });
  }

  // Si se solicita con desglose por prenda
  if (conDesglose === "true") {
    pedidosFiltrados = pedidosFiltrados.map(pedido => {
      const regsPedido = registros.filter(r => 
        r.pedidoId === pedido.id &&
        (r.fuente || "operaria") !== "encargada"  // EXCLUIR ENCARGADA
        // NO filtrar por estadoPago → cuenta pendientes Y pagados
      );
      
      // Agrupar por prenda
      const desglose = {};
      regsPedido.forEach(reg => {
        if (reg.prendaId) {
          if (!desglose[reg.prendaId]) {
            desglose[reg.prendaId] = 0;
          }
          desglose[reg.prendaId] += reg.totalGanado;
        }
      });

      // Convertir a array con nombres
      const desglosePrendas = Object.keys(desglose).map(prendaId => {
        const prenda = prendas.find(p => p.id === parseInt(prendaId));
        return {
          prenda: prenda ? prenda.nombre : "Desconocida",
          total: desglose[prendaId]
        };
      });

      return {
        ...pedido,
        desglosePrendas
      };
    });
  }
  
  res.json(pedidosFiltrados);
});

/**
 * POST /api/pedidos
 * Crea un nuevo pedido
 * Acepta items[] con prendaId, cantidad, operaciones (nuevo)
 * O solo prendas[] para backward compatibility (legacy)
 */
app.post("/api/pedidos", (req, res) => {
  const { escuela, folio, prendas: prendasSeleccionadas, items } = req.body;
  
  if (!escuela || !escuela.trim()) {
    return res.status(400).json({ error: "El nombre de la escuela es obligatorio." });
  }
  if (!folio || !folio.trim()) {
    return res.status(400).json({ error: "El folio es obligatorio." });
  }

  const nuevo = {
    id: pedidoIdCounter++,
    escuela: escuela.trim(),
    folio: folio.trim(),
    prendas: prendasSeleccionadas || [],
    items: [],
    estado: "activo",
    fechaTerminado: null
  };

  // Si vienen items detallados (nuevo formato)
  if (Array.isArray(items) && items.length > 0) {
    nuevo.items = items.map(item => {
      const prendaId = Number(item.prendaId);
      const cantidad = Number(item.cantidad) || 0;
      
      // Operaciones: siempre se generan desde la plantilla (por prenda) si existe,
// y el usuario SOLO puede mandar precios (sin opId) para esa combinación costura+maquina.
      const opsPrecioMap = new Map(
        (Array.isArray(item.operaciones) ? item.operaciones : []).map(op => [
          `${(op.costura || op.descripcion || '').trim()}||${(op.maquina || '').trim()}`,
          Number(op.precio) || 0
        ])
      );

      let operacionesBase = [];
      if (plantillasCosturas[prendaId] && plantillasCosturas[prendaId].length > 0) {
        operacionesBase = plantillasCosturas[prendaId].map(op => ({
          costura: op.costura,
          maquina: op.maquina,
          precio: 0
        }));
      } else {
        // Fallback: si no hay plantilla, usa lo que venga en la petición
        operacionesBase = Array.isArray(item.operaciones) ? item.operaciones.map(op => ({
          costura: op.costura || op.descripcion || "",
          maquina: op.maquina || "",
          precio: Number(op.precio) || 0
        })) : [];
      }

      // Aplicar precios del cliente sobre la base (por costura+maquina)
      const operaciones = operacionesBase.map(op => {
        const k = `${(op.costura || '').trim()}||${(op.maquina || '').trim()}`;
        const precio = opsPrecioMap.has(k) ? opsPrecioMap.get(k) : (Number(op.precio) || 0);
        return { ...op, precio };
      });

      // Asignar opId a cada operación (SIEMPRE desde backend)

      // Asignar opId a cada operación
      const opsConId = operaciones.map(op => ({
        opId: operacionIdCounter++,
        costura: op.costura || op.descripcion || "",
        maquina: op.maquina || "",
        precio: Number(op.precio) || 0
      }));

      const tallas = Array.isArray(item.tallas) ? item.tallas.filter(t => (t.talla||'').toString().trim() !== '' && Number(t.cantidad) > 0).map(t => ({ talla: (t.talla||'').toString().trim(), cantidad: Number(t.cantidad) })) : [];

      const cantidadTotal = tallas.length > 0 ? tallas.reduce((s,t)=>s+t.cantidad,0) : cantidad;

      return { prendaId, cantidad: cantidadTotal, tallas, operaciones: opsConId };
    });

    // Asegurar backward compat: llenar prendas[] desde items
    nuevo.prendas = [...new Set(nuevo.items.map(i => i.prendaId))];
  }
  
  pedidos.push(nuevo);
  guardarDatos();
  
  res.status(201).json({ 
    mensaje: "Pedido creado correctamente.",
    ok: true, 
    pedido: nuevo 
  });
});

/**
 * GET /api/pedidos/:id
 * Obtiene un pedido específico por ID (con items enriquecidos)
 */
app.get("/api/pedidos/:id", (req, res) => {
  const id = Number(req.params.id);
  const pedido = pedidos.find(p => p.id === id);
  
  if (!pedido) {
    return res.status(404).json({ error: "Pedido no encontrado." });
  }
  
  // Enriquecer items con nombres de prendas
  const resultado = { ...pedido };
  if (resultado.items && resultado.items.length > 0) {
    resultado.items = resultado.items.map(item => {
      const prenda = prendas.find(p => p.id === item.prendaId);
      return { ...item, prenda: prenda ? prenda.nombre : "Desconocida" };
    });
  }
  
  res.json(resultado);
});

/**
 * PUT /api/pedidos/:id
 * Actualiza un pedido existente (con soporte para items)
 */
app.put("/api/pedidos/:id", (req, res) => {
  const id = Number(req.params.id);
  const pedido = pedidos.find(p => p.id === id);

  if (!pedido) {
    return res.status(404).json({ error: "Pedido no encontrado." });
  }

  const { escuela, folio, pagoPorPieza, prendas: prendasBody, items } = req.body;

  if (escuela && escuela.trim()) {
    pedido.escuela = escuela.trim();
  }
  if (folio && folio.trim()) {
    pedido.folio = folio.trim();
  }
  if (pagoPorPieza !== undefined) {
    pedido.pagoPorPieza = Number(pagoPorPieza) || 0;
  }

  // ✅ Actualizar prendas (backward compat)
  if (Array.isArray(prendasBody)) {
    pedido.prendas = prendasBody
      .map(n => Number(n))
      .filter(n => Number.isFinite(n) && n > 0);
  }

  // ✅ Actualizar items detallados (nuevo formato)
  if (Array.isArray(items)) {
    pedido.items = items.map(item => {
      const prendaId = Number(item.prendaId);
      const cantidad = Number(item.cantidad) || 0;
      const tallas = Array.isArray(item.tallas) ? item.tallas.filter(t => (t.talla||'').toString().trim() !== '' && Number(t.cantidad) > 0).map(t => ({ talla: (t.talla||'').toString().trim(), cantidad: Number(t.cantidad) })) : [];
      const cantidadTotal = tallas.length > 0 ? tallas.reduce((s,t)=>s+t.cantidad,0) : cantidad;
      const operaciones = (item.operaciones || []).map(op => ({
        opId: operacionIdCounter++,
        costura: op.costura || op.descripcion || "",
        maquina: op.maquina || "",
        precio: Number(op.precio) || 0
      }));
      return { prendaId, cantidad: cantidadTotal, tallas, operaciones };
    });
    // Sync prendas[] desde items
    pedido.prendas = [...new Set(pedido.items.map(i => i.prendaId))];
  }

  guardarDatos();

  res.json({ 
    mensaje: "Pedido actualizado correctamente.",
    ok: true, 
    pedido 
  });
});


/**
 * PUT /api/pedidos/:id/estado
 * Cambia el estado de un pedido (activo/terminado)
 */
app.put("/api/pedidos/:id/estado", (req, res) => {
  const id = Number(req.params.id);
  const pedido = pedidos.find(p => p.id === id);
  
  if (!pedido) {
    return res.status(404).json({ error: "Pedido no encontrado." });
  }

  const { estado } = req.body;
  
  if (!estado || !["activo", "terminado"].includes(estado)) {
    return res.status(400).json({ error: "Estado debe ser 'activo' o 'terminado'." });
  }

  pedido.estado = estado;
  
  if (estado === "terminado") {
    pedido.fechaTerminado = new Date().toISOString();
  } else {
    pedido.fechaTerminado = null;
  }

  guardarDatos();
  
  res.json({ 
    mensaje: `Pedido marcado como ${estado}.`,
    ok: true, 
    pedido 
  });
});

/**
 * DELETE /api/pedidos/:id
 * Elimina un pedido (solo si no tiene registros asociados)
 */
app.delete("/api/pedidos/:id", (req, res) => {
  const id = Number(req.params.id);
  const pedido = pedidos.find(p => p.id === id);
  
  if (!pedido) {
    return res.status(404).json({ error: "Pedido no encontrado." });
  }

  // Validar que no tenga registros
  const tieneRegistros = registros.some(r => r.pedidoId === id);
  if (tieneRegistros) {
    return res.status(400).json({ 
      error: "No se puede eliminar el pedido porque tiene registros asociados." 
    });
  }

  pedidos = pedidos.filter(p => p.id !== id);
  guardarDatos();
  
  res.json({ 
    mensaje: "Pedido eliminado correctamente.",
    ok: true 
  });
});

// =========================
// REGISTROS DE PRODUCCIÓN + PAGOS
// =========================

/**
 * GET /api/registros
 * Lista registros con filtros opcionales:
 * - fecha: filtra por fecha específica (YYYY-MM-DD)
 * - operariaId: filtra por operaria
 * - fuente: filtra por fuente (operaria/encargada)
 * - estadoPago: "pendiente" | "pagado" | "todos" (default: "pendiente")
 */
app.get("/api/registros", (req, res) => {
  const { fecha, operariaId, fuente, estadoPago } = req.query;
  let data = registros;

  // Filtrar por estado de pago (por defecto solo pendientes)
  const estadoFiltro = estadoPago || "pendiente";
  if (estadoFiltro !== "todos") {
    data = data.filter(r => (r.estadoPago || "pendiente") === estadoFiltro);
  }

  if (fecha) {
    data = data.filter(r => {
      // Convertir fecha UTC a local para comparar
      const fechaUTC = new Date(r.fecha);
      const year = fechaUTC.getFullYear();
      const month = String(fechaUTC.getMonth() + 1).padStart(2, '0');
      const day = String(fechaUTC.getDate()).padStart(2, '0');
      const fechaLocal = `${year}-${month}-${day}`;
      return fechaLocal === fecha;
    });
  }
  if (operariaId) {
    data = data.filter(r => r.operariaId === Number(operariaId));
  }
  if (fuente) {
    data = data.filter(r => (r.fuente || "operaria") === fuente);
  }

  // Enriquecer con nombres de operaria, pedido y prenda
  const registrosEnriquecidos = data.map(r => {
    const op = operarias.find(o => o.id === r.operariaId);
    const ped = pedidos.find(p => p.id === r.pedidoId);
    const prenda = prendas.find(p => p.id === r.prendaId);
    return {
      ...r,
      operariaNombre: op ? op.nombre : "N/A",
      escuela: ped ? ped.escuela : "N/A",
      folio: ped ? ped.folio : "N/A",
      pedidoEstado: ped ? (ped.estado || "activo") : "N/A",
      prenda: prenda ? prenda.nombre : "N/A"
    };
  });

  res.json(registrosEnriquecidos);
});

/**
 * POST /api/registros
 * Crea un nuevo registro de producción
 */
app.post("/api/registros", (req, res) => {
  const { operariaId, pedidoId, prendaId, operacionId, maquina, descripcion, cantidad, pagoPorPieza, fuente, talla } = req.body;

  // Validaciones básicas
  if (!operariaId || !pedidoId || !cantidad) {
    return res.status(400).json({ error: "Datos incompletos. operariaId, pedidoId y cantidad son obligatorios." });
  }

  const cant = Number(cantidad);
  if (cant <= 0) {
    return res.status(400).json({ error: "La cantidad debe ser mayor a 0." });
  }

  let maqFinal = maquina;
  let descFinal = descripcion;
  let pagoFinal = Number(pagoPorPieza) || 0;
  let prendaIdFinal = prendaId ? Number(prendaId) : null;
  let opIdFinal = operacionId ? Number(operacionId) : null;

  // Si viene operacionId, auto-llenar datos desde la operación del pedido
  if (opIdFinal) {
    const pedido = pedidos.find(p => p.id === Number(pedidoId));
    if (pedido && pedido.items) {
      let opEncontrada = null;
      let itemEncontrado = null;
      for (const item of pedido.items) {
        const op = (item.operaciones || []).find(o => o.opId === opIdFinal);
        if (op) {
          opEncontrada = op;
          itemEncontrado = item;
          break;
        }
      }
      if (opEncontrada) {
        maqFinal = opEncontrada.maquina || maqFinal;
        descFinal = opEncontrada.costura || opEncontrada.descripcion || descFinal;
        pagoFinal = opEncontrada.precio || pagoFinal;
        prendaIdFinal = itemEncontrado.prendaId || prendaIdFinal;

        // Validar que no se exceda la cantidad del pedido
        const tallaNorm = (talla !== undefined && talla !== null) ? String(talla).trim() : null;

        // Sumar piezas ya hechas para esta operación (y talla si aplica)
        const piezasYaHechas = registros
          .filter(r =>
            r.pedidoId === Number(pedidoId) &&
            r.operacionId === opIdFinal &&
            (tallaNorm ? (String(r.talla || '').trim() === tallaNorm) : true)
          )
          .reduce((sum, r) => sum + r.cantidad, 0);

        // Límite: por talla si el pedido lo trae, si no, por cantidad total del item
        let limite = Number(itemEncontrado.cantidad) || 0;
        if (tallaNorm && Array.isArray(itemEncontrado.tallas) && itemEncontrado.tallas.length > 0) {
          const tObj = itemEncontrado.tallas.find(t => String(t.talla || '').trim() === tallaNorm);
          if (tObj) limite = Number(tObj.cantidad) || 0;
        }

        const cantidadDisponible = Math.max(0, limite - piezasYaHechas);

        if (cant > cantidadDisponible) {
          return res.status(400).json({
            error: `Solo faltan ${cantidadDisponible} piezas por hacer en esta operación (ya se hicieron ${piezasYaHechas} de ${itemEncontrado.cantidad}).`
          });
        }
      }
    }
  }

  // Validar que tenga maquina y descripcion (por si no viene de operación)
  if (!maqFinal || !descFinal) {
    return res.status(400).json({ error: "Se requiere maquina y descripcion." });
  }

  const nuevo = {
    id: registroIdCounter++,
    operariaId: Number(operariaId),
    pedidoId: Number(pedidoId),
    prendaId: prendaIdFinal,
    operacionId: opIdFinal,
    talla: (talla !== undefined && talla !== null && String(talla).trim() !== '') ? String(talla).trim() : null,
    maquina: maqFinal,
    descripcion: descFinal,
    cantidad: cant,
    pagoPorPieza: pagoFinal,
    totalGanado: cant * pagoFinal,
    fecha: new Date().toISOString(),
    fuente: fuente || "operaria",
    estadoPago: "pendiente",
    semanaPago: null,
    fechaPago: null
  };

  registros.push(nuevo);
  guardarDatos();
  
  res.status(201).json({ 
    mensaje: "Registro guardado correctamente.",
    ok: true, 
    registro: nuevo 
  });
});

/**
 * PUT /api/registros/:id
 * Actualiza un registro de producción existente
 */
app.put("/api/registros/:id", (req, res) => {
  const id = Number(req.params.id);
  const registro = registros.find(r => r.id === id);
  
  if (!registro) {
    return res.status(404).json({ error: "Registro no encontrado." });
  }

  const { 
    pedidoId,
    prendaId,
    talla,
    maquina, 
    descripcion, 
    cantidad, 
    pagoPorPieza,
    totalGanado
  } = req.body;

  // Actualizar campos si se proporcionan
  if (pedidoId !== undefined) {
    registro.pedidoId = Number(pedidoId);
  }
  if (prendaId !== undefined) {
    registro.prendaId = prendaId ? Number(prendaId) : null;
  }
  if (maquina !== undefined) {
    registro.maquina = maquina;
  }
  if (descripcion !== undefined) {
    registro.descripcion = descripcion;
  }
  if (cantidad !== undefined) {
    registro.cantidad = Number(cantidad);
  }
  if (pagoPorPieza !== undefined) {
    registro.pagoPorPieza = Number(pagoPorPieza);
  }
  
  // Recalcular total si se proporcionó o si cambió cantidad/precio
  if (totalGanado !== undefined) {
    registro.totalGanado = Number(totalGanado);
  } else {
    registro.totalGanado = registro.cantidad * registro.pagoPorPieza;
  }

  guardarDatos();
  
  res.json({ 
    mensaje: "Registro actualizado correctamente.",
    ok: true, 
    registro 
  });
});

/**
 * DELETE /api/registros/:id
 * Elimina un registro de producción
 */
app.delete("/api/registros/:id", (req, res) => {
  const id = Number(req.params.id);
  const registro = registros.find(r => r.id === id);
  
  if (!registro) {
    return res.status(404).json({ error: "Registro no encontrado." });
  }

  registros = registros.filter(r => r.id !== id);
  guardarDatos();
  
  res.json({ 
    mensaje: "Registro eliminado correctamente.",
    ok: true 
  });
});

/**
 * POST /api/registros/marcar-semana-pagada
 * Marca todos los registros de una semana como pagados
 * Body: { fecha: "YYYY-MM-DD" } (cualquier día de la semana)
 */
app.post("/api/registros/marcar-semana-pagada", (req, res) => {
  const { fecha, fuente } = req.body;
  
  if (!fecha) {
    return res.status(400).json({ error: "Fecha requerida" });
  }

  // Calcular inicio y fin de semana
  const base = new Date(fecha + "T00:00:00");
  const day = base.getDay();
  const offset = (day === 0 ? -6 : 1 - day);
  
  const inicio = new Date(base);
  inicio.setDate(base.getDate() + offset);
  
  const fin = new Date(inicio);
  fin.setDate(inicio.getDate() + 5);
  
  const inicioStr = formatYMDLocal(inicio);
  const finStr = formatYMDLocal(fin);
  
  // Calcular número de semana (formato: 2024-W03)
  const anio = inicio.getFullYear();
  const primerDia = new Date(anio, 0, 1);
  const dias = Math.floor((inicio - primerDia) / (24 * 60 * 60 * 1000));
  const numeroSemana = Math.ceil((dias + primerDia.getDay() + 1) / 7);
  const semanaPago = `${anio}-W${numeroSemana.toString().padStart(2, '0')}`;
  
  const fechaPago = new Date().toISOString();
  
  // Filtrar registros de esa semana (pendientes)
  const fuenteFiltro = fuente || "operaria";
  
  let registrosAfectados = 0;
  registros.forEach(r => {
    // Convertir fecha UTC a local para comparar
    const fechaUTC = new Date(r.fecha);
    const year = fechaUTC.getFullYear();
    const month = String(fechaUTC.getMonth() + 1).padStart(2, '0');
    const day = String(fechaUTC.getDate()).padStart(2, '0');
    const fechaReg = `${year}-${month}-${day}`;
    
    if (fechaReg >= inicioStr && 
        fechaReg <= finStr && 
        (r.estadoPago || "pendiente") === "pendiente" &&
        (r.fuente || "operaria") === fuenteFiltro) {
      r.estadoPago = "pagado";
      r.semanaPago = semanaPago;
      r.fechaPago = fechaPago;
      registrosAfectados++;
    }
  });
  
  guardarDatos();
  
  res.json({
    mensaje: `Semana marcada como pagada (${semanaPago})`,
    ok: true,
    registrosAfectados,
    semana: {
      inicio: inicioStr,
      fin: finStr,
      semanaPago,
      fuente: fuenteFiltro
    }
  });
});

// =========================
// REPORTES Y ESTADÍSTICAS
// =========================

/**
 * GET /api/reporte-semanal
 * Genera reporte semanal de producción
 * Query params:
 * - fecha: fecha de referencia (YYYY-MM-DD)
 * - fuente: operaria o encargada
 * - estadoPago: "pendiente" | "pagado" | "todos" (default: "pendiente")
 */
/**
 * GET /api/reporte-semanal
 * Genera reporte semanal de producción (RESUMEN POR OPERARIA)
 * Query params:
 * - semana: "YYYY-WNN" (preferido, viene del frontend)
 * - fecha: "YYYY-MM-DD" (alternativa)
 * - fuente: "operaria" | "encargada" | "todos"
 * - estadoPago / estado: "pendiente" | "pagado" | "todos"
 * - operariaId: filtrar una operaria (admin)
 *
 * RESPUESTA: Array<{operariaId,nombre,piezas,ganado,registros}>
 */
app.get("/api/reporte-semanal", (req, res) => {
  let { fecha, semana, fuente, estadoPago, estado, operariaId } = req.query;

  if (!estadoPago && estado) estadoPago = estado;
  const estadoFiltro = estadoPago || "pendiente";
  const fuenteFiltro = fuente || "operaria"; // operaria | encargada | todos
  const opId = operariaId ? Number(operariaId) : null;

  // Resolver inicio/fin de semana usando la MISMA lógica que /api/semanas (SÁBADO -> VIERNES)
  let inicioStr, finStr;

  try {
    
if (semana) {
      const info = resolverSemanaPorCodigo(String(semana));
      if (!info) return res.status(400).json({ error: "Semana inválida" });
      inicioStr = info.inicio;
      finStr = info.fin;
    } else if (fecha) {
      const info = obtenerSemanaLaboral(fecha);
      inicioStr = info.inicio;
      finStr = info.fin;
    } else {
      return res.status(400).json({ error: "Semana o fecha requerida" });
    }
  } catch (e) {
    return res.status(400).json({ error: "Semana o fecha inválida" });
  }

  const resumen = {};

  registros.forEach(r => {
    // Convertir fecha UTC a local para comparar
    const fechaUTC = new Date(r.fecha);
    const year = fechaUTC.getFullYear();
    const month = String(fechaUTC.getMonth() + 1).padStart(2, '0');
    const day = String(fechaUTC.getDate()).padStart(2, '0');
    const f = `${year}-${month}-${day}`;
    
    if (f < inicioStr || f > finStr) return;

    const rEstado = (r.estadoPago || "pendiente");
    if (estadoFiltro !== "todos" && rEstado !== estadoFiltro) return;

    const rFuente = (r.fuente || "operaria");
    if (fuenteFiltro !== "todos" && rFuente !== fuenteFiltro) return;

    if (opId && r.operariaId !== opId) return;

    if (!resumen[r.operariaId]) {
      const op = operarias.find(o => o.id === r.operariaId);
      resumen[r.operariaId] = {
        operariaId: r.operariaId,
        nombre: op ? op.nombre : (r.operariaNombre || "N/A"),
        piezas: 0,
        ganado: 0,
        registros: 0
      };
    }

    resumen[r.operariaId].piezas += Number(r.cantidad || 0);
    resumen[r.operariaId].ganado += Number(r.totalGanado || 0);
    resumen[r.operariaId].registros += 1;
  });

  return res.json(Object.values(resumen)); // SIEMPRE ARRAY
});

/**
 * GET /api/estadisticas/general
 * Estadísticas generales del sistema
 */
app.get("/api/estadisticas/general", (req, res) => {
  const totalOperarias = operarias.length;
  const operariasActivas = operarias.filter(o => o.activa).length;
  const totalPedidos = pedidos.length;
  const pedidosActivos = pedidos.filter(p => (p.estado || "activo") === "activo").length;
  
  // Solo registros pendientes para estadísticas activas
  const registrosPendientes = registros.filter(r => (r.estadoPago || "pendiente") === "pendiente");
  const totalRegistros = registrosPendientes.length;
  const totalPiezas = registrosPendientes.reduce((sum, r) => sum + r.cantidad, 0);
  const totalGanado = registrosPendientes.reduce((sum, r) => sum + r.totalGanado, 0);

  res.json({
    operarias: {
      total: totalOperarias,
      activas: operariasActivas,
      inactivas: totalOperarias - operariasActivas
    },
    pedidos: {
      total: totalPedidos,
      activos: pedidosActivos,
      terminados: totalPedidos - pedidosActivos
    },
    produccionPendiente: {
      registros: totalRegistros,
      piezasTotales: totalPiezas,
      totalGanado: totalGanado
    },
    produccionTotal: {
      registros: registros.length,
      piezasTotales: registros.reduce((sum, r) => sum + r.cantidad, 0),
      totalGanado: registros.reduce((sum, r) => sum + r.totalGanado, 0)
    }
  });
});

/**
 * GET /api/estadisticas/comparacion-fuentes
 * Comparación entre registros de operarias vs encargada
 */
app.get("/api/estadisticas/comparacion-fuentes", (req, res) => {
  const { estadoPago } = req.query;
  const estadoFiltro = estadoPago || "pendiente";
  
  // Filtrar por estado
  const regsFiltrados = estadoFiltro === "todos" 
    ? registros 
    : registros.filter(r => (r.estadoPago || "pendiente") === estadoFiltro);
  
  const regsOperarias = regsFiltrados.filter(r => (r.fuente || "operaria") === "operaria");
  const regsEncargada = regsFiltrados.filter(r => r.fuente === "encargada");
  
  const operarias = {
    registros: regsOperarias.length,
    piezas: regsOperarias.reduce((sum, r) => sum + r.cantidad, 0),
    ganado: regsOperarias.reduce((sum, r) => sum + r.totalGanado, 0)
  };
  
  const encargada = {
    registros: regsEncargada.length,
    piezas: regsEncargada.reduce((sum, r) => sum + r.cantidad, 0),
    ganado: regsEncargada.reduce((sum, r) => sum + r.totalGanado, 0)
  };
  
  res.json({
    estadoPago: estadoFiltro,
    operarias,
    encargada,
    diferencia: {
      registros: operarias.registros - encargada.registros,
      piezas: operarias.piezas - encargada.piezas,
      ganado: operarias.ganado - encargada.ganado
    }
  });
});

// =========================
// CONFIGURACIÓN DEL SISTEMA
// =========================

/**
 * POST /api/configuracion/cambiar-password
 * Cambia la contraseña de admin o encargada
 */
app.post("/api/configuracion/cambiar-password", (req, res) => {
  const { tipo, passwordActual, passwordNueva } = req.body;
  
  if (!tipo || !passwordActual || !passwordNueva) {
    return res.status(400).json({ error: "Datos incompletos" });
  }
  
  // Por seguridad, esto requeriría variables de entorno
  // Por ahora retornamos mensaje informativo
  res.json({
    mensaje: "Para cambiar contraseñas de admin/encargada, edita las constantes getAdminPassword() y getEncargadaPassword() en el archivo del servidor.",
    ok: false
  });
});

/**
 * POST /api/configuracion/backup
 * Crea un backup manual de los datos
 */
app.post("/api/configuracion/backup", (req, res) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(__dirname, `datos_taller_backup_${timestamp}.json`);
    
    fs.copyFileSync(DATA_FILE, backupFile);
    
    res.json({
      mensaje: "Backup creado correctamente",
      ok: true,
      archivo: `datos_taller_backup_${timestamp}.json`
    });
  } catch (err) {
    res.status(500).json({
      error: "Error creando backup: " + err.message,
      ok: false
    });
  }
});

// ============================================
// ENDPOINTS PARA CAMBIAR CREDENCIALES
// ============================================

/**
 * PUT /api/usuarios/admin
 * Actualiza las credenciales del admin
 */
app.put("/api/usuarios/admin", (req, res) => {
  const { nombre, password } = req.body;
  
  if (!nombre && !password) {
    return res.status(400).json({ error: "Debes proporcionar al menos un campo para actualizar" });
  }

  // Buscar el admin en usuarios
  const admin = usuarios.find(u => u.tipo === "admin");
  
  if (!admin) {
    return res.status(404).json({ error: "Usuario admin no encontrado" });
  }

  // Actualizar campos
  if (nombre) {
    admin.nombre = nombre;
  }
  if (password) {
    admin.password = password;
  }

  guardarDatos();

  res.json({
    ok: true,
    mensaje: "Credenciales de admin actualizadas correctamente",
    usuario: {
      id: admin.id,
      nombre: admin.nombre,
      tipo: admin.tipo
    }
  });
});

/**
 * PUT /api/usuarios/encargada
 * Actualiza las credenciales de la encargada
 */
app.put("/api/usuarios/encargada", (req, res) => {
  const { nombre, password } = req.body;
  
  if (!nombre && !password) {
    return res.status(400).json({ error: "Debes proporcionar al menos un campo para actualizar" });
  }

  // Buscar la encargada en usuarios
  const encargada = usuarios.find(u => u.tipo === "encargada");
  
  if (!encargada) {
    return res.status(404).json({ error: "Usuario encargada no encontrado" });
  }

  // Actualizar campos
  if (nombre) {
    encargada.nombre = nombre;
  }
  if (password) {
    encargada.password = password;
  }

  guardarDatos();

  res.json({
    ok: true,
    mensaje: "Credenciales de encargada actualizadas correctamente",
    usuario: {
      id: encargada.id,
      nombre: encargada.nombre,
      tipo: encargada.tipo
    }
  });
});

// ============================================
// ENDPOINTS DE PRENDAS
// ============================================

/**
 * GET /api/prendas
 * Obtener todas las prendas
 */
app.get("/api/prendas", (req, res) => {
  res.json(prendas);
});

/**
 * POST /api/prendas
 * Agregar nueva prenda
 */
app.post("/api/prendas", (req, res) => {
  const { nombre } = req.body;
  
  if (!nombre || nombre.trim() === "") {
    return res.status(400).json({ error: "El nombre de la prenda es requerido" });
  }

  // Verificar si ya existe
  const existe = prendas.find(p => p.nombre.toLowerCase() === nombre.trim().toLowerCase());
  if (existe) {
    return res.status(400).json({ error: "Esta prenda ya existe" });
  }

  const nuevaPrenda = {
    id: prendas.length > 0 ? Math.max(...prendas.map(p => p.id)) + 1 : 1,
    nombre: nombre.trim()
  };

  prendas.push(nuevaPrenda);
  guardarDatos();

  res.json(nuevaPrenda);
});

/**
 * DELETE /api/prendas/:id
 * Eliminar prenda
 */
app.delete("/api/prendas/:id", (req, res) => {
  const id = parseInt(req.params.id);
  const index = prendas.findIndex(p => p.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Prenda no encontrada" });
  }

  prendas.splice(index, 1);
  guardarDatos();

  res.json({ ok: true, mensaje: "Prenda eliminada" });
});

// =========================
// COSTURAS: CATÁLOGO
// =========================

/**
 * GET /api/costuras
 * Lista el catálogo de costuras (nombres únicos)
 */
app.get("/api/costuras", (req, res) => {
  res.json(costuras);
});

/**
 * POST /api/costuras
 * Agrega una costura al catálogo
 */
app.post("/api/costuras", (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre de la costura es requerido." });
  }
  const existe = costuras.find(c => c.nombre.toLowerCase() === nombre.trim().toLowerCase());
  if (existe) {
    return res.status(400).json({ error: "Esta costura ya existe en el catálogo." });
  }
  const nueva = { id: costuraIdCounter++, nombre: nombre.trim() };
  costuras.push(nueva);
  guardarDatos();
  res.status(201).json({ ok: true, costura: nueva });
});

/**
 * PUT /api/costuras/:id
 * Edita el nombre de una costura
 */
app.put("/api/costuras/:id", (req, res) => {
  const id = Number(req.params.id);
  const costura = costuras.find(c => c.id === id);
  if (!costura) return res.status(404).json({ error: "Costura no encontrada." });

  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.status(400).json({ error: "El nombre es requerido." });
  }
  costura.nombre = nombre.trim();
  guardarDatos();
  res.json({ ok: true, costura });
});

/**
 * DELETE /api/costuras/:id
 * Elimina una costura del catálogo
 */
app.delete("/api/costuras/:id", (req, res) => {
  const id = Number(req.params.id);
  const index = costuras.findIndex(c => c.id === id);
  if (index === -1) return res.status(404).json({ error: "Costura no encontrada." });
  costuras.splice(index, 1);
  guardarDatos();
  res.json({ ok: true, mensaje: "Costura eliminada del catálogo." });
});

// =========================
// PLANTILLAS DE COSTURAS POR PRENDA
// =========================

/**
 * GET /api/plantillas-costuras/:prendaId
 * Obtiene las costuras default de una prenda (template para pedidos)
 */
app.get("/api/plantillas-costuras/:prendaId", (req, res) => {
  const prendaId = Number(req.params.prendaId);
  const plantilla = plantillasCosturas[prendaId] || [];
  const prenda = prendas.find(p => p.id === prendaId);
  res.json({
    prendaId,
    prenda: prenda ? prenda.nombre : "Desconocida",
    operaciones: plantilla
  });
});

/**
 * GET /api/plantillas-costuras
 * Obtiene todas las plantillas
 */
app.get("/api/plantillas-costuras", (req, res) => {
  const resultado = {};
  for (const [prendaId, ops] of Object.entries(plantillasCosturas)) {
    const prenda = prendas.find(p => p.id === Number(prendaId));
    resultado[prendaId] = {
      prenda: prenda ? prenda.nombre : "Desconocida",
      operaciones: ops
    };
  }
  res.json(resultado);
});

/**
 * PUT /api/plantillas-costuras/:prendaId
 * Actualiza la plantilla completa de una prenda
 * Body: { operaciones: [{ costura: "nombre", maquina: "tipo" }, ...] }
 */
app.put("/api/plantillas-costuras/:prendaId", (req, res) => {
  const prendaId = Number(req.params.prendaId);
  const { operaciones } = req.body;
  if (!Array.isArray(operaciones)) {
    return res.status(400).json({ error: "Se requiere un array de operaciones." });
  }
  plantillasCosturas[prendaId] = operaciones.map(op => ({
    costura: (op.costura || "").trim(),
    maquina: (op.maquina || "").trim()
  })).filter(op => op.costura && op.maquina);

  // Agregar costuras nuevas al catálogo
  plantillasCosturas[prendaId].forEach(op => {
    const existe = costuras.find(c => c.nombre.toLowerCase() === op.costura.toLowerCase());
    if (!existe) {
      costuras.push({ id: costuraIdCounter++, nombre: op.costura });
    }
  });

  guardarDatos();
  res.json({ ok: true, plantilla: plantillasCosturas[prendaId] });
});

/**
 * POST /api/plantillas-costuras/:prendaId/agregar
 * Agrega una operación a la plantilla de una prenda
 * Body: { costura: "nombre", maquina: "tipo" }
 */
app.post("/api/plantillas-costuras/:prendaId/agregar", (req, res) => {
  const prendaId = Number(req.params.prendaId);
  const { costura, maquina } = req.body;
  if (!costura || !maquina) {
    return res.status(400).json({ error: "Se requiere costura y maquina." });
  }
  if (!plantillasCosturas[prendaId]) plantillasCosturas[prendaId] = [];
  plantillasCosturas[prendaId].push({ costura: costura.trim(), maquina: maquina.trim() });

  // Agregar al catálogo si no existe
  const existe = costuras.find(c => c.nombre.toLowerCase() === costura.trim().toLowerCase());
  if (!existe) {
    costuras.push({ id: costuraIdCounter++, nombre: costura.trim() });
  }

  guardarDatos();
  res.json({ ok: true, plantilla: plantillasCosturas[prendaId] });
});

// =========================
// AVANCE Y OPERACIONES DE PEDIDO
// =========================

/**
 * GET /api/pedidos/:id/avance
 * Avance detallado por prenda y operación
 */
app.get("/api/pedidos/:id/avance", (req, res) => {
  const id = Number(req.params.id);
  const pedido = pedidos.find(p => p.id === id);
  if (!pedido) return res.status(404).json({ error: "Pedido no encontrado." });
  if (!pedido.items || pedido.items.length === 0) {
    return res.json({ pedidoId: id, avance: [], mensaje: "Pedido sin items detallados." });
  }

  const regsPedido = registros.filter(r => r.pedidoId === id && (r.fuente || "operaria") !== "encargada");

  const avance = pedido.items.map(item => {
    const prenda = prendas.find(p => p.id === item.prendaId);
    const operaciones = (item.operaciones || []).map(op => {
      const regsOp = regsPedido.filter(r => r.operacionId === op.opId);
      const piezasHechas = regsOp.reduce((sum, r) => sum + r.cantidad, 0);
      const costoAvance = regsOp.reduce((sum, r) => sum + r.totalGanado, 0);

      // Desglose por operaria
      const porOperaria = {};
      regsOp.forEach(r => {
        if (!porOperaria[r.operariaId]) porOperaria[r.operariaId] = 0;
        porOperaria[r.operariaId] += r.cantidad;
      });
      const desglose = Object.entries(porOperaria).map(([opId, cant]) => {
        const operaria = operarias.find(o => o.id === Number(opId));
        return { operaria: operaria ? operaria.nombre : "Desconocida", cantidad: cant };
      });

      return {
        opId: op.opId,
        costura: op.costura || op.descripcion,
        maquina: op.maquina,
        precio: op.precio,
        cantidadTotal: item.cantidad,
        piezasHechas,
        piezasFaltantes: Math.max(0, item.cantidad - piezasHechas),
        porcentaje: item.cantidad > 0 ? Math.round((piezasHechas / item.cantidad) * 100) : 0,
        costoEstimado: op.precio * item.cantidad,
        costoAvance,
        desglose
      };
    });

    const totalOps = operaciones.length;
    const opsCompletas = operaciones.filter(o => o.porcentaje >= 100).length;

    return {
      prendaId: item.prendaId,
      prenda: prenda ? prenda.nombre : "Desconocida",
      cantidad: item.cantidad,
      operaciones,
      totalOperaciones: totalOps,
      operacionesCompletas: opsCompletas,
      porcentajeGeneral: totalOps > 0 ? Math.round(operaciones.reduce((s, o) => s + o.porcentaje, 0) / totalOps) : 0
    };
  });

  const costoEstimadoTotal = avance.reduce((s, a) => s + a.operaciones.reduce((s2, o) => s2 + o.costoEstimado, 0), 0);
  const costoAvanceTotal = avance.reduce((s, a) => s + a.operaciones.reduce((s2, o) => s2 + o.costoAvance, 0), 0);

  res.json({
    pedidoId: id,
    escuela: pedido.escuela,
    folio: pedido.folio,
    costoEstimadoTotal,
    costoAvanceTotal,
    avance
  });
});

/**
 * GET /api/pedidos/:id/operaciones
 * Operaciones disponibles para registrar (con cantidadFaltante)
 * Query: ?prendaId=X para filtrar por prenda
 */
app.get("/api/pedidos/:id/operaciones", (req, res) => {
  const id = Number(req.params.id);
  const pedido = pedidos.find(p => p.id === id);
  if (!pedido) return res.status(404).json({ error: "Pedido no encontrado." });
  if (!pedido.items || pedido.items.length === 0) {
    return res.json([]);
  }

  const prendaIdFiltro = req.query.prendaId ? Number(req.query.prendaId) : null;
  const tallaFiltro = (req.query.talla !== undefined && req.query.talla !== null && String(req.query.talla).trim() !== '') ? String(req.query.talla).trim() : null;
  const regsPedido = registros.filter(r => r.pedidoId === id);

  const resultado = [];
  pedido.items.forEach(item => {
    if (prendaIdFiltro && item.prendaId !== prendaIdFiltro) return;
    const prenda = prendas.find(p => p.id === item.prendaId);

    (item.operaciones || []).forEach(op => {
      const piezasHechas = regsPedido
        .filter(r =>
          r.operacionId === op.opId &&
          (tallaFiltro ? (String(r.talla || '').trim() === tallaFiltro) : true)
        )
        .reduce((sum, r) => sum + r.cantidad, 0);

      // Límite por talla si aplica
      let limite = Number(item.cantidad) || 0;
      if (tallaFiltro && Array.isArray(item.tallas) && item.tallas.length > 0) {
        const tObj = item.tallas.find(t => String(t.talla || '').trim() === tallaFiltro);
        if (tObj) limite = Number(tObj.cantidad) || 0;
      }

      const cantidadFaltante = Math.max(0, limite - piezasHechas);

      resultado.push({
        prendaId: item.prendaId,
        prenda: prenda ? prenda.nombre : "Desconocida",
        cantidadPedido: item.cantidad,
        talla: tallaFiltro,
        opId: op.opId,
        costura: op.costura || op.descripcion,
        maquina: op.maquina,
        precio: op.precio,
        piezasHechas,
        cantidadFaltante
      });
    });
  });

  res.json(resultado);
});

// ============================================
// FUNCIONES HELPER PARA SEMANAS (SÁBADO-VIERNES)
// ============================================

/**
 * Calcula la semana laboral (Sábado a Viernes) para una fecha dada
 */
// =========================
// FECHAS (LOCAL / SIN DESFASE UTC)
// =========================
function parseFechaLocal(input) {
  if (input instanceof Date) return new Date(input);
  const s = String(input || "");
  // Si viene como "YYYY-MM-DD" (sin hora), lo interpretamos como fecha LOCAL
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
    return new Date(y, mo, d, 0, 0, 0, 0);
  }
  // Si viene como ISO con T o cualquier otro formato, usamos Date normal
  const dt = new Date(s);
  return dt;
}

function formatYMDLocal(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function obtenerSemanaLaboral(fecha) {
  const date = parseFechaLocal(fecha);
  const day = date.getDay(); // 0=Dom, 6=Sáb

  // Semana laboral: SÁBADO -> VIERNES
  let diasDesdeInicio;
  if (day === 6) {
    diasDesdeInicio = 0;      // sábado
  } else if (day === 0) {
    diasDesdeInicio = 1;      // domingo => sábado fue ayer
  } else {
    diasDesdeInicio = day + 1; // lun(1)->2, vie(5)->6
  }

  const inicioSemana = new Date(date);
  inicioSemana.setDate(date.getDate() - diasDesdeInicio);
  inicioSemana.setHours(0, 0, 0, 0);

  const finSemana = new Date(inicioSemana);
  finSemana.setDate(inicioSemana.getDate() + 6); // +6 = viernes
  finSemana.setHours(23, 59, 59, 999);

  const year = inicioSemana.getFullYear();
  const weekNum = obtenerNumeroSemana(inicioSemana);

  return {
    codigo: `${year}-W${String(weekNum).padStart(2, "0")}`,
    inicio: formatYMDLocal(inicioSemana),
    fin: formatYMDLocal(finSemana),
    inicioDate: inicioSemana,
    finDate: finSemana
  };
}

/**
 * Dado un código de semana "YYYY-WNN", regresa {codigo,inicio,fin} usando la MISMA lógica de obtenerSemanaLaboral.
 * Esto evita desfases cuando se reconstruye la semana solo por número.
 */
function resolverSemanaPorCodigo(codigo) {
  if (!codigo || !/^[0-9]{4}-W[0-9]{2}$/.test(codigo)) return null;
  const year = Number(codigo.slice(0, 4));

  // Rango de búsqueda: todo el año
  const inicioBusqueda = new Date(year, 0, 1);
  const finBusqueda = new Date(year, 11, 31);

  for (let d = new Date(inicioBusqueda); d <= finBusqueda; d.setDate(d.getDate() + 1)) {
    const info = obtenerSemanaLaboral(d);
    if (info.codigo === codigo) return info;
  }
  return null;
}

function obtenerNumeroSemana(date) {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * Obtiene todas las semanas con registros
 */
function obtenerSemanasConRegistros(estadoPago = 'pendiente') {
  const semanas = {};
  
  let registrosFiltrados = registros;
  if (estadoPago !== 'todos') {
    registrosFiltrados = registros.filter(r => (r.estadoPago || 'pendiente') === estadoPago);
  }
  
  // FILTRAR: Solo registros de operarias (excluir encargada del total)
  registrosFiltrados = registrosFiltrados.filter(r => (r.fuente || 'operaria') !== 'encargada');
  
  registrosFiltrados.forEach(reg => {
    const semana = obtenerSemanaLaboral(reg.fecha);
    
    if (!semanas[semana.codigo]) {
      semanas[semana.codigo] = {
        codigo: semana.codigo,
        inicio: semana.inicio,
        fin: semana.fin,
        registros: 0,
        totalPagar: 0
      };
    }
    
    semanas[semana.codigo].registros++;
    semanas[semana.codigo].totalPagar += reg.totalGanado;
  });
  
  return Object.values(semanas).sort((a, b) => b.codigo.localeCompare(a.codigo));
}

// ============================================
// ENDPOINTS DE CORTE SEMANAL
// ============================================

/**
 * GET /api/semanas
 * Obtiene las semanas con registros
 */
app.get("/api/semanas", (req, res) => {
  const { estado } = req.query;
  const semanas = obtenerSemanasConRegistros(estado || 'pendiente');
  res.json(semanas);
});

/**
 * GET /api/reporte-semanal/detalle
 * Obtiene el detalle completo de una operaria en una semana
 */
app.get("/api/reporte-semanal/detalle", (req, res) => {
  const { semana, operariaId, estadoPago, fuente } = req.query;
  
  // Validar parámetros requeridos con mensajes específicos
  if (!semana) {
    return res.status(400).json({ error: "Falta el parámetro 'semana'" });
  }
  
  if (!operariaId) {
    return res.status(400).json({ error: "Falta el parámetro 'operariaId'" });
  }
  
  const opId = Number(operariaId);
  if (isNaN(opId)) {
    return res.status(400).json({ error: "El parámetro 'operariaId' debe ser un número" });
  }
  
  const operaria = operarias.find(o => o.id === opId);
  
  if (!operaria) {
    return res.status(404).json({ error: "Operaria no encontrada" });
  }
  
  // Parsear código de semana (misma lógica que /api/semanas)
  const semanaInfo = resolverSemanaPorCodigo(String(semana));
  if (!semanaInfo) {
    return res.status(400).json({ 
      error: `Código de semana inválido: "${semana}". Formato esperado: YYYY-WNN (ej: 2025-W50)` 
    });
  }
  
  // Filtrar registros de la operaria en esa semana
  const registrosSemana = registros.filter(r => {
    // Convertir fecha UTC a fecha local para comparar correctamente
    const fechaUTC = new Date(r.fecha);
    const year = fechaUTC.getFullYear();
    const month = String(fechaUTC.getMonth() + 1).padStart(2, '0');
    const day = String(fechaUTC.getDate()).padStart(2, '0');
    const f = `${year}-${month}-${day}`;
    
    const estadoMatch = estadoPago ? (r.estadoPago || 'pendiente') === estadoPago : true;
    
    // SIEMPRE excluir registros de encargada (solo mostrar operaria)
    const fuenteMatch = (r.fuente || 'operaria') !== 'encargada';

    return r.operariaId === opId &&
           f >= semanaInfo.inicio &&
           f <= semanaInfo.fin &&
           estadoMatch &&
           fuenteMatch;
  });
  
  // Extraer el número de semana del código (ej: "2025-W50" -> "W50")
  const weekStr = String(semana).includes('-W') ? String(semana).split('-W')[1] : semana;
  
  // Agrupar por día
  const registrosPorDia = {};
  const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  
  registrosSemana.forEach(reg => {
    // Convertir fecha UTC a fecha local antes de extraer el día
    const fechaUTC = new Date(reg.fecha);
    // Obtener fecha en formato local (YYYY-MM-DD)
    const year = fechaUTC.getFullYear();
    const month = String(fechaUTC.getMonth() + 1).padStart(2, '0');
    const day = String(fechaUTC.getDate()).padStart(2, '0');
    const fecha = `${year}-${month}-${day}`;
    
    if (!registrosPorDia[fecha]) {
      const d = parseFechaLocal(fecha); // Usar parseFechaLocal para evitar problemas de zona horaria
      registrosPorDia[fecha] = {
        fecha,
        dia: diasSemana[d.getDay()],
        registros: [],
        subtotal: 0
      };
    }
    
    const pedido = pedidos.find(p => p.id === reg.pedidoId);
    const prenda = prendas.find(p => p.id === reg.prendaId);
    
    registrosPorDia[fecha].registros.push({
      id: reg.id,
      escuela: pedido ? pedido.escuela : 'N/A',
      prenda: prenda ? prenda.nombre : 'N/A',
      descripcion: reg.descripcion,
      cantidad: reg.cantidad,
      maquina: reg.maquina,
      pagoPorPieza: reg.pagoPorPieza || 0,
      totalGanado: reg.totalGanado || (reg.cantidad * (reg.pagoPorPieza || 0))
    });
    
    registrosPorDia[fecha].subtotal += reg.totalGanado;
  });
  
  // Convertir a array y ordenar por fecha
  const registrosPorDiaArray = Object.values(registrosPorDia).sort((a, b) => 
    a.fecha.localeCompare(b.fecha)
  );
  
  // Calcular resumen
  const totalPiezas = registrosSemana.reduce((sum, r) => sum + r.cantidad, 0);
  const totalPagar = registrosSemana.reduce((sum, r) => sum + r.totalGanado, 0);
  const diasTrabajados = Object.keys(registrosPorDia).length;
  
  res.json({
    operaria: {
      id: operaria.id,
      nombre: operaria.nombre
    },
    semana: {
      codigo: semana,
      inicio: semanaInfo.inicio,
      fin: semanaInfo.fin,
      label: `Semana ${weekStr} (${formatearFechaCorta(semanaInfo.inicio)} - ${formatearFechaCorta(semanaInfo.fin)})`
    },
    fechaPago: formatYMDLocal(new Date()),
    registrosPorDia: registrosPorDiaArray,
    resumen: {
      totalPiezas,
      totalRegistros: registrosSemana.length,
      diasTrabajados,
      totalPagar
    }
  });
});

/**
 * GET /api/reporte-semanal
 * Obtiene el resumen de todas las operarias en una semana
 */
app.get("/api/reporte-semanal", (req, res) => {
  const { semana, estado, operariaId, fuente } = req.query;
  
  if (!semana) {
    return res.status(400).json({ error: "Código de semana es requerido" });
  }
  
  // Parsear código de semana (misma lógica que /api/semanas)
  const semanaInfo = resolverSemanaPorCodigo(String(semana));
  if (!semanaInfo) {
    return res.status(400).json({ error: "Código de semana inválido" });
  }
  
  // Filtrar registros de esa semana
  const registrosSemana = registros.filter(r => {
    const fechaReg = new Date(r.fecha);
    const enSemana = fechaReg >= new Date(semanaInfo.inicio) && 
                     fechaReg <= new Date(semanaInfo.fin + 'T23:59:59');
    const estadoMatch = estado ? (r.estadoPago || 'pendiente') === estado : true;
    
    // Filtro de operaria
    const operariaMatch = operariaId ? r.operariaId === Number(operariaId) : true;
    
    // Filtro de fuente (base de datos)
    const fuenteMatch = fuente ? (r.fuente || 'operaria') === fuente : true;
    
    return enSemana && estadoMatch && operariaMatch && fuenteMatch;
  });
  
  // Agrupar por operaria
  const porOperaria = {};
  
  registrosSemana.forEach(reg => {
    if (!porOperaria[reg.operariaId]) {
      const operaria = operarias.find(o => o.id === reg.operariaId);
      porOperaria[reg.operariaId] = {
        operariaId: reg.operariaId,
        nombre: operaria ? operaria.nombre : 'N/A',
        piezas: 0,
        ganado: 0,
        registros: 0
      };
    }
    
    porOperaria[reg.operariaId].piezas += reg.cantidad;
    porOperaria[reg.operariaId].ganado += reg.totalGanado;
    porOperaria[reg.operariaId].registros++;
  });
  
  res.json(Object.values(porOperaria));
});

/**
 * POST /api/pagos/marcar-semana
 * Marca una semana como pagada
 */
app.post("/api/pagos/marcar-semana", (req, res) => {
  const { semanaCodigo, operariaId } = req.body;
  
  if (!semanaCodigo) {
    return res.status(400).json({ error: "Código de semana es requerido" });
  }
  
  // Parsear código de semana
  const semanaInfo = resolverSemanaPorCodigo(String(semanaCodigo));
  if (!semanaInfo) {
    return res.status(400).json({ error: "Código de semana inválido" });
  }
  
  // Filtrar registros de esa semana
  let registrosAMarcar = registros.filter(r => {
    const fechaReg = new Date(r.fecha);
    const enSemana = fechaReg >= new Date(semanaInfo.inicio) && 
                     fechaReg <= new Date(semanaInfo.fin + 'T23:59:59');
    const pendiente = (r.estadoPago || 'pendiente') === 'pendiente';
    
    if (operariaId) {
      return enSemana && pendiente && r.operariaId === Number(operariaId);
    }
    
    return enSemana && pendiente;
  });
  
  if (registrosAMarcar.length === 0) {
    return res.status(400).json({ error: "No hay registros pendientes en esta semana" });
  }
  
  // Marcar como pagados
  const fechaPago = formatYMDLocal(new Date());
  let totalPagado = 0;
  
  registrosAMarcar.forEach(reg => {
    reg.estadoPago = 'pagado';
    reg.semanaPago = semanaCodigo;
    reg.fechaPago = fechaPago;
    totalPagado += reg.totalGanado;
  });
  
  guardarDatos();
  
  res.json({
    ok: true,
    registrosActualizados: registrosAMarcar.length,
    totalPagado,
    semanaCodigo,
    fechaPago
  });
});

/**
 * Función helper para formatear fechas
 */
function formatearFechaCorta(fechaStr) {
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const fecha = new Date(fechaStr);
  return `${fecha.getDate()} ${meses[fecha.getMonth()]}`;
}

// =========================
// INICIAR SERVIDOR
// =========================

app.listen(PORT, () => {
  console.log("╔════════════════════════════════════════════════╗");
  console.log("║  🚀 Servidor V5 - Producción y Nómina        ║");
  console.log("║  📍 Puerto: " + PORT + "                              ║");
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  console.log("║  🌐 URL: " + BASE_URL + "              ║");
  console.log("║  ✅ Sistema completo con pagos y gestión     ║");
  console.log("╚════════════════════════════════════════════════╝");
});