/**
 * Encuentra tu trámite [PROTOTIPO] · servicio de administración en Google Apps Script
 * --------------------------------------------------------------------------------
 * Hace de puente entre admin.html (minemo.es) y GitHub:
 *   - Comprueba usuario y clave de administración (guardadas con sal y hash en las propiedades del script).
 *   - Entrega una sesión firmada (HMAC) de 8 horas.
 *   - Lee y guarda SOLO los ficheros encuentra-tu-tramite/config/*.json del repositorio minemo-es/minemo-web,
 *     usando un token de GitHub que nunca sale del script.
 *   - Opcionalmente anota cada cambio en una hoja de cálculo de Google (registro de auditoría).
 *
 * Instalación: ver gas/README.md
 */

var CFG = {
  REPO: 'minemo-es/minemo-web',
  RAMA: 'main',
  CARPETA: 'encuentra-tu-tramite/',
  RUTAS_PERMITIDAS: /^config\/(correcciones|procedimientos|municipios|portal)\.json$/,
  HORAS_SESION: 8,
  MAX_INTENTOS: 5,           // intentos de acceso fallidos por usuario…
  VENTANA_INTENTOS: 600,     // …en 10 minutos
  MAX_BYTES: 2 * 1024 * 1024
};

// ---------------------------------------------------------------- utilidades
function props_() { return PropertiesService.getScriptProperties(); }
function prop_(k, def) { var v = props_().getProperty(k); return v == null ? def : v; }
function salida_(obj) { return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON); }
function b64url_(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
function hex_(bytes) { return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join(''); }

function hashClave_(clave, sal) {
  var h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, sal + ':' + clave, Utilities.Charset.UTF_8);
  for (var i = 0; i < 2000; i++) h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, hex_(h) + sal, Utilities.Charset.UTF_8);
  return hex_(h);
}
function usuarios_() { return JSON.parse(prop_('ADMIN_USUARIOS', '{}')); }
function secreto_() {
  var s = prop_('SECRETO_SESION', null);
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); props_().setProperty('SECRETO_SESION', s); }
  return s;
}
function firmar_(texto) { return b64url_(Utilities.computeHmacSha256Signature(texto, secreto_(), Utilities.Charset.UTF_8)); }
function crearSesion_(usuario) {
  var datos = b64url_(Utilities.newBlob(JSON.stringify({ u: usuario, exp: Date.now() + CFG.HORAS_SESION * 3600e3 })).getBytes());
  return datos + '.' + firmar_(datos);
}
function validarSesion_(sesion) {
  if (!sesion || sesion.indexOf('.') < 0) throw new Error('Sesión no válida. Vuelve a entrar.');
  var p = sesion.split('.');
  if (firmar_(p[0]) !== p[1]) throw new Error('Sesión no válida. Vuelve a entrar.');
  var d = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(p[0])).getDataAsString('UTF-8'));
  if (d.exp < Date.now()) throw new Error('La sesión ha caducado. Vuelve a entrar.');
  var u = usuarios_()[d.u];
  if (!u || u.baja) throw new Error('Usuario sin acceso.');
  return { usuario: d.u, nombre: u.nombre || d.u };
}

// ---------------------------------------------------------------- GitHub
function github_(metodo, ruta, cuerpo) {
  var token = prop_('GITHUB_TOKEN', '');
  if (!token) throw new Error('Falta GITHUB_TOKEN en las propiedades del script.');
  var opt = { method: metodo, muteHttpExceptions: true, contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } };
  if (cuerpo) opt.payload = JSON.stringify(cuerpo);
  var r = UrlFetchApp.fetch('https://api.github.com' + ruta, opt), code = r.getResponseCode(), txt = r.getContentText();
  if (code === 404) return null;
  var j = txt ? JSON.parse(txt) : {};
  if (code >= 300) throw new Error('GitHub (' + code + '): ' + (j.message || txt));
  return j;
}
function repo_() { return prop_('GITHUB_REPO', CFG.REPO); }
function rama_() { return prop_('GITHUB_RAMA', CFG.RAMA); }
function comprobarRuta_(ruta) {
  if (!CFG.RUTAS_PERMITIDAS.test(String(ruta || ''))) throw new Error('Ruta no permitida: ' + ruta);
  return CFG.CARPETA + ruta;
}

// ---------------------------------------------------------------- acciones
function accionLogin_(d) {
  var usuario = String(d.usuario || '').trim().toLowerCase(), clave = String(d.clave || '');
  var cache = CacheService.getScriptCache(), k = 'intentos_' + usuario, n = +(cache.get(k) || 0);
  if (n >= CFG.MAX_INTENTOS) throw new Error('Demasiados intentos. Espera unos minutos.');
  var u = usuarios_()[usuario];
  if (!u || u.baja || hashClave_(clave, u.sal) !== u.hash) {
    cache.put(k, String(n + 1), CFG.VENTANA_INTENTOS);
    Utilities.sleep(600);
    throw new Error('Usuario o clave incorrectos.');
  }
  cache.remove(k);
  registrar_(usuario, 'login', '', '');
  return { ok: true, sesion: crearSesion_(usuario), usuario: usuario, nombre: u.nombre || usuario };
}
function accionLeer_(d, quien) {
  var ruta = comprobarRuta_(d.ruta);
  var j = github_('get', '/repos/' + repo_() + '/contents/' + encodeURI(ruta) + '?ref=' + rama_());
  if (!j) return { ok: true, contenido: null, sha: null };
  var texto = Utilities.newBlob(Utilities.base64Decode(j.content.replace(/\n/g, ''))).getDataAsString('UTF-8');
  return { ok: true, contenido: texto, sha: j.sha };
}
function accionGuardar_(d, quien) {
  var ruta = comprobarRuta_(d.ruta), contenido = String(d.contenido || '');
  if (contenido.length > CFG.MAX_BYTES) throw new Error('El fichero es demasiado grande.');
  JSON.parse(contenido); // debe ser JSON válido
  var cuerpo = { message: String(d.mensaje || 'Encuentra tu trámite (admin)').slice(0, 200) + ' [vía Apps Script, ' + quien.usuario + ']',
    content: Utilities.base64Encode(contenido, Utilities.Charset.UTF_8), branch: rama_(),
    committer: { name: 'Admin Encuentra tu trámite', email: prop_('COMMIT_EMAIL', 'admin@minemo.es') } };
  if (d.sha) cuerpo.sha = d.sha;
  var j = github_('put', '/repos/' + repo_() + '/contents/' + encodeURI(ruta), cuerpo);
  registrar_(quien.usuario, 'guardar', ruta, j.commit.html_url);
  return { ok: true, sha: j.content.sha, url: j.commit.html_url };
}
function accionHistorial_(d, quien) {
  var c = github_('get', '/repos/' + repo_() + '/commits?path=' + CFG.CARPETA + 'config&per_page=15&sha=' + rama_()) || [];
  return { ok: true, commits: c.map(function (x) { return { mensaje: x.commit.message, autor: x.commit.author.name, fecha: x.commit.author.date, url: x.html_url }; }) };
}

// Registro opcional en una hoja de cálculo (propiedad HOJA_REGISTRO_ID)
function registrar_(usuario, accion, ruta, url) {
  var id = prop_('HOJA_REGISTRO_ID', '');
  if (!id) return;
  try {
    var hoja = SpreadsheetApp.openById(id).getSheetByName('Registro') || SpreadsheetApp.openById(id).insertSheet('Registro');
    if (hoja.getLastRow() === 0) hoja.appendRow(['Fecha', 'Usuario', 'Acción', 'Fichero', 'Commit']);
    hoja.appendRow([new Date(), usuario, accion, ruta, url]);
  } catch (e) { console.warn('No se pudo registrar: ' + e); }
}

// ---------------------------------------------------------------- puntos de entrada web
function doGet() {
  return salida_({ ok: true, servicio: 'Encuentra tu trámite · administración', repo: repo_(), configurado: !!prop_('GITHUB_TOKEN', '') });
}
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (d.accion === 'login') return salida_(accionLogin_(d));
    var quien = validarSesion_(d.sesion);
    if (d.accion === 'yo') return salida_({ ok: true, usuario: quien.usuario, nombre: quien.nombre });
    if (d.accion === 'leer') return salida_(accionLeer_(d, quien));
    if (d.accion === 'historial') return salida_(accionHistorial_(d, quien));
    if (d.accion === 'guardar') {
      lock.waitLock(20000); // evita dos escrituras simultáneas sobre el mismo fichero
      return salida_(accionGuardar_(d, quien));
    }
    throw new Error('Acción desconocida');
  } catch (err) {
    return salida_({ ok: false, error: String(err && err.message || err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

// ---------------------------------------------------------------- funciones para ejecutar desde el editor
/** 1) Ejecutar una vez: crea el secreto de sesión y comprueba el acceso a GitHub. */
function configurar() {
  secreto_();
  var r = github_('get', '/repos/' + repo_());
  if (!r) throw new Error('No se encuentra el repositorio ' + repo_() + ' (¿token sin acceso?).');
  if (!r.permissions || !r.permissions.push) throw new Error('El token no tiene permiso de escritura en ' + repo_());
  console.log('Correcto: acceso de escritura a ' + r.full_name + ' (rama ' + rama_() + ').');
}

/** 2) Alta o cambio de clave de un administrador. Rellena los tres valores, ejecuta y BORRA la clave del código. */
function crearAdministrador() {
  var USUARIO = 'julio';            // en minúsculas, sin espacios
  var NOMBRE = 'Julio Cerdá';
  var CLAVE = '';                   // escribe aquí una clave larga, ejecuta y vuelve a dejarlo vacío
  if (!CLAVE || CLAVE.length < 10) throw new Error('Escribe una clave de al menos 10 caracteres en CLAVE.');
  var u = usuarios_(), sal = Utilities.getUuid();
  u[USUARIO.toLowerCase()] = { nombre: NOMBRE, sal: sal, hash: hashClave_(CLAVE, sal), alta: new Date().toISOString() };
  props_().setProperty('ADMIN_USUARIOS', JSON.stringify(u));
  console.log('Administrador guardado: ' + USUARIO + '. Ahora borra la clave del código.');
}

/** Dar de baja a un administrador sin borrar su historial. */
function bajaAdministrador() {
  var USUARIO = '';
  var u = usuarios_();
  if (!u[USUARIO]) throw new Error('No existe ' + USUARIO);
  u[USUARIO].baja = new Date().toISOString();
  props_().setProperty('ADMIN_USUARIOS', JSON.stringify(u));
  console.log('Baja: ' + USUARIO);
}

/** Lista los administradores (sin claves). */
function listarAdministradores() {
  var u = usuarios_();
  Object.keys(u).forEach(function (k) { console.log(k + ' · ' + u[k].nombre + (u[k].baja ? ' · BAJA ' + u[k].baja : '')); });
}
