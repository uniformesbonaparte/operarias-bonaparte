// produccion_nomina_v5_app.js
// Backend V5: Funcionalidades completas con sistema de pagos y gestión avanzada
// Puerto 8080 | Persistencia mejorada con backups automáticos
// Compatible con frontend moderno glassmorphism

// ⏰ Zona horaria: México Central — usa Intl (funciona en cualquier servidor)
const MX_TZ = 'America/Mexico_City';
const _mxFmt = new Intl.DateTimeFormat('en-CA', { timeZone: MX_TZ, year:'numeric', month:'2-digit', day:'2-digit' });
const _mxParts = new Intl.DateTimeFormat('en-US', { timeZone: MX_TZ, year:'numeric', month:'numeric', day:'numeric', weekday:'short', hour:'numeric', hour12:false });

/** "YYYY-MM-DD" en hora México para cualquier Date */
function toMexicoYMD(date) { return _mxFmt.format(date); }

/** {year, month, day, dow} en hora México (dow: 0=Dom..6=Sáb) */
function toMexicoParts(date) {
  const p = {};
  _mxParts.formatToParts(date).forEach(x => {
    if (x.type === 'year') p.year = Number(x.value);
    if (x.type === 'month') p.month = Number(x.value);
    if (x.type === 'day') p.day = Number(x.value);
    if (x.type === 'weekday') p.dow = {Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[x.value] ?? 0;
  });
  return p;
}

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

// Evitar que el navegador cachee respuestas de la API
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  next();
});

// ============================================================
// MEJORA AGREGADA — MÓDULO DE SEGURIDAD
// Puntos 1-5 del diagnóstico. Todo es ADITIVO: no se modifica
// ninguna lógica de negocio existente. Usa solo módulos nativos
// de Node (crypto), sin dependencias nuevas que instalar.
// ============================================================
const crypto = require("crypto");

// ---------- 1) Secreto para firmar las sesiones ----------
// Se prioriza la variable de entorno SESSION_SECRET (recomendado en Render).
// Si no existe, se guarda un secreto generado en disco para que las sesiones
// sobrevivan a un reinicio. Si tampoco se puede escribir, se usa uno en memoria.
const SESSION_SECRET = (() => {
  if (process.env.SESSION_SECRET) return String(process.env.SESSION_SECRET);
  try {
    const f = path.join(__dirname, ".session_secret");
    if (fs.existsSync(f)) {
      const v = fs.readFileSync(f, "utf8").trim();
      if (v) return v;
    }
    const nuevo = crypto.randomBytes(48).toString("hex");
    fs.writeFileSync(f, nuevo, "utf8");
    return nuevo;
  } catch (e) {
    console.warn("⚠️  No se pudo persistir el secreto de sesión, se usa uno temporal.");
    return crypto.randomBytes(48).toString("hex");
  }
})();

const SESION_DURACION_MS = 12 * 60 * 60 * 1000; // 12 horas
const COOKIE_SESION = "taller_sesion";

// ---------- 2) Cifrado de contraseñas (scrypt, nativo de Node) ----------
function hashPassword(plano) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(plano), salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

function esHash(valor) {
  return typeof valor === "string" && valor.startsWith("scrypt$");
}

/**
 * Verifica una contraseña. Acepta tanto hashes nuevos como contraseñas
 * antiguas en texto plano (para que nadie se quede fuera durante la
 * migración). Devuelve { ok, necesitaMigrar }.
 */
function verifyPassword(plano, almacenado) {
  if (almacenado === undefined || almacenado === null) return { ok: false, necesitaMigrar: false };
  if (!esHash(almacenado)) {
    return { ok: String(almacenado) === String(plano), necesitaMigrar: true };
  }
  try {
    const [, salt, hash] = almacenado.split("$");
    const calc = crypto.scryptSync(String(plano), salt, 64);
    const guardado = Buffer.from(hash, "hex");
    if (calc.length !== guardado.length) return { ok: false, necesitaMigrar: false };
    return { ok: crypto.timingSafeEqual(calc, guardado), necesitaMigrar: false };
  } catch (e) {
    return { ok: false, necesitaMigrar: false };
  }
}

/**
 * Convierte a hash todas las contraseñas que sigan en texto plano.
 * Se ejecuta una sola vez al arrancar, después de cargar los datos.
 */
function migrarPasswordsAHash() {
  try {
    let cambios = 0;
    if (Array.isArray(usuarios)) {
      usuarios.forEach(u => {
        if (u && u.password && !esHash(u.password)) { u.password = hashPassword(u.password); cambios++; }
      });
    }
    if (Array.isArray(operarias)) {
      operarias.forEach(o => {
        if (o && o.password && !esHash(o.password)) { o.password = hashPassword(o.password); cambios++; }
      });
    }
    if (cambios > 0) {
      guardarDatos();
      console.log(`🔐 Contraseñas cifradas por primera vez: ${cambios}`);
    } else {
      console.log("🔐 Todas las contraseñas ya estaban cifradas.");
    }
  } catch (e) {
    console.error("⚠️  No se pudieron migrar las contraseñas:", e.message || e);
  }
}

// ---------- 3) Tokens de sesión firmados ----------
function b64url(str) {
  return Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function deB64url(str) {
  return Buffer.from(String(str).replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}
function firmar(payloadB64) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payloadB64).digest("hex");
}

function crearToken({ tipo, id, nombre }) {
  const payload = { tipo, id, nombre, exp: Date.now() + SESION_DURACION_MS };
  const p = b64url(JSON.stringify(payload));
  return `${p}.${firmar(p)}`;
}

function leerToken(token) {
  try {
    if (!token || typeof token !== "string" || token.indexOf(".") < 0) return null;
    const [p, firma] = token.split(".");
    const esperada = firmar(p);
    const a = Buffer.from(String(firma), "utf8");
    const b = Buffer.from(esperada, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(deB64url(p));
    if (!payload || !payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function leerCookies(req) {
  const out = {};
  const raw = req.headers && req.headers.cookie;
  if (!raw) return out;
  String(raw).split(";").forEach(par => {
    const i = par.indexOf("=");
    if (i > 0) out[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  });
  return out;
}

function enviarCookieSesion(res, token) {
  const partes = [
    `${COOKIE_SESION}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(SESION_DURACION_MS / 1000)}`
  ];
  if (process.env.NODE_ENV === "production" || process.env.FORZAR_COOKIE_SEGURA === "1") partes.push("Secure");
  res.append("Set-Cookie", partes.join("; "));
}

function limpiarCookieSesion(res) {
  res.append("Set-Cookie", `${COOKIE_SESION}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/** Devuelve la sesión del request (cookie o header), o null. */
function sesionDe(req) {
  const cookies = leerCookies(req);
  return leerToken(cookies[COOKIE_SESION] || req.headers["x-auth-token"] || "");
}

// ---------- 4) Límite de intentos de login (anti fuerza bruta) ----------
const intentosLogin = new Map(); // ip -> { n, hasta }
const LOGIN_MAX_INTENTOS = 10;
const LOGIN_VENTANA_MS = 15 * 60 * 1000;

function ipDe(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.ip || "desconocida";
}
function loginBloqueado(req) {
  const r = intentosLogin.get(ipDe(req));
  if (!r) return false;
  if (Date.now() > r.hasta) { intentosLogin.delete(ipDe(req)); return false; }
  return r.n >= LOGIN_MAX_INTENTOS;
}
function registrarFallo(req) {
  const ip = ipDe(req);
  const r = intentosLogin.get(ip);
  if (!r || Date.now() > r.hasta) intentosLogin.set(ip, { n: 1, hasta: Date.now() + LOGIN_VENTANA_MS });
  else r.n++;
}
function limpiarIntentos(req) { intentosLogin.delete(ipDe(req)); }

// ---------- 5) Cabeceras de seguridad ----------
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("X-Frame-Options", "SAMEORIGIN");
  res.set("Referrer-Policy", "same-origin");
  res.set("X-XSS-Protection", "0");
  res.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  next();
});

// ---------- 6) Reglas de permisos por endpoint ----------
// Coinciden exactamente con lo que hoy permite cada pantalla,
// para que nadie pierda un permiso que ya tenía.
const TODOS = ["admin", "encargada", "operaria"];
const GESTION = ["admin", "encargada"];
const SOLO_ADMIN = ["admin"];

const REGLAS = [
  // Usuarios y configuración: solo admin
  { m: /^(PUT|POST|DELETE)$/, p: /^\/api\/usuarios/, roles: SOLO_ADMIN },
  { m: /^(POST)$/, p: /^\/api\/configuracion\/backup/, roles: SOLO_ADMIN },

  // Pagos de nómina: solo admin (hoy solo el admin marca semanas pagadas)
  { m: /^(POST|PUT|DELETE)$/, p: /^\/api\/pagos/, roles: SOLO_ADMIN },

  // Eliminar pedidos: solo admin (igual que el botón 🗑️ de la pantalla)
  { m: /^DELETE$/, p: /^\/api\/pedidos/, roles: SOLO_ADMIN },

  // Crear/editar pedidos y catálogos: admin y encargada
  { m: /^(POST|PUT)$/, p: /^\/api\/pedidos/, roles: GESTION },
  { m: /^(POST|PUT|DELETE)$/, p: /^\/api\/operarias/, roles: GESTION },
  { m: /^(POST|PUT|DELETE)$/, p: /^\/api\/(maquinas|prendas|costuras|plantillas-costuras)/, roles: GESTION },

  // Registros de producción: los tres roles (la operaria registra lo suyo)
  { m: /^(POST|PUT|DELETE)$/, p: /^\/api\/registros/, roles: TODOS },

  // Herramientas internas de diagnóstico y migración: solo admin
  { m: /^GET$/, p: /^\/api\/debug-semana/, roles: SOLO_ADMIN },
  { m: /^POST$/, p: /^\/api\/migrar/, roles: SOLO_ADMIN },

  // MEJORA AGREGADA (puntos 12 a 16): permisos de lo nuevo.
  // Se respeta exactamente quién ve qué hoy en las pantallas.
  { m: /^GET$/, p: /^\/api\/exportar\/reporte-anual/, roles: SOLO_ADMIN },
  { m: /^GET$/, p: /^\/api\/exportar\/catalogos/, roles: SOLO_ADMIN },
  { m: /^GET$/, p: /^\/api\/exportar\/pedidos/, roles: GESTION },
  { m: /^GET$/, p: /^\/api\/exportar\/(reporte-semanal|produccion)/, roles: TODOS },
  { m: /^GET$/, p: /^\/api\/dashboard\/resumen/, roles: TODOS },
  { m: /^GET$/, p: /^\/api\/alertas/, roles: TODOS },
  { m: /^GET$/, p: /^\/api\/catalogos\/uso/, roles: GESTION },
  { m: /^(POST|PUT)$/, p: /^\/api\/catalogos\/renombrar/, roles: GESTION }
];

// MEJORA AGREGADA (punto 4): la página de diagnóstico queda fuera de servicio.
// Se bloquea aquí, antes de los archivos estáticos, por si el archivo sigue
// existiendo en la carpeta public.
app.all(/^\/test_diagnostico(\.html)?$/, (req, res) => {
  res.status(404).send("No encontrado");
});

/**
 * Devuelve siempre la ruta completa ("/api/...").
 * Dentro de un middleware montado en "/api", req.path viene recortado,
 * por eso se reconstruye con baseUrl y se limpia la query string.
 */
function rutaCompleta(req) {
  const base = req.baseUrl || "";
  const resto = req.path || "";
  let full = (base + resto) || req.originalUrl || "";
  const q = full.indexOf("?");
  if (q >= 0) full = full.slice(0, q);
  if (full.length > 1 && full.endsWith("/")) full = full.slice(0, -1);
  return full;
}

// Endpoints accesibles sin haber iniciado sesión
function esRutaPublica(req) {
  const p = rutaCompleta(req);
  if (p === "/api/login" || p.startsWith("/api/login/")) return true;
  if (p === "/api/logout" || p === "/api/session") return true;
  // La pantalla de login necesita la lista de operarias para el selector.
  // Se permite, pero más abajo se entrega SIN contraseñas ni datos sensibles.
  if (req.method === "GET" && p === "/api/operarias") return true;
  return false;
}

function reglaAplicable(req) {
  const p = rutaCompleta(req);
  return REGLAS.find(r => r.m.test(req.method) && r.p.test(p));
}

// Middleware principal de autenticación y permisos
app.use("/api", (req, res, next) => {
  try {
    const sesion = sesionDe(req);
    req.sesion = sesion; // queda disponible para los endpoints

    if (esRutaPublica(req)) return next();

    if (!sesion) {
      return res.status(401).json({ ok: false, error: "Sesión no válida o expirada. Vuelve a iniciar sesión.", sesionExpirada: true });
    }

    const regla = reglaAplicable(req);
    if (regla && !regla.roles.includes(sesion.tipo)) {
      return res.status(403).json({ ok: false, error: "No tienes permiso para realizar esta acción." });
    }
    return next();
  } catch (e) {
    console.error("Error en el control de acceso:", e.message || e);
    return res.status(500).json({ ok: false, error: "Error de autenticación" });
  }
});

// Consultar la sesión actual / cerrar sesión
app.get("/api/session", (req, res) => {
  const s = sesionDe(req);
  if (!s) return res.status(401).json({ ok: false, autenticado: false });
  res.json({ ok: true, autenticado: true, tipo: s.tipo, id: s.id, nombre: s.nombre });
});

app.post("/api/logout", (req, res) => {
  limpiarCookieSesion(res);
  res.json({ ok: true, mensaje: "Sesión cerrada" });
});
// ============ FIN MÓDULO DE SEGURIDAD (MEJORA AGREGADA) ============

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

// MEJORA AGREGADA: pantalla independiente para rastrear quién trabajó un pedido/prenda
app.get("/buscar_trabajo", servirPagina("buscar_trabajo.html"));
app.get("/buscar_trabajo.html", servirPagina("buscar_trabajo.html"));

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

  for (const [prendaId, maquinasPrenda] of Object.entries(defaults)) {
    plantillasCosturas[Number(prendaId)] = [];
    for (const [maquina, ops] of Object.entries(maquinasPrenda)) {
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

  // Helper: cargar TODAS las filas de una tabla (Supabase limita a 1000 por query)
  async function selectAll(tabla, orderCol = "id") {
    const PAGE_SIZE = 1000;
    let allData = [];
    let offset = 0;
    let keepGoing = true;

    while (keepGoing) {
      const { data, error } = await supabase
        .from(tabla)
        .select("*")
        .order(orderCol, { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      allData = allData.concat(data);
      offset += PAGE_SIZE;
      keepGoing = data.length === PAGE_SIZE; // si trajo menos, ya no hay más
    }

    return { data: allData, error: null };
  }

  const [ops, maq, peds, regs, prnds, usrs, costs, plts] = await Promise.all([
    selectAll("operarias"),
    selectAll("maquinas", "nombre"),
    selectAll("pedidos"),
    selectAll("registros"),
    selectAll("prendas"),
    selectAll("usuarios"),
    selectAll("costuras").catch(() => ({ data: [], error: null })),
    selectAll("plantillas_costuras").catch(() => ({ data: [], error: null }))
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
    pagoPorPieza: Number(p.pagoporpieza || 0),
    // MEJORA AGREGADA: fecha de entrega opcional. Si la columna todavía no
    // existe en Supabase, llega undefined y simplemente queda en null.
    fechaEntrega: p.fechaentrega ? String(p.fechaentrega).slice(0, 10) : null
  }));

  registros = (regs.data || []).map(r => ({
    id: Number(r.id),
    operariaId: Number(r.operariaid),
    pedidoId: Number(r.pedidoid),
    prendaId: (r.prendaid === null || r.prendaid === undefined) ? null : Number(r.prendaid),
    operacionId: r.operacionid ? Number(r.operacionid) : null,
    talla: r.talla || null,
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

// MEJORA AGREGADA: para avisar una sola vez si falta la columna fechaentrega
let avisoFechaEntregaMostrado = false;

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
    pagoporpieza: Number(p.pagoPorPieza || 0),
    // MEJORA AGREGADA: fecha de entrega opcional
    fechaentrega: p.fechaEntrega ? String(p.fechaEntrega).slice(0, 10) : null
  }));

  const regs = registros.map(r => ({
    id: r.id,
    operariaid: r.operariaId,
    pedidoid: r.pedidoId,
    prendaid: r.prendaId,
    operacionid: r.operacionId || null,
    talla: r.talla || null,
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
  // MEJORA AGREGADA: guardado a prueba de fallos para "fechaentrega".
  // Si esa columna todavía no existe en la tabla de Supabase, el upsert
  // se reintenta SIN ese campo, para que jamás se deje de guardar nada.
  try {
    await upsertChunked("pedidos", peds, "id");
  } catch (errPed) {
    const msg = String((errPed && errPed.message) || errPed || "");
    const esColumnaFaltante = /fechaentrega/i.test(msg) ||
      /column .* does not exist/i.test(msg) ||
      /PGRST204/i.test(String((errPed && errPed.code) || ""));
    if (!esColumnaFaltante) throw errPed;

    if (!avisoFechaEntregaMostrado) {
      avisoFechaEntregaMostrado = true;
      console.warn("⚠️ La columna 'fechaentrega' no existe en la tabla 'pedidos' de Supabase.");
      console.warn("   Los pedidos se seguirán guardando normal, pero la fecha de entrega");
      console.warn("   no se conservará al reiniciar. Para activarla, ejecuta en Supabase:");
      console.warn("   ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS fechaentrega date;");
    }
    const pedsSinFecha = peds.map(p => {
      const copia = Object.assign({}, p);
      delete copia.fechaentrega;
      return copia;
    });
    await upsertChunked("pedidos", pedsSinFecha, "id");
  }
  await upsertChunked("registros", regs, "id", 300);

  // Limpiar filas huérfanas en Supabase (borradas en memoria pero que siguen en DB)
  try {
    const limpiarHuerfanos = async (tabla, idsActuales, columnaId = "id") => {
      if (idsActuales.length === 0) return;
      // Paginar para obtener TODOS los IDs de Supabase
      let allIds = [];
      let offset = 0;
      const PAGE = 1000;
      while (true) {
        const { data } = await supabase.from(tabla).select(columnaId).range(offset, offset + PAGE - 1);
        if (!data || data.length === 0) break;
        allIds = allIds.concat(data.map(f => f[columnaId]));
        if (data.length < PAGE) break;
        offset += PAGE;
      }
      if (allIds.length === 0) return;
      const idsSet = new Set(idsActuales.map(id => typeof id === 'number' ? id : String(id)));
      const huerfanos = allIds.filter(id => !idsSet.has(typeof id === 'number' ? id : String(id)));
      if (huerfanos.length > 0) {
        for (let i = 0; i < huerfanos.length; i += 100) {
          const bloque = huerfanos.slice(i, i + 100);
          await supabase.from(tabla).delete().in(columnaId, bloque);
        }
        console.log(`🧹 ${tabla}: eliminados ${huerfanos.length} registros huérfanos de Supabase`);
      }
    };

    await limpiarHuerfanos("registros", regs.map(r => r.id));
    await limpiarHuerfanos("pedidos", peds.map(p => p.id));
    await limpiarHuerfanos("operarias", ops.map(o => o.id));
    await limpiarHuerfanos("prendas", prnds.map(p => p.id));
  } catch(e) {
    console.warn("⚠️ Error limpiando huérfanos:", e.message);
  }

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
  // MEJORA AGREGADA: cifrar de una sola vez las contraseñas que sigan en texto plano
  try { migrarPasswordsAHash(); } catch (e) { console.error("⚠️  Migración de contraseñas omitida:", e.message || e); }
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
  // MEJORA AGREGADA: límite de intentos
  if (loginBloqueado(req)) {
    return res.status(429).json({ error: "Demasiados intentos fallidos. Espera 15 minutos.", ok: false });
  }
  const { password } = req.body;
  const admin = usuarios.find(u => u.tipo === "admin");
  // MEJORA AGREGADA: verificación contra contraseña cifrada (acepta la antigua y la migra)
  const v = verifyPassword(password, getAdminPassword());
  if (v.ok) {
    if (v.necesitaMigrar && admin) { try { admin.password = hashPassword(password); guardarDatos(); } catch (e) {} }
    limpiarIntentos(req);
    const nombreAdmin = admin ? admin.nombre : "admin";
    enviarCookieSesion(res, crearToken({ tipo: "admin", id: "admin", nombre: nombreAdmin }));
    return res.json({ 
      mensaje: "Login admin correcto", 
      ok: true, 
      rol: "admin",
      nombre: nombreAdmin
    });
  }
  registrarFallo(req);
  return res.status(401).json({ error: "Contraseña de admin incorrecta.", ok: false });
});

/**
 * Login de Encargada (endpoint original)
 */
app.post("/api/login/encargada", (req, res) => {
  // MEJORA AGREGADA: límite de intentos
  if (loginBloqueado(req)) {
    return res.status(429).json({ error: "Demasiados intentos fallidos. Espera 15 minutos.", ok: false });
  }
  const { password } = req.body;
  const encargada = usuarios.find(u => u.tipo === "encargada");
  // MEJORA AGREGADA: verificación contra contraseña cifrada
  const v = verifyPassword(password, getEncargadaPassword());
  if (v.ok) {
    if (v.necesitaMigrar && encargada) { try { encargada.password = hashPassword(password); guardarDatos(); } catch (e) {} }
    limpiarIntentos(req);
    const nombreEnc = encargada ? encargada.nombre : "encargada";
    enviarCookieSesion(res, crearToken({ tipo: "encargada", id: "encargada", nombre: nombreEnc }));
    return res.json({ 
      mensaje: "Login encargada correcto", 
      ok: true, 
      rol: "encargada",
      nombre: nombreEnc
    });
  }
  registrarFallo(req);
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
  // MEJORA AGREGADA: límite de intentos
  if (loginBloqueado(req)) {
    return res.status(429).json({ error: "Demasiados intentos fallidos. Espera 15 minutos.", ok: false });
  }
  // MEJORA AGREGADA: verificación contra contraseña cifrada
  const vOp = verifyPassword(password, op.password);
  if (!vOp.ok) {
    registrarFallo(req);
    return res.status(401).json({ error: "Contraseña incorrecta.", ok: false });
  }
  if (vOp.necesitaMigrar) { try { op.password = hashPassword(password); guardarDatos(); } catch (e) {} }

  // MEJORA AGREGADA: no permitir el ingreso a operarias dadas de baja
  if (op.activa === false) {
    return res.status(403).json({ error: "Esta cuenta fue dada de baja. Contacta al administrador.", ok: false });
  }

  limpiarIntentos(req);
  enviarCookieSesion(res, crearToken({ tipo: "operaria", id: op.id, nombre: op.nombre }));
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

  // MEJORA AGREGADA: límite de intentos fallidos por IP
  if (loginBloqueado(req)) {
    return res.status(429).json({ ok: false, mensaje: "Demasiados intentos fallidos. Espera 15 minutos." });
  }

  // Admin
  if (usuario === "admin") {
    // MEJORA AGREGADA: verificación contra contraseña cifrada
    const vA = verifyPassword(password, getAdminPassword());
    if (vA.ok) {
      const adminU = usuarios.find(u => u.tipo === "admin");
      if (vA.necesitaMigrar && adminU) { try { adminU.password = hashPassword(password); guardarDatos(); } catch (e) {} }
      limpiarIntentos(req);
      enviarCookieSesion(res, crearToken({ tipo: "admin", id: "admin", nombre: "Administrador" }));
      return res.json({
        ok: true,
        rol: "admin",
        tipo: "admin",
        nombre: "Administrador",
        id: "admin"
      });
    }
    registrarFallo(req);
    return res.status(401).json({ ok: false, mensaje: "Contraseña incorrecta" });
  }

  // Encargada
  if (usuario === "encargada") {
    // MEJORA AGREGADA: verificación contra contraseña cifrada
    const vE = verifyPassword(password, getEncargadaPassword());
    if (vE.ok) {
      const encU = usuarios.find(u => u.tipo === "encargada");
      if (vE.necesitaMigrar && encU) { try { encU.password = hashPassword(password); guardarDatos(); } catch (e) {} }
      limpiarIntentos(req);
      enviarCookieSesion(res, crearToken({ tipo: "encargada", id: "encargada", nombre: "Encargada" }));
      return res.json({
        ok: true,
        rol: "encargada",
        tipo: "encargada",
        nombre: "Encargada",
        id: "encargada"
      });
    }
    registrarFallo(req);
    return res.status(401).json({ ok: false, mensaje: "Contraseña incorrecta" });
  }

  // Operarias: búsqueda flexible por usuario, nombre o id
  const operaria = operarias.find(o =>
    (o.usuario && o.usuario === usuario) ||
    o.nombre.toLowerCase() === usuario.toLowerCase() ||
    String(o.id) === String(usuario)
  );

  if (!operaria) {
    registrarFallo(req);
    return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
  }

  // MEJORA AGREGADA: verificación contra contraseña cifrada
  const vOperaria = verifyPassword(password, operaria.password);
  if (!vOperaria.ok) {
    registrarFallo(req);
    return res.status(401).json({ ok: false, mensaje: "Usuario o contraseña incorrectos" });
  }
  if (vOperaria.necesitaMigrar) { try { operaria.password = hashPassword(password); guardarDatos(); } catch (e) {} }

  // MEJORA AGREGADA: no permitir el ingreso a operarias dadas de baja
  if (operaria.activa === false) {
    return res.status(403).json({ ok: false, mensaje: "Esta cuenta fue dada de baja. Contacta al administrador." });
  }

  // MEJORA AGREGADA: se entrega la sesión firmada como cookie segura
  limpiarIntentos(req);
  enviarCookieSesion(res, crearToken({ tipo: "operaria", id: operaria.id, nombre: operaria.nombre }));

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
  // MEJORA AGREGADA: nunca se entrega la contraseña (ni cifrada) al navegador.
  // Si aún no hay sesión (pantalla de login), solo se manda lo mínimo para el selector.
  const autenticado = !!req.sesion;
  const seguras = operarias.map(o => {
    const { password, ...resto } = o;
    return autenticado ? resto : { id: o.id, nombre: o.nombre, usuario: o.usuario, activa: o.activa };
  });
  res.json(seguras);
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
    // MEJORA AGREGADA: la contraseña se guarda cifrada, nunca en texto plano
    password: hashPassword(String(password).trim()),
    usuario: nuevoUsuario,
    rol: rol || "operaria",
    pagoPorPrenda: Number(pagoPorPrenda) || 0,
    activa: activa !== undefined ? !!activa : true
  };

  operarias.push(nueva);
  guardarDatos();
  
  // MEJORA AGREGADA: la respuesta no incluye la contraseña
  const { password: _pwNueva, ...nuevaSegura } = nueva;
  res.status(201).json({ 
    mensaje: "Operaria creada correctamente", 
    ok: true,
    operaria: nuevaSegura 
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
    // MEJORA AGREGADA: la contraseña se guarda cifrada
    op.password = hashPassword(String(password).trim());
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
  
  // MEJORA AGREGADA: la respuesta no incluye la contraseña
  const { password: _pwOp, ...opSegura } = op;
  res.json({ 
    mensaje: "Operaria actualizada correctamente.", 
    ok: true,
    operaria: opSegura 
  });
});

/**
 * MEJORA AGREGADA
 * POST /api/operarias/:id/restablecer-password
 * Genera una contraseña nueva para una operaria que olvidó la suya.
 * Se muestra UNA sola vez en la respuesta para poder dictársela.
 * Permitido para admin y encargada (igual que el resto de la pantalla de Operarias).
 */
app.post("/api/operarias/:id/restablecer-password", (req, res) => {
  try {
    const id = Number(req.params.id);
    const op = operarias.find(o => o.id === id);
    if (!op) return res.status(404).json({ ok: false, error: "Operaria no encontrada." });

    // Si mandan una contraseña concreta se usa esa; si no, se genera un PIN de 4 dígitos
    const manual = (req.body && req.body.password ? String(req.body.password).trim() : "");
    const nueva = manual || String(Math.floor(1000 + Math.random() * 9000));

    op.password = hashPassword(nueva);
    guardarDatos();

    return res.json({
      ok: true,
      mensaje: "Contraseña restablecida correctamente.",
      operariaId: op.id,
      nombre: op.nombre,
      usuario: op.usuario || "",
      passwordNueva: nueva
    });
  } catch (e) {
    console.error("Error al restablecer contraseña:", e.message || e);
    return res.status(500).json({ ok: false, error: "No se pudo restablecer la contraseña." });
  }
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
  
  // Eliminar de Supabase si está habilitado
  if (SUPABASE_ENABLED && supabase) {
    supabase.from("operarias").delete().eq("id", id)
      .then(({ error }) => {
        if (error) console.warn("⚠️ Error eliminando operaria de Supabase:", error.message);
      });
  }
  
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

  const fuenteFiltro = req.query.fuente || null; // "operaria" | "encargada" | null (todas)

  // Filtrar todos los registros de esta operaria (solo pendientes)
  let registrosOperaria = registros.filter(r => 
    r.operariaId === id && 
    (r.estadoPago || "pendiente") === "pendiente"
  );

  // Aplicar filtro de fuente si se especifica
  if (fuenteFiltro) {
    registrosOperaria = registrosOperaria.filter(r => (r.fuente || "operaria") === fuenteFiltro);
  }

  // Separar por fuente (para resumenPorFuente)
  const regOperaria = registrosOperaria.filter(r => (r.fuente || "operaria") === "operaria");
  const regEncargada = registrosOperaria.filter(r => r.fuente === "encargada");

  // Calcular totales por fuente
  const totalPiezasOperaria = regOperaria.reduce((sum, r) => sum + r.cantidad, 0);
  const totalGanadoOperaria = regOperaria.reduce((sum, r) => sum + r.totalGanado, 0);

  const totalPiezasEncargada = regEncargada.reduce((sum, r) => sum + r.cantidad, 0);
  const totalGanadoEncargada = regEncargada.reduce((sum, r) => sum + r.totalGanado, 0);

  // Totales (filtrados)
  const totalPiezas = registrosOperaria.reduce((sum, r) => sum + r.cantidad, 0);
  const totalGanado = registrosOperaria.reduce((sum, r) => sum + r.totalGanado, 0);

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
    // Campos planos para compatibilidad con frontend
    totalPiezas,
    totalGanado,
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
  const hoyStr = toMexicoYMD(hoy);

  // Calcular inicio de semana laboral (SÁBADO → VIERNES)
  const semanaInfo = obtenerSemanaLaboral(hoy);
  const inicioSemanaStr = semanaInfo.inicio;

  // Filtrar registros pendientes de esta operaria
  const registrosOperaria = registros.filter(r => 
    r.operariaId === id && 
    (r.estadoPago || "pendiente") === "pendiente"
  );

  // Registros del día (hora México)
  const registrosDia = registrosOperaria.filter(r => {
    return toMexicoYMD(new Date(r.fecha)) === hoyStr;
  });
  const piezasDia = registrosDia.reduce((sum, r) => sum + r.cantidad, 0);
  const ganadoDia = registrosDia.reduce((sum, r) => sum + r.totalGanado, 0);

  // Registros de la semana (hora México)
  const registrosSemana = registrosOperaria.filter(r => {
    const fechaReg = toMexicoYMD(new Date(r.fecha));
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
        // MEJORA AGREGADA: costo unitario de mano de obra por prenda.
        // Es la suma de los precios de TODAS las operaciones de esa prenda en el pedido
        // (los mismos precios que ya se usan para el costo estimado). No multiplica por cantidad.
        const itemPrenda = (pedido.items || []).find(it => it.prendaId === parseInt(prendaId));
        const costoUnitario = itemPrenda
          ? (itemPrenda.operaciones || []).reduce((s, op) => s + (Number(op.precio) || 0), 0)
          : 0;
        return {
          prenda: prenda ? prenda.nombre : "Desconocida",
          total: desglose[prendaId],
          costoUnitario: costoUnitario  // MEJORA AGREGADA: mano de obra por prenda
        };
      });

      // MEJORA AGREGADA: incluir también las prendas del pedido que AÚN NO tienen
      // producción registrada, para que la mano de obra por prenda se vea desde que se
      // crea el pedido. Estas entran con total 0 (no hay piezas aún) pero con su
      // costoUnitario calculado de los precios capturados.
      const prendasConDesglose = new Set(Object.keys(desglose).map(id => parseInt(id)));
      (pedido.items || []).forEach(item => {
        const pid = parseInt(item.prendaId);
        if (prendasConDesglose.has(pid)) return; // ya tiene producción, no duplicar
        const costoUnitario = (item.operaciones || []).reduce((s, op) => s + (Number(op.precio) || 0), 0);
        if (costoUnitario <= 0) return; // sin precios capturados, nada que mostrar
        const prenda = prendas.find(p => p.id === pid);
        desglosePrendas.push({
          prenda: prenda ? prenda.nombre : "Desconocida",
          total: 0,                 // aún sin producción registrada
          costoUnitario: costoUnitario,
          sinProduccion: true       // bandera para el frontend
        });
        prendasConDesglose.add(pid);
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

  // MEJORA AGREGADA: fecha de entrega OPCIONAL. Si no viene o viene mal, queda
  // en null y el pedido se crea igual que siempre.
  let fechaEntregaNueva = null;
  try {
    const fe = req.body ? req.body.fechaEntrega : null;
    if (fe) {
      const texto = String(fe).slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(texto) && !isNaN(new Date(texto + "T12:00:00").getTime())) {
        fechaEntregaNueva = texto;
      }
    }
  } catch (e) { fechaEntregaNueva = null; }

  const nuevo = {
    id: pedidoIdCounter++,
    escuela: escuela.trim(),
    folio: folio.trim(),
    prendas: prendasSeleccionadas || [],
    items: [],
    estado: "activo",
    fechaTerminado: null,
    fechaEntrega: fechaEntregaNueva
  };

  // Si vienen items detallados (nuevo formato)
  if (Array.isArray(items) && items.length > 0) {
    nuevo.items = items.map(item => {
      const prendaId = Number(item.prendaId);
      const cantidad = Number(item.cantidad) || 0;
      
      // MEJORA AGREGADA: emparejado de precios TOLERANTE.
      // Antes el precio se perdía (quedaba en 0) si el texto no coincidía EXACTO con la
      // plantilla (un espacio, mayúscula o acento de diferencia). Ahora normalizamos el
      // texto (sin acentos, minúsculas, sin espacios extra) para emparejar bien, y además
      // intentamos por costura+maquina y, si no, por costura sola. Si una operación con
      // precio no existe en la plantilla, se conserva igual (no se descarta).
      const normalizar = (s) => (s || "")
        .toString()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // quitar acentos
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();

      const opsEnviadas = Array.isArray(item.operaciones) ? item.operaciones : [];
      // Mapa por costura+maquina y mapa por costura sola (fallback)
      const precioPorCosturaMaquina = new Map();
      const precioPorCostura = new Map();
      opsEnviadas.forEach(op => {
        const costuraTxt = op.costura || op.descripcion || "";
        const maquinaTxt = op.maquina || "";
        const precioNum = Number(op.precio) || 0;
        precioPorCosturaMaquina.set(normalizar(costuraTxt) + "||" + normalizar(maquinaTxt), precioNum);
        // Para el fallback por costura sola, guardamos el último precio > 0 si existe
        const kc = normalizar(costuraTxt);
        if (!precioPorCostura.has(kc) || precioNum > 0) precioPorCostura.set(kc, precioNum);
      });

      const obtenerPrecio = (costuraTxt, maquinaTxt, precioBase) => {
        const kcm = normalizar(costuraTxt) + "||" + normalizar(maquinaTxt);
        if (precioPorCosturaMaquina.has(kcm)) return precioPorCosturaMaquina.get(kcm);
        const kc = normalizar(costuraTxt);
        if (precioPorCostura.has(kc)) return precioPorCostura.get(kc);
        return Number(precioBase) || 0;
      };

      let operacionesBase = [];
      if (plantillasCosturas[prendaId] && plantillasCosturas[prendaId].length > 0) {
        operacionesBase = plantillasCosturas[prendaId].map(op => ({
          costura: op.costura,
          maquina: op.maquina,
          precio: 0
        }));
      } else {
        // Fallback: si no hay plantilla, usa lo que venga en la petición
        operacionesBase = opsEnviadas.map(op => ({
          costura: op.costura || op.descripcion || "",
          maquina: op.maquina || "",
          precio: Number(op.precio) || 0
        }));
      }

      // Aplicar precios del cliente sobre la base (tolerante a texto)
      const operaciones = operacionesBase.map(op => {
        const precio = obtenerPrecio(op.costura, op.maquina, op.precio);
        return { ...op, precio };
      });

      // MEJORA AGREGADA: conservar operaciones que el usuario capturó (con o sin precio)
      // pero que NO existen en la plantilla, para no perder esos precios.
      const clavesBase = new Set(operaciones.map(op => normalizar(op.costura) + "||" + normalizar(op.maquina)));
      opsEnviadas.forEach(op => {
        const costuraTxt = op.costura || op.descripcion || "";
        const maquinaTxt = op.maquina || "";
        if (!costuraTxt.trim() || !maquinaTxt.trim()) return;
        const clave = normalizar(costuraTxt) + "||" + normalizar(maquinaTxt);
        if (!clavesBase.has(clave)) {
          operaciones.push({ costura: costuraTxt, maquina: maquinaTxt, precio: Number(op.precio) || 0 });
          clavesBase.add(clave);
        }
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
  // MEJORA AGREGADA: rastrear el precio anterior de cada operación para poder
  // actualizar automáticamente los registros PENDIENTES de pago si el precio cambia
  let registrosActualizadosPorPrecio = 0;
  if (Array.isArray(items)) {
    // Indexar operaciones existentes por prendaId+costura para preservar opIds
    const opsExistentes = {};
    const precioAnteriorPorOpId = {}; // MEJORA AGREGADA
    (pedido.items || []).forEach(item => {
      (item.operaciones || []).forEach(op => {
        const key = `${item.prendaId}|${op.costura}|${op.maquina}`;
        opsExistentes[key] = op.opId;
        if (op.opId) precioAnteriorPorOpId[op.opId] = Number(op.precio) || 0;
      });
    });

    const cambiosDePrecio = []; // MEJORA AGREGADA: {opId, precioNuevo}

    pedido.items = items.map(item => {
      const prendaId = Number(item.prendaId);
      const cantidad = Number(item.cantidad) || 0;
      const tallas = Array.isArray(item.tallas) ? item.tallas.filter(t => (t.talla||'').toString().trim() !== '' && Number(t.cantidad) > 0).map(t => ({ talla: (t.talla||'').toString().trim(), cantidad: Number(t.cantidad) })) : [];
      const cantidadTotal = tallas.length > 0 ? tallas.reduce((s,t)=>s+t.cantidad,0) : cantidad;
      const operaciones = (item.operaciones || []).map(op => {
        // Preservar opId existente si la operación ya existía, generar nuevo solo si es nueva
        const key = `${prendaId}|${op.costura || op.descripcion || ''}|${op.maquina || ''}`;
        const existingOpId = op.opId || opsExistentes[key];
        const precioNuevo = Number(op.precio) || 0;
        // MEJORA AGREGADA: si esta operación ya existía y su precio cambió, registrar el cambio
        if (existingOpId && precioAnteriorPorOpId[existingOpId] !== undefined && precioAnteriorPorOpId[existingOpId] !== precioNuevo) {
          cambiosDePrecio.push({ opId: existingOpId, precioNuevo });
        }
        return {
          opId: existingOpId || operacionIdCounter++,
          costura: op.costura || op.descripcion || "",
          maquina: op.maquina || "",
          precio: precioNuevo
        };
      });
      return { prendaId, cantidad: cantidadTotal, tallas, operaciones };
    });
    // Sync prendas[] desde items
    pedido.prendas = [...new Set(pedido.items.map(i => i.prendaId))];

    // MEJORA AGREGADA: aplicar los cambios de precio SOLO a registros pendientes de pago.
    // Los registros ya marcados como "pagado" nunca se tocan, para no alterar nómina ya cerrada.
    if (cambiosDePrecio.length > 0) {
      cambiosDePrecio.forEach(({ opId, precioNuevo }) => {
        registros.forEach(r => {
          if (r.operacionId === opId && r.estadoPago === "pendiente") {
            r.pagoPorPieza = precioNuevo;
            r.totalGanado = r.cantidad * precioNuevo;
            registrosActualizadosPorPrecio++;
          }
        });
      });
    }
  }

  guardarDatos();

  res.json({ 
    mensaje: "Pedido actualizado correctamente.",
    ok: true, 
    registrosActualizadosPorPrecio, // MEJORA AGREGADA: informativo, cuántos registros pendientes se recalcularon
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
  
  // Eliminar de Supabase si está habilitado
  if (SUPABASE_ENABLED && supabase) {
    supabase.from("pedidos").delete().eq("id", id)
      .then(({ error }) => {
        if (error) console.warn("⚠️ Error eliminando pedido de Supabase:", error.message);
      });
  }
  
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
      return toMexicoYMD(new Date(r.fecha)) === fecha;
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

  // Validar que la operaria exista y esté activa
  const operaria = operarias.find(o => o.id === Number(operariaId));
  if (!operaria) {
    return res.status(400).json({ error: "Operaria no encontrada." });
  }
  if (!operaria.activa) {
    return res.status(400).json({ error: "La operaria está inactiva. No se pueden registrar costuras." });
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

        // Solo validar límite para registros de operaria
        // Encargada registra libremente (su base no afecta el conteo)
        const fuenteActual = fuente || "operaria";
        if (fuenteActual === "operaria") {
          const piezasYaHechas = registros
            .filter(r =>
              r.pedidoId === Number(pedidoId) &&
              r.operacionId === opIdFinal &&
              (r.fuente || 'operaria') === 'operaria' &&
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
 * POST /api/registros/lote
 * Crea múltiples registros en un solo request (multi-talla y/o multi-costura)
 * Body: { items: [{ operariaId, pedidoId, prendaId, operacionId, talla, cantidad, maquina, descripcion, fuente }] }
 */
app.post("/api/registros/lote", (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Se requiere un array de items." });
  }
  if (items.length > 50) {
    return res.status(400).json({ error: "Máximo 50 registros por lote." });
  }

  const creados = [];
  const errores = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const { operariaId, pedidoId, prendaId, operacionId, talla, cantidad, maquina, descripcion, fuente } = item;
    const cant = Number(cantidad);

    if (!operariaId || !pedidoId || !cant || cant <= 0) {
      errores.push({ index: i, error: "Datos incompletos o cantidad inválida" });
      continue;
    }

    const pedido = pedidos.find(p => p.id === Number(pedidoId));
    if (!pedido) {
      errores.push({ index: i, error: `Pedido ${pedidoId} no encontrado` });
      continue;
    }

    let maqFinal = maquina || "";
    let descFinal = descripcion || "";
    let pagoFinal = Number(item.pagoPorPieza) || 0;
    let opIdFinal = operacionId ? Number(operacionId) : null;
    let prendaIdFinal = Number(prendaId) || null;

    // Buscar operación en el pedido para auto-llenar datos
    let itemRechazado = false;
    if (opIdFinal && pedido.items) {
      for (const it of pedido.items) {
        if (it.prendaId !== Number(prendaId)) continue;
        const opEncontrada = (it.operaciones || []).find(op => op.opId === opIdFinal);
        if (opEncontrada) {
          maqFinal = opEncontrada.maquina || maqFinal;
          descFinal = opEncontrada.costura || opEncontrada.descripcion || descFinal;
          pagoFinal = opEncontrada.precio || pagoFinal;

          // Validar exceso — solo para fuente operaria
          const tallaNorm = (talla !== undefined && talla !== null) ? String(talla).trim() : null;
          const fuenteActual = fuente || "operaria";
          if (fuenteActual === "operaria") {
            const piezasYaHechas = registros
              .concat(creados) // Incluir los que ya creamos en este lote
              .filter(r =>
                r.pedidoId === Number(pedidoId) &&
                r.operacionId === opIdFinal &&
                (r.fuente || 'operaria') === 'operaria' &&
                (tallaNorm ? (String(r.talla || '').trim() === tallaNorm) : true)
              )
              .reduce((sum, r) => sum + r.cantidad, 0);

            let limite = Number(it.cantidad) || 0;
            if (tallaNorm && Array.isArray(it.tallas) && it.tallas.length > 0) {
              const tObj = it.tallas.find(t => String(t.talla || '').trim() === tallaNorm);
              if (tObj) limite = Number(tObj.cantidad) || 0;
            }

            const cantidadDisponible = Math.max(0, limite - piezasYaHechas);
            if (cant > cantidadDisponible) {
              errores.push({ index: i, error: `${descFinal} talla ${tallaNorm || 'N/A'}: solo faltan ${cantidadDisponible} piezas` });
              itemRechazado = true;
            }
          }
          break;
        }
      }
    }

    if (itemRechazado) continue;

    if (!maqFinal || !descFinal) {
      errores.push({ index: i, error: "Se requiere máquina y descripción" });
      continue;
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

    creados.push(nuevo);
  }

  // Guardar todos los creados
  if (creados.length > 0) {
    registros.push(...creados);
    guardarDatos();
  }

  res.status(201).json({
    ok: true,
    mensaje: `${creados.length} registro(s) guardado(s)${errores.length > 0 ? `, ${errores.length} error(es)` : ''}`,
    creados: creados.length,
    errores
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
  
  // Eliminar de Supabase si está habilitado
  if (SUPABASE_ENABLED && supabase) {
    supabase.from("registros").delete().eq("id", id)
      .then(({ error }) => {
        if (error) console.warn("⚠️ Error eliminando registro de Supabase:", error.message);
      });
  }
  
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

  // Usar la MISMA lógica de semana laboral (Sáb-Vie) que el resto del sistema
  const semanaInfo = obtenerSemanaLaboral(fecha);
  const inicioStr = semanaInfo.inicio;
  const finStr = semanaInfo.fin;
  const semanaPago = semanaInfo.codigo;
  
  const fechaPago = new Date().toISOString();
  
  // Filtrar registros de esa semana (pendientes) — comparar en hora México
  const fuenteFiltro = fuente || "operaria";
  
  let registrosAfectados = 0;
  registros.forEach(r => {
    const fechaReg = toMexicoYMD(new Date(r.fecha));
    
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
    const f = toMexicoYMD(new Date(r.fecha));
    
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
 * MEJORA AGREGADA
 * GET /api/reporte-anual
 * Reporte general anual: cuánto se le pagó a cada operaria en un año completo.
 * Solo cuenta registros con estadoPago === "pagado" (la nómina real que se terminó pagando).
 * Incluye TODAS las operarias que tuvieron registros ese año, activas o dadas de baja,
 * para que el reporte de fin de año no pierda a nadie.
 * Query params:
 * - anio: "YYYY" (obligatorio)
 * RESPUESTA: { anio, totalPagado, operarias: [{operariaId, nombre, activa, piezas, registros, totalPagado}] }
 * ordenado de mayor a menor monto pagado.
 */
app.get("/api/reporte-anual", (req, res) => {
  try {
    const anio = String(req.query.anio || "").trim();
    if (!anio || !/^\d{4}$/.test(anio)) {
      return res.status(400).json({ error: "Debes indicar un año válido, ej. ?anio=2026" });
    }

    const resumen = {};
    let totalPagado = 0;

    registros.forEach(r => {
      let f;
      try {
        f = toMexicoYMD(new Date(r.fecha));
      } catch (e) {
        return;
      }
      if (!f || f.slice(0, 4) !== anio) return;

      const rEstado = r.estadoPago || "pendiente";
      if (rEstado !== "pagado") return;

      if (!resumen[r.operariaId]) {
        const op = operarias.find(o => o.id === r.operariaId);
        resumen[r.operariaId] = {
          operariaId: r.operariaId,
          nombre: op ? op.nombre : (r.operariaNombre || "N/A"),
          activa: op ? (op.activa !== false) : null,
          piezas: 0,
          registros: 0,
          totalPagado: 0
        };
      }

      resumen[r.operariaId].piezas += Number(r.cantidad || 0);
      resumen[r.operariaId].registros += 1;
      resumen[r.operariaId].totalPagado += Number(r.totalGanado || 0);
      totalPagado += Number(r.totalGanado || 0);
    });

    const listaOperarias = Object.values(resumen).sort((a, b) => b.totalPagado - a.totalPagado);

    return res.json({
      anio,
      totalPagado,
      operarias: listaOperarias
    });
  } catch (e) {
    console.error("Error en /api/reporte-anual:", e);
    return res.status(500).json({ error: "Error al generar el reporte anual." });
  }
});

/**
 * GET /api/reporte-semanal/por-pedido
 * Genera el desglose del pago semanal AGRUPADO POR PEDIDO (folio/escuela)
 * Usa exactamente la misma lógica de semana y filtros que /api/reporte-semanal,
 * por lo que la suma de todos los pedidos coincide con el Total a Pagar de la semana.
 * Query params:
 * - semana: "YYYY-WNN" (preferido, viene del frontend)
 * - fecha: "YYYY-MM-DD" (alternativa)
 * - fuente: "operaria" | "encargada" | "todos"
 * - estadoPago / estado: "pendiente" | "pagado" | "todos"
 *
 * RESPUESTA: Array<{pedidoId,escuela,folio,piezas,ganado,registros,operarias}>
 * ordenado de mayor a menor monto.
 */
app.get("/api/reporte-semanal/por-pedido", (req, res) => {
  let { fecha, semana, fuente, estadoPago, estado } = req.query;

  if (!estadoPago && estado) estadoPago = estado;
  const estadoFiltro = estadoPago || "pendiente";
  const fuenteFiltro = fuente || "operaria"; // operaria | encargada | todos

  // Resolver inicio/fin de semana (SÁBADO -> VIERNES), igual que /api/reporte-semanal
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
    const f = toMexicoYMD(new Date(r.fecha));
    if (f < inicioStr || f > finStr) return;

    const rEstado = (r.estadoPago || "pendiente");
    if (estadoFiltro !== "todos" && rEstado !== estadoFiltro) return;

    const rFuente = (r.fuente || "operaria");
    if (fuenteFiltro !== "todos" && rFuente !== fuenteFiltro) return;

    // Agrupar por pedido. Si un registro no tiene pedido asociado, se agrupa en "sin-pedido".
    const clave = (r.pedidoId !== undefined && r.pedidoId !== null) ? r.pedidoId : "sin-pedido";

    if (!resumen[clave]) {
      const pedido = (clave !== "sin-pedido") ? pedidos.find(p => p.id === r.pedidoId) : null;
      resumen[clave] = {
        pedidoId: (clave === "sin-pedido") ? null : r.pedidoId,
        escuela: pedido ? pedido.escuela : (r.escuela || "Sin pedido"),
        folio: pedido ? (pedido.folio || "") : "",
        piezas: 0,
        ganado: 0,
        registros: 0,
        _operarias: new Set()
      };
    }

    resumen[clave].piezas += Number(r.cantidad || 0);
    resumen[clave].ganado += Number(r.totalGanado || 0);
    resumen[clave].registros += 1;
    if (r.operariaId !== undefined && r.operariaId !== null) {
      resumen[clave]._operarias.add(r.operariaId);
    }
  });

  const lista = Object.values(resumen).map(p => ({
    pedidoId: p.pedidoId,
    escuela: p.escuela,
    folio: p.folio,
    piezas: p.piezas,
    ganado: p.ganado,
    registros: p.registros,
    operarias: p._operarias.size
  }));

  // Ordenar de mayor a menor monto
  lista.sort((a, b) => b.ganado - a.ganado);

  return res.json(lista); // SIEMPRE ARRAY
});

/**
 * GET /api/buscar-trabajo
 * BUSCADOR DE RASTREO (MEJORA AGREGADA - pantalla independiente buscar_trabajo.html)
 * Permite localizar quién trabajó un pedido o una prenda, para rastrear prendas defectuosas.
 * No modifica nada: solo lee y une la información que ya existe en los registros.
 *
 * Query params (todos opcionales, pero se requiere al menos pedidoId o prendaId):
 * - pedidoId: id del pedido a investigar
 * - prendaId: id de la prenda a investigar
 * - incluirActivos: "1" para incluir pedidos activos además de finalizados (por defecto incluye ambos)
 *
 * RESPUESTA: {
 *   total: { piezas, registros, operarias, montoTotal },
 *   operarias: Array<{ operariaId, nombre, piezas, monto, trabajos: Array<detalle> }>
 * }
 * Cada "detalle" trae: pedidoId, escuela, folio, pedidoEstado, prenda, operacion,
 *   maquina, talla, cantidad, pagoPorPieza, totalGanado, fecha, semana, fuente.
 */
app.get("/api/buscar-trabajo", (req, res) => {
  const { pedidoId, prendaId, operacion, incluirActivos, fuente } = req.query;

  if (!pedidoId && !prendaId) {
    return res.status(400).json({ error: "Indica un pedido o una prenda para buscar." });
  }

  // Por defecto se incluyen finalizados Y activos; si incluirActivos="0" -> solo finalizados
  const soloFinalizados = (incluirActivos === "0");

  let data = registros.slice();

  if (pedidoId) {
    data = data.filter(r => r.pedidoId === Number(pedidoId));
  }
  if (prendaId) {
    data = data.filter(r => r.prendaId === Number(prendaId));
  }
  // MEJORA AGREGADA: filtro opcional por operación (nombre exacto de la costura/operación)
  if (operacion) {
    data = data.filter(r => (r.descripcion || "") === operacion);
  }
  // MEJORA AGREGADA: filtro opcional por fuente del registro (operaria / encargada)
  // Si no se indica fuente, se devuelven ambas (comportamiento anterior, no rompe nada).
  if (fuente === "operaria" || fuente === "encargada") {
    data = data.filter(r => (r.fuente || "operaria") === fuente);
  }

  // Agrupar por operaria
  const porOperaria = {};
  let totPiezas = 0, totMonto = 0, totRegistros = 0;

  data.forEach(r => {
    const ped = pedidos.find(p => p.id === r.pedidoId);
    const estadoPedido = ped ? (ped.estado || "activo") : "N/A";

    // Filtro de estado del pedido (finalizado/terminado vs activo)
    if (soloFinalizados) {
      const esFinalizado = (estadoPedido === "finalizado" || estadoPedido === "terminado");
      if (!esFinalizado) return;
    }

    const op = operarias.find(o => o.id === r.operariaId);
    const prenda = prendas.find(p => p.id === r.prendaId);

    let semanaCodigo = "N/A";
    try { semanaCodigo = obtenerSemanaLaboral(new Date(r.fecha)).codigo; } catch (e) {}

    const detalle = {
      registroId: r.id,
      pedidoId: r.pedidoId,
      escuela: ped ? ped.escuela : "N/A",
      folio: ped ? (ped.folio || "") : "",
      pedidoEstado: estadoPedido,
      prenda: prenda ? prenda.nombre : "N/A",
      operacion: r.descripcion || "N/A",
      maquina: r.maquina || "N/A",
      talla: r.talla || "",
      cantidad: Number(r.cantidad || 0),
      pagoPorPieza: Number(r.pagoPorPieza || 0),
      totalGanado: Number(r.totalGanado || 0),
      fecha: r.fecha,
      semana: semanaCodigo,
      fuente: r.fuente || "operaria",
      estadoPago: r.estadoPago || "pendiente"
    };

    const clave = r.operariaId;
    if (!porOperaria[clave]) {
      porOperaria[clave] = {
        operariaId: r.operariaId,
        nombre: op ? op.nombre : "N/A",
        piezas: 0,
        monto: 0,
        trabajos: []
      };
    }
    porOperaria[clave].piezas += detalle.cantidad;
    porOperaria[clave].monto += detalle.totalGanado;
    porOperaria[clave].trabajos.push(detalle);

    totPiezas += detalle.cantidad;
    totMonto += detalle.totalGanado;
    totRegistros += 1;
  });

  // Ordenar trabajos de cada operaria por fecha (más reciente primero)
  const listaOperarias = Object.values(porOperaria).map(o => {
    o.trabajos.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    return o;
  });
  // Ordenar operarias por monto (mayor primero)
  listaOperarias.sort((a, b) => b.monto - a.monto);

  return res.json({
    total: {
      piezas: totPiezas,
      registros: totRegistros,
      operarias: listaOperarias.length,
      montoTotal: totMonto
    },
    operarias: listaOperarias
  });
});

/**
 * GET /api/buscar-trabajo/opciones
 * OPCIONES DEPENDIENTES (MEJORA AGREGADA - para los selectores de buscar_trabajo.html)
 * Devuelve solo las prendas y operaciones que REALMENTE tienen registros,
 * para que los selectores muestren únicamente lo que existe en ese pedido / prenda.
 * No modifica nada: solo lee los registros existentes.
 *
 * Query params:
 * - pedidoId: (opcional) limita a un pedido
 * - prendaId: (opcional) limita a una prenda
 *
 * RESPUESTA: {
 *   prendas: Array<{id, nombre}>,        // prendas con registros (en el pedido si se indicó)
 *   operaciones: Array<{nombre, maquina}> // operaciones con registros (en pedido+prenda si se indicaron)
 * }
 */
app.get("/api/buscar-trabajo/opciones", (req, res) => {
  const { pedidoId, prendaId } = req.query;

  let data = registros.slice();
  if (pedidoId) data = data.filter(r => r.pedidoId === Number(pedidoId));

  // Prendas distintas presentes en esos registros
  const prendasMap = {};
  data.forEach(r => {
    if (r.prendaId === undefined || r.prendaId === null) return;
    if (!prendasMap[r.prendaId]) {
      const prenda = prendas.find(p => p.id === r.prendaId);
      prendasMap[r.prendaId] = { id: r.prendaId, nombre: prenda ? prenda.nombre : "Prenda " + r.prendaId };
    }
  });
  const listaPrendas = Object.values(prendasMap).sort((a, b) => a.nombre.localeCompare(b.nombre));

  // Operaciones distintas (filtradas por prenda si se indicó)
  let dataOps = data;
  if (prendaId) dataOps = dataOps.filter(r => r.prendaId === Number(prendaId));

  const opsMap = {};
  dataOps.forEach(r => {
    const nombreOp = r.descripcion || "Sin nombre";
    const maq = r.maquina || "";
    const clave = nombreOp + "||" + maq;
    if (!opsMap[clave]) {
      opsMap[clave] = { nombre: nombreOp, maquina: maq };
    }
  });
  const listaOps = Object.values(opsMap).sort((a, b) => a.nombre.localeCompare(b.nombre));

  return res.json({
    prendas: listaPrendas,
    operaciones: listaOps
  });
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
  
  const resumenOperarias = {
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
    operarias: resumenOperarias,
    encargada,
    diferencia: {
      registros: resumenOperarias.registros - encargada.registros,
      piezas: resumenOperarias.piezas - encargada.piezas,
      ganado: resumenOperarias.ganado - encargada.ganado
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

  // MEJORA AGREGADA: para cambiar la contraseña hay que confirmar la actual
  if (password) {
    const actual = req.body.passwordActual || req.body.password_actual || "";
    if (!actual) {
      return res.status(400).json({ error: "Debes escribir la contraseña actual para poder cambiarla.", requiereActual: true });
    }
    if (!verifyPassword(actual, getAdminPassword()).ok) {
      return res.status(401).json({ error: "La contraseña actual no es correcta." });
    }
  }

  // Actualizar campos
  if (nombre) {
    admin.nombre = nombre;
  }
  if (password) {
    // MEJORA AGREGADA: se guarda cifrada
    admin.password = hashPassword(password);
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

  // MEJORA AGREGADA: el admin confirma SU propia contraseña para cambiar la de la encargada
  if (password) {
    const actual = req.body.passwordActual || req.body.password_actual || "";
    if (!actual) {
      return res.status(400).json({ error: "Debes escribir tu contraseña de administrador para confirmar el cambio.", requiereActual: true });
    }
    if (!verifyPassword(actual, getAdminPassword()).ok) {
      return res.status(401).json({ error: "Tu contraseña de administrador no es correcta." });
    }
  }

  // Actualizar campos
  if (nombre) {
    encargada.nombre = nombre;
  }
  if (password) {
    // MEJORA AGREGADA: se guarda cifrada
    encargada.password = hashPassword(password);
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
  
  if (SUPABASE_ENABLED && supabase) {
    supabase.from("prendas").delete().eq("id", id)
      .then(({ error }) => {
        if (error) console.warn("⚠️ Error eliminando prenda de Supabase:", error.message);
      });
  }
  
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
  
  if (SUPABASE_ENABLED && supabase) {
    supabase.from("costuras").delete().eq("id", id)
      .then(({ error }) => {
        if (error) console.warn("⚠️ Error eliminando costura de Supabase:", error.message);
      });
  }
  
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
    // MEJORA AGREGADA: el avance solo debe considerar operaciones que tienen un precio asignado.
    // Las operaciones cargadas del catálogo que se dejaron en $0 (no aplican a este pedido en particular)
    // nunca reciben registros de trabajo, por lo que quedan siempre en 0% y evitaban que el pedido llegara al 100%.
    const operacionesConPrecio = (item.operaciones || []).filter(op => Number(op.precio) > 0);
    const operaciones = operacionesConPrecio.map(op => {
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

    // MEJORA AGREGADA (punto 21): las operaciones que se dejaron en $0 no se muestran
    // en el reporte del pedido, pero aqui se informa cuantas son (y si alguien alcanzo
    // a registrar piezas en ellas) para que nunca se pierda trabajo sin darse cuenta.
    const operacionesSinPrecio = (item.operaciones || [])
      .filter(op => !(Number(op.precio) > 0))
      .map(op => {
        const regsOp0 = regsPedido.filter(r => r.operacionId === op.opId);
        return {
          opId: op.opId,
          costura: op.costura || op.descripcion,
          maquina: op.maquina,
          piezasHechas: regsOp0.reduce((sum, r) => sum + r.cantidad, 0)
        };
      });

    return {
      prendaId: item.prendaId,
      prenda: prenda ? prenda.nombre : "Desconocida",
      cantidad: item.cantidad,
      operaciones,
      operacionesSinPrecio,
      totalOperacionesSinPrecio: operacionesSinPrecio.length,
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
  const fuenteFiltro = req.query.fuente || null; // "operaria" | "encargada" | null (todas)
  const soloConPrecio = req.query.soloConPrecio === "true"; // Solo operaciones con precio asignado
  const regsPedido = registros.filter(r => r.pedidoId === id);
  // Registros solo de operarias para calcular faltante (encargada no afecta el conteo)
  const regsPedidoOperaria = regsPedido.filter(r => (r.fuente || 'operaria') === 'operaria');
  // Registros de la fuente solicitada (para mostrar piezasHechas)
  const regsPedidoFuente = fuenteFiltro ? regsPedido.filter(r => (r.fuente || 'operaria') === fuenteFiltro) : regsPedido;

  const resultado = [];
  pedido.items.forEach(item => {
    if (prendaIdFiltro && item.prendaId !== prendaIdFiltro) return;
    const prenda = prendas.find(p => p.id === item.prendaId);

    (item.operaciones || []).forEach(op => {
      // Filtrar: solo mostrar operaciones con precio > 0 si se pide
      if (soloConPrecio && (!op.precio || Number(op.precio) <= 0)) return;

      // Piezas hechas por la fuente solicitada (para mostrar)
      const piezasHechas = regsPedidoFuente
        .filter(r =>
          r.operacionId === op.opId &&
          (tallaFiltro ? (String(r.talla || '').trim() === tallaFiltro) : true)
        )
        .reduce((sum, r) => sum + r.cantidad, 0);

      // Faltante basado SOLO en registros de operarias (encargada no cuenta)
      const piezasOperaria = regsPedidoOperaria
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

      const cantidadFaltante = Math.max(0, limite - piezasOperaria);

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
// FECHAS — todo usa toMexicoYMD / toMexicoParts (Intl, sin depender del TZ del servidor)
// =========================

function obtenerSemanaLaboral(fecha) {
  let dateObj;
  if (fecha instanceof Date) {
    dateObj = fecha;
  } else {
    const s = String(fecha || '');
    // Si es "YYYY-MM-DD" puro, interpretarlo como mediodía UTC (para que caiga en el día correcto en México)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      dateObj = new Date(s + 'T12:00:00Z');
    } else {
      dateObj = new Date(s);
    }
  }
  // Obtener día de la semana en hora MÉXICO (no UTC)
  const parts = toMexicoParts(dateObj);
  const day = parts.dow; // 0=Dom, 6=Sáb

  // Semana laboral: SÁBADO -> VIERNES
  let diasDesdeInicio;
  if (day === 6) {
    diasDesdeInicio = 0;      // sábado
  } else if (day === 0) {
    diasDesdeInicio = 1;      // domingo => sábado fue ayer
  } else {
    diasDesdeInicio = day + 1; // lun(1)->2, vie(5)->6
  }

  // Calcular inicio/fin usando fecha México (evita desfase UTC)
  const fechaMx = toMexicoYMD(dateObj); // "YYYY-MM-DD" en México
  const inicioSemana = new Date(fechaMx + 'T12:00:00Z'); // mediodía UTC para evitar edge cases
  inicioSemana.setDate(inicioSemana.getDate() - diasDesdeInicio);

  const finSemana = new Date(inicioSemana);
  finSemana.setDate(inicioSemana.getDate() + 6); // +6 = viernes

  const inicioStr = toMexicoYMD(inicioSemana);
  const finStr = toMexicoYMD(finSemana);
  const year = Number(inicioStr.slice(0, 4));
  const weekNum = obtenerNumeroSemana(inicioSemana);

  return {
    codigo: `${year}-W${String(weekNum).padStart(2, "0")}`,
    inicio: inicioStr,
    fin: finStr,
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
  const week = Number(codigo.slice(6));

  // Saltar cerca de la semana objetivo: día ~(week-1)*7 del año, luego buscar ±14 días
  const estimado = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7, 12, 0, 0));
  for (let offset = -14; offset <= 14; offset++) {
    const dt = new Date(estimado);
    dt.setUTCDate(dt.getUTCDate() + offset);
    const info = obtenerSemanaLaboral(dt);
    if (info.codigo === codigo) return info;
  }
  return null;
}

function obtenerNumeroSemana(date) {
  // Input siempre es mediodía UTC — usar UTC methods para ser explícito
  const firstDayOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getUTCDay() + 1) / 7);
}

/**
 * Obtiene todas las semanas con registros
 */
function obtenerSemanasConRegistros(estadoPago = 'pendiente', fuente = null) {
  const semanas = {};
  
  let registrosFiltrados = registros;
  if (estadoPago !== 'todos') {
    registrosFiltrados = registros.filter(r => (r.estadoPago || 'pendiente') === estadoPago);
  }
  
  // Filtrar por fuente: si se especifica, filtrar; si no, excluir encargada (default)
  if (fuente) {
    registrosFiltrados = registrosFiltrados.filter(r => (r.fuente || 'operaria') === fuente);
  } else {
    registrosFiltrados = registrosFiltrados.filter(r => (r.fuente || 'operaria') !== 'encargada');
  }
  
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
  const { estado, fuente } = req.query;
  const semanas = obtenerSemanasConRegistros(estado || 'pendiente', fuente || null);
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
    const f = toMexicoYMD(new Date(r.fecha));
    
    const estadoMatch = estadoPago ? (r.estadoPago || 'pendiente') === estadoPago : true;
    
    // Si se especifica fuente, filtrar por ella; si no, excluir encargada (default)
    let fuenteMatch;
    if (fuente) {
      fuenteMatch = (r.fuente || 'operaria') === fuente;
    } else {
      fuenteMatch = (r.fuente || 'operaria') !== 'encargada';
    }

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
    const fecha = toMexicoYMD(new Date(reg.fecha));
    
    if (!registrosPorDia[fecha]) {
      const dParts = toMexicoParts(new Date(fecha + 'T12:00:00Z'));
      registrosPorDia[fecha] = {
        fecha,
        dia: diasSemana[dParts.dow],
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
      talla: reg.talla || null,
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
    fechaPago: toMexicoYMD(new Date()),
    registrosPorDia: registrosPorDiaArray,
    resumen: {
      totalPiezas,
      totalRegistros: registrosSemana.length,
      diasTrabajados,
      totalPagar
    }
  });
});

// (Ruta duplicada /api/reporte-semanal eliminada — la definición activa está más arriba)

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
  
  // Filtrar registros de esa semana — comparar en hora México
  let registrosAMarcar = registros.filter(r => {
    const fechaReg = toMexicoYMD(new Date(r.fecha));
    const enSemana = fechaReg >= semanaInfo.inicio && fechaReg <= semanaInfo.fin;
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
  const fechaPago = toMexicoYMD(new Date());
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
  // Input siempre es "YYYY-MM-DD" — parsear directo sin depender del TZ del servidor
  const parts = String(fechaStr).split('-');
  return `${Number(parts[2])} ${meses[Number(parts[1]) - 1]}`;
}

// =========================
// INICIAR SERVIDOR
// =========================

/**
 * GET /api/debug-semana?codigo=2026-W08
 * Diagnostico para verificar qué registros hay y por qué no se marcan
 */
app.get("/api/debug-semana", (req, res) => {
  const { codigo } = req.query;
  if (!codigo) return res.status(400).json({ error: "Falta ?codigo=YYYY-WNN" });

  const semanaInfo = resolverSemanaPorCodigo(String(codigo));
  if (!semanaInfo) return res.status(400).json({ error: "Código inválido" });

  const pendientes = registros.filter(r => (r.estadoPago || "pendiente") === "pendiente");

  const analisis = pendientes.map(r => {
    const fechaMx = toMexicoYMD(new Date(r.fecha));
    const semanaReg = obtenerSemanaLaboral(r.fecha);
    const enRangoPorFecha = fechaMx >= semanaInfo.inicio && fechaMx <= semanaInfo.fin;
    const enRangoPorCodigo = semanaReg.codigo === codigo;
    return {
      id: r.id,
      fechaISO: r.fecha,
      fechaMexico: fechaMx,
      semanaCodigo: semanaReg.codigo,
      semanaInicio: semanaReg.inicio,
      semanaFin: semanaReg.fin,
      filtroFechaMatch: enRangoPorFecha,
      filtroCodigoMatch: enRangoPorCodigo,
      estadoPago: r.estadoPago,
      fuente: r.fuente || "operaria",
      operariaId: r.operariaId,
      descripcion: r.descripcion,
      cantidad: r.cantidad
    };
  });

  const enEstaSemana = analisis.filter(a => a.filtroCodigoMatch);
  const noMatch = analisis.filter(a => a.filtroCodigoMatch && !a.filtroFechaMatch);

  res.json({
    semana: { codigo, inicio: semanaInfo.inicio, fin: semanaInfo.fin },
    totalPendientes: pendientes.length,
    enEstaSemana: enEstaSemana.length,
    discrepancias: noMatch.length,
    registros: enEstaSemana,
    discrepanciasDetalle: noMatch
  });
});

// ==========================================================================
// MEJORA AGREGADA — Bloque de mejoras 12 a 16
//   12. Exportar a Excel real (.xlsx) sin librerías externas
//   13. Resumen para el Dashboard
//   14. Alertas de pedidos
//   15. Editar catálogos (con renombrado en cascada) y evitar duplicados
//   16. Avisar en cuántos pedidos se usa algo antes de eliminarlo
// Todo es aditivo: no reemplaza ni modifica endpoints existentes.
// ==========================================================================

// ---------- Generador de .xlsx (solo módulos nativos de Node) ----------
const zlibXlsx = require("zlib");

const TABLA_CRC32_XLSX = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32Xlsx(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ TABLA_CRC32_XLSX[(c ^ buf[i]) & 0xFF];
  return (c ^ -1) >>> 0;
}

function crearZipXlsx(archivos) {
  const locales = [], centrales = [];
  let offset = 0;
  for (const a of archivos) {
    const nombreBuf = Buffer.from(a.nombre, "utf8");
    const contenido = Buffer.isBuffer(a.contenido) ? a.contenido : Buffer.from(a.contenido, "utf8");
    const comprimido = zlibXlsx.deflateRawSync(contenido, { level: 9 });
    const crc = crc32Xlsx(contenido);

    const cabLocal = Buffer.alloc(30);
    cabLocal.writeUInt32LE(0x04034b50, 0);
    cabLocal.writeUInt16LE(20, 4);
    cabLocal.writeUInt16LE(0x0800, 6);
    cabLocal.writeUInt16LE(8, 8);
    cabLocal.writeUInt16LE(0, 10);
    cabLocal.writeUInt16LE(0x2100, 12);
    cabLocal.writeUInt32LE(crc, 14);
    cabLocal.writeUInt32LE(comprimido.length, 18);
    cabLocal.writeUInt32LE(contenido.length, 22);
    cabLocal.writeUInt16LE(nombreBuf.length, 26);
    cabLocal.writeUInt16LE(0, 28);
    locales.push(cabLocal, nombreBuf, comprimido);

    const cabCentral = Buffer.alloc(46);
    cabCentral.writeUInt32LE(0x02014b50, 0);
    cabCentral.writeUInt16LE(20, 4);
    cabCentral.writeUInt16LE(20, 6);
    cabCentral.writeUInt16LE(0x0800, 8);
    cabCentral.writeUInt16LE(8, 10);
    cabCentral.writeUInt16LE(0, 12);
    cabCentral.writeUInt16LE(0x2100, 14);
    cabCentral.writeUInt32LE(crc, 16);
    cabCentral.writeUInt32LE(comprimido.length, 20);
    cabCentral.writeUInt32LE(contenido.length, 24);
    cabCentral.writeUInt16LE(nombreBuf.length, 28);
    cabCentral.writeUInt16LE(0, 30);
    cabCentral.writeUInt16LE(0, 32);
    cabCentral.writeUInt16LE(0, 34);
    cabCentral.writeUInt16LE(0, 36);
    cabCentral.writeUInt32LE(0, 38);
    cabCentral.writeUInt32LE(offset, 42);
    centrales.push(cabCentral, nombreBuf);
    offset += cabLocal.length + nombreBuf.length + comprimido.length;
  }
  const cuerpo = Buffer.concat(locales);
  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(0, 4);
  fin.writeUInt16LE(0, 6);
  fin.writeUInt16LE(archivos.length, 8);
  fin.writeUInt16LE(archivos.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(cuerpo.length, 16);
  fin.writeUInt16LE(0, 20);
  return Buffer.concat([cuerpo, directorio, fin]);
}

function escXml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
}

function letraCol(n) {
  let s = "";
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * hojas = [{ nombre, columnas:[{titulo, ancho, tipo:"moneda"|undefined}], filas:[[...]] }]
 */
function construirXlsx(hojas) {
  const partes = [];

  partes.push({
    nombre: "[Content_Types].xml",
    contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      hojas.map((h, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
      '</Types>'
  });

  partes.push({
    nombre: "_rels/.rels",
    contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>'
  });

  partes.push({
    nombre: "xl/workbook.xml",
    contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      hojas.map((h, i) => `<sheet name="${escXml((h.nombre || ("Hoja" + (i + 1))).slice(0, 31).replace(/[\\\/\?\*\[\]:]/g, " "))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
      '</sheets></workbook>'
  });

  partes.push({
    nombre: "xl/_rels/workbook.xml.rels",
    contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      hojas.map((h, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
      `<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      '</Relationships>'
  });

  partes.push({
    nombre: "xl/styles.xml",
    contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00"/></numFmts>' +
      '<fonts count="2"><font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>' +
      '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts>' +
      '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
      '<fill><patternFill patternType="gray125"/></fill>' +
      '<fill><patternFill patternType="solid"><fgColor rgb="FF2563EB"/><bgColor indexed="64"/></patternFill></fill></fills>' +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      '<cellXfs count="4">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '<xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
      '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'
  });

  hojas.forEach((hoja, indice) => {
    const columnas = hoja.columnas || [];
    const filas = hoja.filas || [];
    const cols = columnas.length
      ? "<cols>" + columnas.map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${Number(c.ancho) || 16}" customWidth="1"/>`).join("") + "</cols>"
      : "";

    const lineas = [];
    if (columnas.length) {
      lineas.push(`<row r="1" ht="22" customHeight="1">` + columnas.map((c, i) =>
        `<c r="${letraCol(i + 1)}1" s="1" t="inlineStr"><is><t>${escXml(c.titulo)}</t></is></c>`).join("") + `</row>`);
    }
    filas.forEach((fila, fi) => {
      const numFila = fi + (columnas.length ? 2 : 1);
      const celdas = fila.map((valor, ci) => {
        const ref = letraCol(ci + 1) + numFila;
        if (valor === null || valor === undefined || valor === "") return "";
        const meta = columnas[ci] || {};
        if (typeof valor === "number" && isFinite(valor)) {
          return `<c r="${ref}"${meta.tipo === "moneda" ? ' s="2"' : ""}><v>${valor}</v></c>`;
        }
        return `<c r="${ref}" t="inlineStr"><is><t>${escXml(valor)}</t></is></c>`;
      }).join("");
      lineas.push(`<row r="${numFila}">${celdas}</row>`);
    });

    const ultimaCol = letraCol(Math.max(1, columnas.length || 1));
    const ultimaFila = filas.length + (columnas.length ? 1 : 0);
    partes.push({
      nombre: `xl/worksheets/sheet${indice + 1}.xml`,
      contenido: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        (columnas.length ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : "") +
        cols + "<sheetData>" + lineas.join("") + "</sheetData>" +
        (columnas.length && filas.length ? `<autoFilter ref="A1:${ultimaCol}${ultimaFila}"/>` : "") +
        "</worksheet>"
    });
  });

  return crearZipXlsx(partes);
}

function nombreArchivoSeguro(base) {
  return String(base).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\-\. ]/g, "").replace(/\s+/g, "_").slice(0, 80);
}

function enviarXlsx(res, nombreBase, hojas) {
  const buffer = construirXlsx(hojas);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivoSeguro(nombreBase)}.xlsx"`);
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Cache-Control", "no-store");
  res.end(buffer);
}

// Helpers de apoyo
function rolDe(req) { return (req.sesion && req.sesion.tipo) || null; }
function puedeVerMontos(req) {
  // Espeja exactamente lo que ya muestra cada pantalla:
  // el admin ve todo; la operaria ve lo suyo; la encargada NUNCA ve montos.
  const t = rolDe(req);
  return t === "admin" || t === "operaria";
}
function nombreOperaria(id) {
  const o = operarias.find(x => x.id === Number(id));
  return o ? o.nombre : "N/D";
}
function nombrePrenda(id) {
  const p = prendas.find(x => x.id === Number(id));
  return p ? p.nombre : "";
}
function fechaCorta(iso) {
  try { return toMexicoYMD(new Date(iso)); } catch (e) { return ""; }
}

/** Calcula piezas hechas y totales de un pedido, ignorando operaciones sin precio */
function resumenAvancePedido(pedido) {
  let piezasMeta = 0, piezasHechas = 0, opsConPrecio = 0, opsCompletas = 0;
  (pedido.items || []).forEach(item => {
    const cantidadItem = Number(item.cantidad) || 0;
    (item.operaciones || []).forEach(op => {
      if (!(Number(op.precio) > 0)) return; // misma regla que ya usa la pantalla de Avance
      opsConPrecio++;
      piezasMeta += cantidadItem;
      const hechas = registros
        .filter(r => r.pedidoId === pedido.id && r.operacionId === op.opId)
        .reduce((s, r) => s + Number(r.cantidad || 0), 0);
      const acotadas = Math.min(hechas, cantidadItem);
      piezasHechas += acotadas;
      if (cantidadItem > 0 && acotadas >= cantidadItem) opsCompletas++;
    });
  });
  const porcentaje = piezasMeta > 0 ? Math.round((piezasHechas / piezasMeta) * 100) : 0;
  return { piezasMeta, piezasHechas, porcentaje, opsConPrecio, opsCompletas };
}

// ==========================================================================
// PUNTO 12 — EXPORTAR A EXCEL
// ==========================================================================

/**
 * GET /api/exportar/reporte-semanal?semana=YYYY-WNN&fuente=&estadoPago=&operariaId=
 * Admin: resumen por operaria + detalle, con montos.
 * Operaria: solo sus propios registros, con montos (ya los ve en pantalla).
 * Encargada: solo piezas, SIN montos (igual que su vista).
 */
app.get("/api/exportar/reporte-semanal", (req, res) => {
  try {
    let { semana, fecha, fuente, estadoPago, estado, operariaId } = req.query;
    if (!estadoPago && estado) estadoPago = estado;

    const rol = rolDe(req);
    const conMontos = puedeVerMontos(req);

    let estadoFiltro = estadoPago || "pendiente";
    let fuenteFiltro = fuente || "operaria";
    let opId = operariaId ? Number(operariaId) : null;

    // La operaria solo puede exportar lo suyo
    if (rol === "operaria" && req.sesion && req.sesion.id) opId = Number(req.sesion.id);
    // La encargada consulta su propia base, igual que su pantalla
    if (rol === "encargada") { fuenteFiltro = "encargada"; estadoFiltro = "todos"; }

    let inicioStr, finStr, etiqueta;
    if (semana) {
      const info = resolverSemanaPorCodigo(String(semana));
      if (!info) return res.status(400).json({ error: "Semana inválida" });
      inicioStr = info.inicio; finStr = info.fin; etiqueta = String(semana);
    } else if (fecha) {
      const info = obtenerSemanaLaboral(fecha);
      inicioStr = info.inicio; finStr = info.fin; etiqueta = info.codigo || String(fecha);
    } else {
      return res.status(400).json({ error: "Semana o fecha requerida" });
    }

    const dentro = registros.filter(r => {
      const f = fechaCorta(r.fecha);
      if (f < inicioStr || f > finStr) return false;
      if (estadoFiltro !== "todos" && (r.estadoPago || "pendiente") !== estadoFiltro) return false;
      if (fuenteFiltro !== "todos" && (r.fuente || "operaria") !== fuenteFiltro) return false;
      if (opId && r.operariaId !== opId) return false;
      return true;
    });

    // Hoja 1: resumen por operaria
    const porOperaria = {};
    dentro.forEach(r => {
      if (!porOperaria[r.operariaId]) {
        porOperaria[r.operariaId] = { nombre: nombreOperaria(r.operariaId), piezas: 0, ganado: 0, registros: 0 };
      }
      porOperaria[r.operariaId].piezas += Number(r.cantidad || 0);
      porOperaria[r.operariaId].ganado += Number(r.totalGanado || 0);
      porOperaria[r.operariaId].registros += 1;
    });

    const colsResumen = conMontos
      ? [{ titulo: "Operaria", ancho: 28 }, { titulo: "Piezas", ancho: 12 }, { titulo: "Registros", ancho: 12 }, { titulo: "Total a pagar", ancho: 16, tipo: "moneda" }]
      : [{ titulo: "Operaria", ancho: 28 }, { titulo: "Piezas", ancho: 12 }, { titulo: "Registros", ancho: 12 }];

    const filasResumen = Object.values(porOperaria)
      .sort((a, b) => b.piezas - a.piezas)
      .map(o => conMontos
        ? [o.nombre, o.piezas, o.registros, Number(o.ganado.toFixed(2))]
        : [o.nombre, o.piezas, o.registros]);

    // Fila de totales
    if (filasResumen.length) {
      const totPiezas = filasResumen.reduce((s, f) => s + f[1], 0);
      const totRegs = filasResumen.reduce((s, f) => s + f[2], 0);
      filasResumen.push(conMontos
        ? ["TOTAL", totPiezas, totRegs, Number(filasResumen.reduce((s, f) => s + (f[3] || 0), 0).toFixed(2))]
        : ["TOTAL", totPiezas, totRegs]);
    }

    // Hoja 2: detalle
    const colsDetalle = [
      { titulo: "Fecha", ancho: 12 },
      { titulo: "Operaria", ancho: 26 },
      { titulo: "Escuela", ancho: 26 },
      { titulo: "Folio", ancho: 14 },
      { titulo: "Prenda", ancho: 20 },
      { titulo: "Operación", ancho: 24 },
      { titulo: "Máquina", ancho: 16 },
      { titulo: "Talla", ancho: 10 },
      { titulo: "Piezas", ancho: 10 }
    ];
    if (conMontos) {
      colsDetalle.push({ titulo: "Precio x pieza", ancho: 15, tipo: "moneda" });
      colsDetalle.push({ titulo: "Total", ancho: 14, tipo: "moneda" });
    }
    colsDetalle.push({ titulo: "Estado de pago", ancho: 16 });
    colsDetalle.push({ titulo: "Registrado por", ancho: 16 });

    const filasDetalle = dentro
      .slice()
      .sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
      .map(r => {
        const ped = pedidos.find(p => p.id === r.pedidoId);
        const base = [
          fechaCorta(r.fecha),
          nombreOperaria(r.operariaId),
          ped ? ped.escuela : "",
          ped ? ped.folio : "",
          nombrePrenda(r.prendaId),
          r.descripcion || "",
          r.maquina || "",
          r.talla || "",
          Number(r.cantidad || 0)
        ];
        if (conMontos) {
          base.push(Number(Number(r.pagoPorPieza || 0).toFixed(2)));
          base.push(Number(Number(r.totalGanado || 0).toFixed(2)));
        }
        base.push(r.estadoPago === "pagado" ? "Pagado" : "Pendiente");
        base.push((r.fuente || "operaria") === "encargada" ? "Encargada" : "Operaria");
        return base;
      });

    const hojas = [
      { nombre: "Resumen por operaria", columnas: colsResumen, filas: filasResumen },
      { nombre: "Detalle", columnas: colsDetalle, filas: filasDetalle }
    ];

    return enviarXlsx(res, `Reporte_semanal_${etiqueta}`, hojas);
  } catch (e) {
    console.error("Error exportando reporte semanal:", e.message || e);
    return res.status(500).json({ error: "No se pudo generar el Excel." });
  }
});

/**
 * GET /api/exportar/reporte-anual?anio=YYYY  (solo admin, lleva montos)
 */
app.get("/api/exportar/reporte-anual", (req, res) => {
  try {
    const anio = Number(req.query.anio) || new Date().getFullYear();
    const conMontos = puedeVerMontos(req);

    const delAnio = registros.filter(r => {
      const f = fechaCorta(r.fecha);
      return f && Number(f.slice(0, 4)) === anio;
    });

    // Por mes
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const porMes = {};
    delAnio.forEach(r => {
      const m = Number(fechaCorta(r.fecha).slice(5, 7));
      if (!porMes[m]) porMes[m] = { piezas: 0, ganado: 0, registros: 0 };
      porMes[m].piezas += Number(r.cantidad || 0);
      porMes[m].ganado += Number(r.totalGanado || 0);
      porMes[m].registros += 1;
    });

    const colsMes = conMontos
      ? [{ titulo: "Mes", ancho: 16 }, { titulo: "Piezas", ancho: 12 }, { titulo: "Registros", ancho: 12 }, { titulo: "Nómina", ancho: 16, tipo: "moneda" }]
      : [{ titulo: "Mes", ancho: 16 }, { titulo: "Piezas", ancho: 12 }, { titulo: "Registros", ancho: 12 }];
    const filasMes = [];
    for (let m = 1; m <= 12; m++) {
      const d = porMes[m] || { piezas: 0, ganado: 0, registros: 0 };
      filasMes.push(conMontos
        ? [meses[m - 1], d.piezas, d.registros, Number(d.ganado.toFixed(2))]
        : [meses[m - 1], d.piezas, d.registros]);
    }

    // Por operaria
    const porOp = {};
    delAnio.forEach(r => {
      if (!porOp[r.operariaId]) porOp[r.operariaId] = { nombre: nombreOperaria(r.operariaId), piezas: 0, ganado: 0 };
      porOp[r.operariaId].piezas += Number(r.cantidad || 0);
      porOp[r.operariaId].ganado += Number(r.totalGanado || 0);
    });
    const colsOp = conMontos
      ? [{ titulo: "Operaria", ancho: 28 }, { titulo: "Piezas", ancho: 12 }, { titulo: "Total del año", ancho: 16, tipo: "moneda" }]
      : [{ titulo: "Operaria", ancho: 28 }, { titulo: "Piezas", ancho: 12 }];
    const filasOp = Object.values(porOp).sort((a, b) => b.piezas - a.piezas)
      .map(o => conMontos ? [o.nombre, o.piezas, Number(o.ganado.toFixed(2))] : [o.nombre, o.piezas]);

    return enviarXlsx(res, `Reporte_anual_${anio}`, [
      { nombre: "Por mes", columnas: colsMes, filas: filasMes },
      { nombre: "Por operaria", columnas: colsOp, filas: filasOp }
    ]);
  } catch (e) {
    console.error("Error exportando reporte anual:", e.message || e);
    return res.status(500).json({ error: "No se pudo generar el Excel." });
  }
});

/**
 * GET /api/exportar/pedidos?estado=activo|terminado|todos
 * Admin y encargada. Los montos solo se incluyen para el admin.
 */
app.get("/api/exportar/pedidos", (req, res) => {
  try {
    const estado = String(req.query.estado || "todos");
    const conMontos = puedeVerMontos(req);
    const lista = pedidos.filter(p => estado === "todos" ? true : (p.estado || "activo") === estado);

    const colsPed = [
      { titulo: "Folio", ancho: 14 },
      { titulo: "Escuela", ancho: 30 },
      { titulo: "Estado", ancho: 14 },
      { titulo: "Fecha de entrega", ancho: 16 },
      { titulo: "Piezas meta", ancho: 12 },
      { titulo: "Piezas hechas", ancho: 14 },
      { titulo: "Avance %", ancho: 10 },
      { titulo: "Operaciones completas", ancho: 20 }
    ];
    if (conMontos) colsPed.push({ titulo: "Nómina generada", ancho: 17, tipo: "moneda" });

    const filasPed = lista.map(p => {
      const av = resumenAvancePedido(p);
      const nomina = registros.filter(r => r.pedidoId === p.id).reduce((s, r) => s + Number(r.totalGanado || 0), 0);
      const fila = [
        p.folio || "", p.escuela || "",
        (p.estado || "activo") === "terminado" ? "Terminado" : "Activo",
        p.fechaEntrega ? String(p.fechaEntrega).slice(0, 10) : "",
        av.piezasMeta, av.piezasHechas, av.porcentaje,
        `${av.opsCompletas} de ${av.opsConPrecio}`
      ];
      if (conMontos) fila.push(Number(nomina.toFixed(2)));
      return fila;
    });

    // Hoja de operaciones por pedido
    const colsOps = [
      { titulo: "Folio", ancho: 14 },
      { titulo: "Escuela", ancho: 26 },
      { titulo: "Prenda", ancho: 20 },
      { titulo: "Operación", ancho: 24 },
      { titulo: "Máquina", ancho: 16 },
      { titulo: "Piezas meta", ancho: 12 },
      { titulo: "Piezas hechas", ancho: 14 },
      { titulo: "Avance %", ancho: 10 }
    ];
    if (conMontos) colsOps.push({ titulo: "Precio x pieza", ancho: 15, tipo: "moneda" });

    const filasOps = [];
    lista.forEach(p => {
      (p.items || []).forEach(item => {
        const cant = Number(item.cantidad) || 0;
        (item.operaciones || []).forEach(op => {
          if (!(Number(op.precio) > 0)) return; // consistente con la pantalla de Avance
          const hechas = registros.filter(r => r.pedidoId === p.id && r.operacionId === op.opId)
            .reduce((s, r) => s + Number(r.cantidad || 0), 0);
          const fila = [
            p.folio || "", p.escuela || "", nombrePrenda(item.prendaId),
            op.costura || op.descripcion || "", op.maquina || "",
            cant, Math.min(hechas, cant),
            cant > 0 ? Math.round((Math.min(hechas, cant) / cant) * 100) : 0
          ];
          if (conMontos) fila.push(Number(Number(op.precio || 0).toFixed(2)));
          filasOps.push(fila);
        });
      });
    });

    return enviarXlsx(res, `Pedidos_${estado}`, [
      { nombre: "Pedidos", columnas: colsPed, filas: filasPed },
      { nombre: "Operaciones", columnas: colsOps, filas: filasOps }
    ]);
  } catch (e) {
    console.error("Error exportando pedidos:", e.message || e);
    return res.status(500).json({ error: "No se pudo generar el Excel." });
  }
});

/**
 * GET /api/exportar/catalogos  (solo admin: la pantalla de Configuración ya es solo suya)
 */
app.get("/api/exportar/catalogos", (req, res) => {
  try {
    const usoMaquina = (nombre) => {
      let n = 0;
      pedidos.forEach(p => (p.items || []).forEach(i => (i.operaciones || []).forEach(o => {
        if (String(o.maquina || "").trim().toLowerCase() === String(nombre).trim().toLowerCase()) n++;
      })));
      return n;
    };
    const usoCostura = (nombre) => {
      let n = 0;
      pedidos.forEach(p => (p.items || []).forEach(i => (i.operaciones || []).forEach(o => {
        const t = o.costura || o.descripcion || "";
        if (String(t).trim().toLowerCase() === String(nombre).trim().toLowerCase()) n++;
      })));
      return n;
    };

    const hojas = [
      {
        nombre: "Maquinas",
        columnas: [{ titulo: "Máquina", ancho: 26 }, { titulo: "Veces usada en pedidos", ancho: 22 }],
        filas: (maquinas || []).map(m => [m, usoMaquina(m)])
      },
      {
        nombre: "Prendas",
        columnas: [{ titulo: "ID", ancho: 8 }, { titulo: "Prenda", ancho: 30 }, { titulo: "Pedidos que la usan", ancho: 20 }],
        filas: (prendas || []).map(p => [
          p.id, p.nombre,
          pedidos.filter(pe => (pe.items || []).some(i => Number(i.prendaId) === Number(p.id))).length
        ])
      },
      {
        nombre: "Costuras",
        columnas: [{ titulo: "Costura", ancho: 30 }, { titulo: "Veces usada en pedidos", ancho: 22 }],
        filas: (costuras || []).map(c => {
          const nombre = typeof c === "string" ? c : (c && c.nombre) || "";
          return [nombre, usoCostura(nombre)];
        })
      },
      {
        nombre: "Operarias",
        columnas: [{ titulo: "ID", ancho: 8 }, { titulo: "Nombre", ancho: 30 }, { titulo: "Usuario", ancho: 18 }, { titulo: "Rol", ancho: 14 }, { titulo: "Activa", ancho: 10 }],
        filas: (operarias || []).map(o => [o.id, o.nombre, o.usuario || "", o.rol || "operaria", o.activa === false ? "No" : "Sí"])
      }
    ];

    // Plantillas de costuras por prenda
    const filasPlt = [];
    Object.keys(plantillasCosturas || {}).forEach(prendaId => {
      const lista = plantillasCosturas[prendaId] || [];
      lista.forEach(item => {
        filasPlt.push([nombrePrenda(prendaId) || `Prenda ${prendaId}`, item.costura || "", item.maquina || ""]);
      });
    });
    hojas.push({
      nombre: "Plantillas por prenda",
      columnas: [{ titulo: "Prenda", ancho: 26 }, { titulo: "Costura", ancho: 26 }, { titulo: "Máquina", ancho: 18 }],
      filas: filasPlt
    });

    return enviarXlsx(res, "Catalogos", hojas);
  } catch (e) {
    console.error("Error exportando catálogos:", e.message || e);
    return res.status(500).json({ error: "No se pudo generar el Excel." });
  }
});

/**
 * GET /api/exportar/produccion?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&operariaId=&pedidoId=
 * Historial completo de registros. Montos solo para admin/operaria.
 */
app.get("/api/exportar/produccion", (req, res) => {
  try {
    const { desde, hasta, pedidoId } = req.query;
    const rol = rolDe(req);
    const conMontos = puedeVerMontos(req);
    let opId = req.query.operariaId ? Number(req.query.operariaId) : null;
    if (rol === "operaria" && req.sesion && req.sesion.id) opId = Number(req.sesion.id);

    const lista = registros.filter(r => {
      const f = fechaCorta(r.fecha);
      if (desde && f < String(desde)) return false;
      if (hasta && f > String(hasta)) return false;
      if (opId && r.operariaId !== opId) return false;
      if (pedidoId && r.pedidoId !== Number(pedidoId)) return false;
      return true;
    }).sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));

    const cols = [
      { titulo: "Fecha", ancho: 12 },
      { titulo: "Operaria", ancho: 26 },
      { titulo: "Escuela", ancho: 26 },
      { titulo: "Folio", ancho: 14 },
      { titulo: "Prenda", ancho: 20 },
      { titulo: "Operación", ancho: 24 },
      { titulo: "Máquina", ancho: 16 },
      { titulo: "Talla", ancho: 10 },
      { titulo: "Piezas", ancho: 10 }
    ];
    if (conMontos) {
      cols.push({ titulo: "Precio x pieza", ancho: 15, tipo: "moneda" });
      cols.push({ titulo: "Total", ancho: 14, tipo: "moneda" });
    }
    cols.push({ titulo: "Estado de pago", ancho: 16 });
    cols.push({ titulo: "Registrado por", ancho: 16 });

    const filas = lista.map(r => {
      const ped = pedidos.find(p => p.id === r.pedidoId);
      const base = [
        fechaCorta(r.fecha), nombreOperaria(r.operariaId),
        ped ? ped.escuela : "", ped ? ped.folio : "",
        nombrePrenda(r.prendaId), r.descripcion || "", r.maquina || "",
        r.talla || "", Number(r.cantidad || 0)
      ];
      if (conMontos) {
        base.push(Number(Number(r.pagoPorPieza || 0).toFixed(2)));
        base.push(Number(Number(r.totalGanado || 0).toFixed(2)));
      }
      base.push(r.estadoPago === "pagado" ? "Pagado" : "Pendiente");
      base.push((r.fuente || "operaria") === "encargada" ? "Encargada" : "Operaria");
      return base;
    });

    const etiqueta = [desde || "inicio", hasta || "hoy"].join("_a_");
    return enviarXlsx(res, `Produccion_${etiqueta}`, [
      { nombre: "Produccion", columnas: cols, filas }
    ]);
  } catch (e) {
    console.error("Error exportando producción:", e.message || e);
    return res.status(500).json({ error: "No se pudo generar el Excel." });
  }
});

// ==========================================================================
// PUNTO 13 — RESUMEN PARA EL DASHBOARD
// ==========================================================================

/**
 * GET /api/dashboard/resumen
 * Tarjetas: producción de hoy, pedidos por terminar, producción de la semana.
 * NO devuelve montos para ningún rol (así la encargada puede usarlo sin problema).
 */
app.get("/api/dashboard/resumen", (req, res) => {
  try {
    const rol = rolDe(req);
    const hoyStr = toMexicoYMD(new Date());

    // La operaria solo ve lo suyo
    const propios = (r) => (rol === "operaria" && req.sesion && req.sesion.id)
      ? r.operariaId === Number(req.sesion.id) : true;

    // --- Producción de hoy ---
    const deHoy = registros.filter(r => fechaCorta(r.fecha) === hoyStr && propios(r));
    const piezasHoy = deHoy.reduce((s, r) => s + Number(r.cantidad || 0), 0);
    const operariasHoy = new Set(deHoy.map(r => r.operariaId)).size;

    // --- Producción de la semana en curso vs la anterior ---
    const semActual = obtenerSemanaLaboral(new Date().toISOString());
    const piezasEnRango = (inicio, fin) => registros
      .filter(r => { const f = fechaCorta(r.fecha); return f >= inicio && f <= fin && propios(r); })
      .reduce((s, r) => s + Number(r.cantidad || 0), 0);

    const piezasSemana = piezasEnRango(semActual.inicio, semActual.fin);

    // Semana anterior: un día antes del inicio de la actual
    const antes = new Date(semActual.inicio + "T12:00:00");
    antes.setDate(antes.getDate() - 1);
    const semPrevia = obtenerSemanaLaboral(antes.toISOString());
    const piezasSemanaPrevia = piezasEnRango(semPrevia.inicio, semPrevia.fin);

    let variacion = null;
    if (piezasSemanaPrevia > 0) {
      variacion = Math.round(((piezasSemana - piezasSemanaPrevia) / piezasSemanaPrevia) * 100);
    }

    // --- Pedidos por terminar ---
    const activos = pedidos.filter(p => (p.estado || "activo") !== "terminado");
    const casiListos = [];
    activos.forEach(p => {
      const av = resumenAvancePedido(p);
      if (av.porcentaje >= 90 && av.piezasMeta > 0) {
        casiListos.push({ id: p.id, folio: p.folio, escuela: p.escuela, porcentaje: av.porcentaje });
      }
    });
    casiListos.sort((a, b) => b.porcentaje - a.porcentaje);

    return res.json({
      ok: true,
      hoy: {
        fecha: hoyStr,
        piezas: piezasHoy,
        operariasActivas: operariasHoy,
        registros: deHoy.length
      },
      semana: {
        codigo: semActual.codigo,
        inicio: semActual.inicio,
        fin: semActual.fin,
        piezas: piezasSemana,
        piezasSemanaPrevia,
        variacionPorcentaje: variacion
      },
      pedidos: {
        activos: activos.length,
        porTerminar: casiListos.length,
        listaPorTerminar: casiListos.slice(0, 5)
      }
    });
  } catch (e) {
    console.error("Error en resumen de dashboard:", e.message || e);
    return res.status(500).json({ ok: false, error: "No se pudo calcular el resumen." });
  }
});

// ==========================================================================
// PUNTO 14 — ALERTAS
// ==========================================================================

/**
 * GET /api/alertas
 * Avisos de: pedido vencido, pedido por vencer (3 días), pedido casi terminado (>=90%),
 * y operación sin precio capturado en pedidos activos.
 * No incluye montos, así que sirve para los tres roles.
 */
app.get("/api/alertas", (req, res) => {
  try {
    const rol = rolDe(req);
    const hoyStr = toMexicoYMD(new Date());
    const avisos = [];

    const enDias = (ymd) => {
      const a = new Date(hoyStr + "T12:00:00");
      const b = new Date(String(ymd).slice(0, 10) + "T12:00:00");
      return Math.round((b - a) / 86400000);
    };

    const activos = pedidos.filter(p => (p.estado || "activo") !== "terminado");

    activos.forEach(p => {
      const av = resumenAvancePedido(p);

      // Fechas de entrega (solo si el pedido tiene fecha capturada)
      if (p.fechaEntrega) {
        const dias = enDias(p.fechaEntrega);
        if (dias < 0) {
          avisos.push({
            tipo: "pedido_vencido", prioridad: "alta", pedidoId: p.id,
            titulo: `Pedido vencido: ${p.escuela}`,
            detalle: `Folio ${p.folio} · se venció hace ${Math.abs(dias)} día(s) · avance ${av.porcentaje}%`
          });
        } else if (dias <= 3) {
          avisos.push({
            tipo: "pedido_por_vencer", prioridad: "media", pedidoId: p.id,
            titulo: `Entrega cerca: ${p.escuela}`,
            detalle: dias === 0
              ? `Folio ${p.folio} · se entrega HOY · avance ${av.porcentaje}%`
              : `Folio ${p.folio} · faltan ${dias} día(s) · avance ${av.porcentaje}%`
          });
        }
      }

      // Casi terminado
      if (av.piezasMeta > 0 && av.porcentaje >= 90 && av.porcentaje < 100) {
        avisos.push({
          tipo: "pedido_casi_listo", prioridad: "baja", pedidoId: p.id,
          titulo: `Casi listo: ${p.escuela}`,
          detalle: `Folio ${p.folio} · ${av.porcentaje}% · faltan ${av.piezasMeta - av.piezasHechas} pieza(s)`
        });
      }
      // Terminado al 100% pero sin cerrar
      if (av.piezasMeta > 0 && av.porcentaje >= 100) {
        avisos.push({
          tipo: "pedido_completo_sin_cerrar", prioridad: "media", pedidoId: p.id,
          titulo: `Listo para cerrar: ${p.escuela}`,
          detalle: `Folio ${p.folio} · producción al 100%, sigue marcado como activo`
        });
      }

      // Operaciones sin precio (solo para quien administra precios)
      if (rol === "admin" || rol === "encargada") {
        let sinPrecio = 0;
        (p.items || []).forEach(i => (i.operaciones || []).forEach(o => {
          if (!(Number(o.precio) > 0)) sinPrecio++;
        }));
        if (sinPrecio > 0) {
          avisos.push({
            tipo: "operacion_sin_precio", prioridad: "media", pedidoId: p.id,
            titulo: `Falta capturar precio: ${p.escuela}`,
            detalle: `Folio ${p.folio} · ${sinPrecio} operación(es) en $0, no cuentan para el avance ni para la nómina`
          });
        }
      }
    });

    const orden = { alta: 0, media: 1, baja: 2 };
    avisos.sort((a, b) => orden[a.prioridad] - orden[b.prioridad]);

    return res.json({
      ok: true,
      total: avisos.length,
      porPrioridad: {
        alta: avisos.filter(a => a.prioridad === "alta").length,
        media: avisos.filter(a => a.prioridad === "media").length,
        baja: avisos.filter(a => a.prioridad === "baja").length
      },
      alertas: avisos
    });
  } catch (e) {
    console.error("Error calculando alertas:", e.message || e);
    return res.status(500).json({ ok: false, error: "No se pudieron calcular las alertas." });
  }
});

// ==========================================================================
// PUNTOS 15 y 16 — EDITAR CATÁLOGOS Y VER DÓNDE SE USAN
// ==========================================================================

/** Cuenta en cuántos lugares se usa un elemento del catálogo */
function contarUsoCatalogo(tipo, nombre) {
  const buscado = String(nombre || "").trim().toLowerCase();
  let enOperaciones = 0;
  const pedidosAfectados = new Set();
  let enPlantillas = 0;
  let enRegistros = 0;

  pedidos.forEach(p => (p.items || []).forEach(item => (item.operaciones || []).forEach(op => {
    const valor = tipo === "maquina" ? op.maquina : (op.costura || op.descripcion);
    if (String(valor || "").trim().toLowerCase() === buscado) {
      enOperaciones++;
      pedidosAfectados.add(p.folio || p.id);
    }
  })));

  Object.keys(plantillasCosturas || {}).forEach(pid => {
    (plantillasCosturas[pid] || []).forEach(item => {
      const valor = tipo === "maquina" ? item.maquina : item.costura;
      if (String(valor || "").trim().toLowerCase() === buscado) enPlantillas++;
    });
  });

  registros.forEach(r => {
    const valor = tipo === "maquina" ? r.maquina : r.descripcion;
    if (String(valor || "").trim().toLowerCase() === buscado) enRegistros++;
  });

  return {
    enOperaciones, enPlantillas, enRegistros,
    pedidos: Array.from(pedidosAfectados),
    totalPedidos: pedidosAfectados.size,
    enUso: enOperaciones > 0 || enPlantillas > 0 || enRegistros > 0
  };
}

/** Cuenta el uso de una prenda */
function contarUsoPrenda(prendaId) {
  const id = Number(prendaId);
  const pedidosAfectados = pedidos.filter(p =>
    (p.items || []).some(i => Number(i.prendaId) === id) ||
    (Array.isArray(p.prendas) && p.prendas.map(Number).includes(id))
  );
  const regs = registros.filter(r => Number(r.prendaId) === id).length;
  const tienePlantilla = !!(plantillasCosturas && plantillasCosturas[String(id)] && plantillasCosturas[String(id)].length);
  return {
    totalPedidos: pedidosAfectados.length,
    pedidos: pedidosAfectados.map(p => p.folio || p.id),
    enRegistros: regs,
    tienePlantilla,
    enUso: pedidosAfectados.length > 0 || regs > 0
  };
}

/**
 * PUNTO 16
 * GET /api/catalogos/uso?tipo=maquina|costura|prenda&nombre=...  (o id= para prenda)
 * Sirve para avisar ANTES de eliminar. Solo consulta, no modifica nada.
 */
app.get("/api/catalogos/uso", (req, res) => {
  try {
    const tipo = String(req.query.tipo || "").toLowerCase();
    if (tipo === "prenda") {
      const id = req.query.id || req.query.nombre;
      if (!id) return res.status(400).json({ ok: false, error: "Falta el id de la prenda." });
      const p = prendas.find(x => Number(x.id) === Number(id));
      const uso = contarUsoPrenda(id);
      return res.json({ ok: true, tipo, nombre: p ? p.nombre : String(id), uso });
    }
    if (tipo !== "maquina" && tipo !== "costura") {
      return res.status(400).json({ ok: false, error: "Tipo inválido. Usa maquina, costura o prenda." });
    }
    const nombre = req.query.nombre;
    if (!nombre) return res.status(400).json({ ok: false, error: "Falta el nombre." });
    return res.json({ ok: true, tipo, nombre, uso: contarUsoCatalogo(tipo, nombre) });
  } catch (e) {
    console.error("Error consultando uso de catálogo:", e.message || e);
    return res.status(500).json({ ok: false, error: "No se pudo consultar el uso." });
  }
}); 

/**
 * PUNTO 15 — Renombrar elementos del catálogo (con cascada)
 * PUT /api/catalogos/renombrar
 * Body: { tipo: "maquina"|"costura"|"prenda", nombreActual?, id?, nombreNuevo }
 *
 * Se usa una ruta nueva a propósito, para no tocar los endpoints que ya
 * existen de maquinas / costuras / prendas y que siguen funcionando igual.
 */
app.put("/api/catalogos/renombrar", (req, res) => {
  try {
    const body = req.body || {};
    const tipo = String(body.tipo || "").trim().toLowerCase();
    const nuevo = String(body.nombreNuevo || body.nombre || "").trim();

    if (!nuevo) return res.status(400).json({ ok: false, error: "El nombre nuevo no puede estar vacio." });
    if (nuevo.length > 80) return res.status(400).json({ ok: false, error: "El nombre es demasiado largo." });

    const igual = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

    // ---------- MÁQUINA ----------
    if (tipo === "maquina") {
      const actual = String(body.nombreActual || "").trim();
      if (!actual) return res.status(400).json({ ok: false, error: "Falta el nombre actual." });

      const idx = maquinas.findIndex(m => igual(m, actual));
      if (idx === -1) return res.status(404).json({ ok: false, error: "Esa maquina no existe en el catalogo." });
      if (maquinas.some((m, i) => i !== idx && igual(m, nuevo))) {
        return res.status(409).json({ ok: false, error: `Ya existe una maquina llamada "${nuevo}".` });
      }

      const detalle = contarUsoCatalogo("maquina", actual);
      maquinas[idx] = nuevo;

      let cambios = 0;
      pedidos.forEach(p => (p.items || []).forEach(item => (item.operaciones || []).forEach(op => {
        if (igual(op.maquina, actual)) { op.maquina = nuevo; cambios++; }
      })));
      Object.keys(plantillasCosturas || {}).forEach(pid => {
        (plantillasCosturas[pid] || []).forEach(item => {
          if (igual(item.maquina, actual)) { item.maquina = nuevo; cambios++; }
        });
      });
      registros.forEach(r => { if (igual(r.maquina, actual)) { r.maquina = nuevo; cambios++; } });

      guardarDatos();
      return res.json({
        ok: true, tipo,
        mensaje: `Maquina renombrada de "${actual}" a "${nuevo}".`,
        nombreAnterior: actual, nombreNuevo: nuevo,
        lugaresActualizados: cambios, detalle, maquinas
      });
    }

    // ---------- COSTURA ----------
    if (tipo === "costura") {
      const nombreDe = (c) => typeof c === "string" ? c : ((c && c.nombre) || "");
      let idx = -1;
      let actual = String(body.nombreActual || "").trim();

      if (body.id !== undefined && body.id !== null && String(body.id) !== "") {
        idx = costuras.findIndex(c => c && Number(c.id) === Number(body.id));
        if (idx !== -1) actual = nombreDe(costuras[idx]).trim();
      }
      if (idx === -1 && actual) idx = costuras.findIndex(c => igual(nombreDe(c), actual));
      if (idx === -1) return res.status(404).json({ ok: false, error: "Esa costura no existe en el catalogo." });

      if (costuras.some((c, i) => i !== idx && igual(nombreDe(c), nuevo))) {
        return res.status(409).json({ ok: false, error: `Ya existe una costura llamada "${nuevo}".` });
      }

      const detalle = contarUsoCatalogo("costura", actual);
      if (typeof costuras[idx] === "string") costuras[idx] = nuevo;
      else costuras[idx].nombre = nuevo;

      let cambios = 0;
      pedidos.forEach(p => (p.items || []).forEach(item => (item.operaciones || []).forEach(op => {
        if (igual(op.costura, actual)) { op.costura = nuevo; cambios++; }
        if (igual(op.descripcion, actual)) { op.descripcion = nuevo; cambios++; }
      })));
      Object.keys(plantillasCosturas || {}).forEach(pid => {
        (plantillasCosturas[pid] || []).forEach(item => {
          if (igual(item.costura, actual)) { item.costura = nuevo; cambios++; }
        });
      });
      registros.forEach(r => { if (igual(r.descripcion, actual)) { r.descripcion = nuevo; cambios++; } });

      guardarDatos();
      return res.json({
        ok: true, tipo,
        mensaje: `Costura renombrada de "${actual}" a "${nuevo}".`,
        nombreAnterior: actual, nombreNuevo: nuevo,
        lugaresActualizados: cambios, detalle, costuras
      });
    }

    // ---------- PRENDA ----------
    if (tipo === "prenda") {
      const id = Number(body.id);
      const prenda = prendas.find(p => Number(p.id) === id);
      if (!prenda) return res.status(404).json({ ok: false, error: "Esa prenda no existe." });

      if (prendas.some(p => Number(p.id) !== id && igual(p.nombre, nuevo))) {
        return res.status(409).json({ ok: false, error: `Ya existe una prenda llamada "${nuevo}".` });
      }

      const anterior = prenda.nombre;
      prenda.nombre = nuevo;
      guardarDatos();

      // Los pedidos guardan prendaId, por eso no hace falta cascada de texto.
      return res.json({
        ok: true, tipo,
        mensaje: `Prenda renombrada de "${anterior}" a "${nuevo}".`,
        nombreAnterior: anterior, nombreNuevo: nuevo,
        lugaresActualizados: 0, detalle: contarUsoPrenda(id), prendas
      });
    }

    return res.status(400).json({ ok: false, error: "Tipo invalido. Usa maquina, costura o prenda." });
  } catch (e) {
    console.error("Error renombrando en catalogo:", e.message || e);
    return res.status(500).json({ ok: false, error: "No se pudo renombrar." });
  }
});

/**
 * Fecha de entrega de un pedido (campo opcional).
 * PUT /api/pedidos/:id/fecha-entrega   Body: { fechaEntrega: "YYYY-MM-DD" | null }
 */
app.put("/api/pedidos/:id/fecha-entrega", (req, res) => {
  try {
    const id = Number(req.params.id);
    const pedido = pedidos.find(p => p.id === id);
    if (!pedido) return res.status(404).json({ ok: false, error: "Pedido no encontrado." });

    let valor = req.body ? req.body.fechaEntrega : null;
    if (valor === "" || valor === undefined) valor = null;

    if (valor !== null) {
      const texto = String(valor).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
        return res.status(400).json({ ok: false, error: "Usa el formato AAAA-MM-DD." });
      }
      const prueba = new Date(texto + "T12:00:00");
      if (isNaN(prueba.getTime())) {
        return res.status(400).json({ ok: false, error: "Esa fecha no es válida." });
      }
      valor = texto;
    }

    pedido.fechaEntrega = valor;
    guardarDatos();
    return res.json({
      ok: true,
      mensaje: valor ? "Fecha de entrega guardada." : "Fecha de entrega quitada.",
      pedidoId: id, fechaEntrega: valor
    });
  } catch (e) {
    console.error("Error guardando fecha de entrega:", e.message || e);
    return res.status(500).json({ ok: false, error: "No se pudo guardar la fecha." });
  }
});

app.listen(PORT, () => {
  console.log("╔════════════════════════════════════════════════╗");
  console.log("║  🚀 Servidor V5 - Producción y Nómina        ║");
  console.log("║  📍 Puerto: " + PORT + "                              ║");
    const BASE_URL = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
  console.log("║  🌐 URL: " + BASE_URL + "              ║");
  console.log("║  ✅ Sistema completo con pagos y gestión     ║");
  console.log("╚════════════════════════════════════════════════╝");
});