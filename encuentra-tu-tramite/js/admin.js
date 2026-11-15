/* Encuentra tu trámite [PROTOTIPO] · administración
 * Dos formas de entrar:
 *   1) Cuenta de administración servida por Google Apps Script (gas/Codigo.gs): el token de GitHub vive en el script.
 *   2) Token de GitHub con permiso de escritura en minemo-es/minemo-web.
 * Todo lo que se edita aquí se guarda en encuentra-tu-tramite/config/*.json, que el buscador aplica al cargar.
 */
(function () {
  'use strict';
  var E = window.ETT, esc = E.esc, fmt = E.fmt;
  var REPO = 'minemo-es/minemo-web', RAMA = 'main', CARPETA = 'encuentra-tu-tramite/';
  var FICHEROS = { correcciones: 'config/correcciones.json', procedimientos: 'config/procedimientos.json',
                   municipios: 'config/municipios.json', portal: 'config/portal.json' };
  var $ = function (id) { return document.getElementById(id); };
  var B = null;      // backend activo
  var D = null;      // datos del buscador (con la configuración publicada aplicada)
  var ORIG = {};     // valores originales de clasificación por id de trámite
  var P = vacio();   // cambios pendientes de publicar
  var pestana = 'panel';

  function vacio() { return { correcciones: {}, procedimientos: {}, municipios: {}, portal: null }; }
  function nPend() { return Object.keys(P.correcciones).length + Object.keys(P.procedimientos).length + Object.keys(P.municipios).length + (P.portal ? 1 : 0); }

  // ---------------- utilidades base64 UTF-8 ----------------
  function aB64(s) { var b = new TextEncoder().encode(s), t = ''; for (var i = 0; i < b.length; i++) t += String.fromCharCode(b[i]); return btoa(t); }
  function deB64(s) { var t = atob(s.replace(/\n/g, '')), b = new Uint8Array(t.length); for (var i = 0; i < t.length; i++) b[i] = t.charCodeAt(i); return new TextDecoder().decode(b); }

  // ---------------- Backend GitHub (token personal) ----------------
  function BackendGitHub(token) {
    var api = function (ruta, opt) {
      opt = opt || {};
      return fetch('https://api.github.com' + ruta, {
        method: opt.method || 'GET',
        headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
        body: opt.body ? JSON.stringify(opt.body) : undefined
      }).then(function (r) {
        if (r.status === 404 && opt.permitir404) return null;
        return r.json().then(function (j) { if (!r.ok) throw new Error((j && j.message) || ('GitHub respondió ' + r.status)); return j; });
      });
    };
    return {
      tipo: 'GitHub',
      entrar: function () {
        return Promise.all([api('/user'), api('/repos/' + REPO)]).then(function (r) {
          if (!r[1].permissions || !r[1].permissions.push) throw new Error('Tu usuario de GitHub no tiene permiso de escritura en ' + REPO + '.');
          return { usuario: r[0].login, nombre: r[0].name || r[0].login };
        });
      },
      leer: function (ruta) {
        return api('/repos/' + REPO + '/contents/' + CARPETA + ruta + '?ref=' + RAMA, { permitir404: true }).then(function (j) {
          return j ? { contenido: JSON.parse(deB64(j.content)), sha: j.sha } : { contenido: null, sha: null };
        });
      },
      guardar: function (ruta, obj, sha, mensaje) {
        var body = { message: mensaje, content: aB64(JSON.stringify(obj, null, 2) + '\n'), branch: RAMA };
        if (sha) body.sha = sha;
        return api('/repos/' + REPO + '/contents/' + CARPETA + ruta, { method: 'PUT', body: body })
          .then(function (j) { return { sha: j.content.sha, url: j.commit.html_url }; });
      },
      historial: function () {
        return api('/repos/' + REPO + '/commits?path=' + CARPETA + 'config&per_page=15').then(function (c) {
          return c.map(function (x) { return { mensaje: x.commit.message, autor: x.commit.author.name, fecha: x.commit.author.date, url: x.html_url }; });
        });
      }
    };
  }

  // ---------------- Backend Google Apps Script ----------------
  function BackendGAS(url) {
    var sesion = null;
    var post = function (datos) {
      // text/plain evita la petición previa CORS, que Apps Script no admite
      return fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(datos), redirect: 'follow' })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (!j.ok) throw new Error(j.error || 'Error del servicio de administración'); return j; });
    };
    return {
      tipo: 'Google Apps Script',
      url: url,
      entrar: function (usuario, clave) {
        if (sesion && !usuario) return post({ accion: 'yo', sesion: sesion }).then(function (j) { return { usuario: j.usuario, nombre: j.nombre || j.usuario }; });
        return post({ accion: 'login', usuario: usuario, clave: clave }).then(function (j) {
          sesion = j.sesion; sessionStorage.setItem('ett_gas', JSON.stringify({ url: url, sesion: sesion }));
          return { usuario: j.usuario, nombre: j.nombre || j.usuario };
        });
      },
      usarSesion: function (s) { sesion = s; },
      leer: function (ruta) {
        return post({ accion: 'leer', sesion: sesion, ruta: ruta }).then(function (j) {
          return { contenido: j.contenido ? JSON.parse(j.contenido) : null, sha: j.sha || null };
        });
      },
      guardar: function (ruta, obj, sha, mensaje) {
        return post({ accion: 'guardar', sesion: sesion, ruta: ruta, contenido: JSON.stringify(obj, null, 2) + '\n', sha: sha, mensaje: mensaje })
          .then(function (j) { return { sha: j.sha, url: j.url }; });
      },
      historial: function () { return post({ accion: 'historial', sesion: sesion }).then(function (j) { return j.commits || []; }); }
    };
  }

  // ---------------- Acceso ----------------
  function errorLogin(m) { $('login-error').textContent = m || ''; }
  E.jsonOpcional('config/portal.json', {}).then(function (p) {
    var guardada = localStorage.getItem('ett_gas_url');
    $('gas-url').value = guardada || p.admin_api || '';
  });

  $('f-gas').addEventListener('submit', function (e) {
    e.preventDefault(); errorLogin();
    var url = $('gas-url').value.trim();
    if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { errorLogin('Falta la dirección del servicio de Apps Script (despliega gas/Codigo.gs y pega aquí su URL).'); $('gas-url').closest('details').open = true; return; }
    try { localStorage.setItem('ett_gas_url', url); } catch (x) {}
    var b = BackendGAS(url);
    b.entrar($('gas-usuario').value.trim(), $('gas-clave').value).then(function (u) { $('gas-clave').value = ''; arrancar(b, u); })
      .catch(function (x) { errorLogin(x.message); });
  });
  $('f-gh').addEventListener('submit', function (e) {
    e.preventDefault(); errorLogin();
    var tk = $('gh-token').value.trim(), b = BackendGitHub(tk);
    b.entrar().then(function (u) { sessionStorage.setItem('ett_gh', tk); $('gh-token').value = ''; arrancar(b, u); })
      .catch(function (x) { errorLogin(x.message); });
  });
  $('b-salir').addEventListener('click', function () {
    if (nPend() && !confirm('Hay cambios sin publicar. ¿Salir igualmente?')) return;
    sessionStorage.removeItem('ett_gh'); sessionStorage.removeItem('ett_gas'); location.reload();
  });
  // Reanudar sesión de esta pestaña
  (function () {
    var tk = sessionStorage.getItem('ett_gh'), g = sessionStorage.getItem('ett_gas');
    if (tk) { var b = BackendGitHub(tk); b.entrar().then(function (u) { arrancar(b, u); }).catch(function () { sessionStorage.removeItem('ett_gh'); }); }
    else if (g) { try { g = JSON.parse(g); var bg = BackendGAS(g.url); bg.usarSesion(g.sesion); bg.entrar().then(function (u) { arrancar(bg, u); }).catch(function () { sessionStorage.removeItem('ett_gas'); }); } catch (x) {} }
  })();
  window.addEventListener('beforeunload', function (e) { if (nPend()) { e.preventDefault(); e.returnValue = ''; } });

  function arrancar(backend, usuario) {
    B = backend; B.usuario = usuario;
    $('v-login').hidden = true; $('v-app').hidden = false;
    $('quien').innerHTML = 'Conectado como <b>' + esc(usuario.nombre) + '</b> · vía ' + esc(B.tipo);
    E.cargarTodo().then(function (d) {
      D = d;
      var C = {}; D.I.campos.forEach(function (k, i) { C[k] = i; });
      D.I.tramites.forEach(function (f) {
        ORIG[f[C.id]] = { esp: f[C.esp], proc: f[C.proc] == null ? null : D.I.procedimientos[f[C.proc]][0], conf: f[C.conf] };
      });
      contarRevision(); mostrar(pestana);
    }).catch(function (x) { $('contenido').innerHTML = '<p class="error">No se pudieron cargar los datos: ' + esc(x.message) + '</p>'; });
  }

  // ---------------- Pestañas ----------------
  document.querySelector('.pestanas').addEventListener('click', function (e) {
    var b = e.target.closest('[data-tab]'); if (!b) return;
    document.querySelectorAll('.pestanas [data-tab]').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
    mostrar(b.dataset.tab);
  });
  function mostrar(t) {
    pestana = t;
    var f = { panel: vPanel, revision: vRevision, procedimientos: vProcedimientos, municipios: vMunicipios, portal: vPortal, ayuda: vAyuda }[t];
    f($('contenido'));
  }
  function contarRevision() {
    var n = D.tramites.filter(function (t) { return pendienteRevision(t); }).length;
    $('n-revision').textContent = fmt(n);
  }
  function pendienteRevision(t) { return ORIG[t.id] && ORIG[t.id].conf < 0.75 && !D.config.correcciones[t.id] && !P.correcciones[t.id]; }
  function refrescarPendientes() {
    var n = nPend(), partes = [];
    if (Object.keys(P.correcciones).length) partes.push(Object.keys(P.correcciones).length + ' clasificaciones');
    if (Object.keys(P.procedimientos).length) partes.push(Object.keys(P.procedimientos).length + ' procedimientos');
    if (Object.keys(P.municipios).length) partes.push(Object.keys(P.municipios).length + ' municipios');
    if (P.portal) partes.push('textos del portal');
    $('pendientes').hidden = !n;
    $('pendientes-txt').textContent = n ? 'Cambios sin publicar: ' + partes.join(', ') + '.' : '';
  }

  // ---------------- Panel ----------------
  function vPanel(c) {
    var nCorr = Object.keys(D.config.correcciones).length, nProc = Object.keys(D.config.procedimientos).length, nMun = Object.keys(D.config.municipios).length;
    var muns = new Set(D.tramites.map(function (t) { return t.slug; }));
    var pend = D.tramites.filter(pendienteRevision).length;
    c.innerHTML = '<div class="cifras">' +
      ci(fmt(D.tramites.length), 'trámites publicados') + ci(fmt(muns.size), 'municipios con datos') +
      ci(fmt(D.procs.filter(function (p) { return p.n; }).length), 'procedimientos tipo con trámites') +
      ci(fmt(pend), 'clasificaciones por revisar') + ci(fmt(nCorr), 'correcciones publicadas') +
      ci(fmt(nProc + nMun), 'ajustes de procedimientos y municipios') + '</div>' +
      '<div class="rejilla-2" style="margin-top:1.5rem;color:inherit"><div class="bloque" style="margin:0"><h3>Últimos cambios publicados</h3><ul class="historial" id="hist"><li class="cargando">Consultando GitHub…</li></ul></div>' +
      '<div class="bloque" style="margin:0"><h3>Por dónde empezar</h3><ul style="margin:.6rem 0 0;padding-left:1.1rem;display:grid;gap:.4rem">' +
      '<li><b>Revisión de clasificaciones:</b> valida o corrige los ' + fmt(pend) + ' trámites que clasificó el modelo automático.</li>' +
      '<li><b>Procedimientos tipo:</b> mejora nombres y sinónimos para que la gente encuentre lo que busca con sus palabras.</li>' +
      '<li><b>Municipios:</b> oculta un municipio o añade una nota pública (por ejemplo, «sede en mantenimiento»).</li>' +
      '<li><b>Textos del portal:</b> título, aviso, ejemplos de búsqueda y trámites destacados.</li></ul>' +
      '<p class="sub" style="margin-top:.8rem">Datos del ' + esc(D.META.version) + ' · <a href="https://github.com/' + REPO + '/tree/' + RAMA + '/' + CARPETA + '" target="_blank" rel="noopener">repositorio</a></p></div></div>';
    B.historial().then(function (h) {
      $('hist').innerHTML = h.length ? h.map(function (x) {
        return '<li><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.mensaje.split('\n')[0]) + '</a><br><small>' + esc(x.autor) + ' · ' + new Date(x.fecha).toLocaleString('es-ES') + '</small></li>';
      }).join('') : '<li>Todavía no hay cambios en la configuración.</li>';
    }).catch(function (x) { $('hist').innerHTML = '<li class="error">' + esc(x.message) + '</li>'; });
  }
  function ci(v, t) { return '<div class="cifra"><b>' + v + '</b><span>' + esc(t) + '</span></div>'; }

  // ---------------- Revisión de clasificaciones ----------------
  var RV = { estado: 'pendientes', slug: '', fun: '', q: '', pag: 1 };
  function opcionesEsp(sel) {
    return D.FUNCAL.funciones.map(function (f) {
      return '<optgroup label="' + esc(f.codigo + ' ' + f.nombre) + '">' + f.especificas.map(function (e) {
        return '<option value="' + e.codigo + '"' + (e.codigo === sel ? ' selected' : '') + '>' + esc(e.codigo + ' ' + e.nombre) + '</option>';
      }).join('') + '</optgroup>';
    }).join('');
  }
  var _procOpts = null;
  function opcionesProc(sel) {
    if (!_procOpts) _procOpts = D.procs.slice().sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
    return '<option value="">— Ninguno —</option>' + _procOpts.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === sel ? ' selected' : '') + '>' + esc(p.nombre) + '</option>';
    }).join('');
  }
  function vRevision(c) {
    var munOpts = D.muns.filter(function (m) { return m.n_tramites; }).map(function (m) { return '<option value="' + esc(m.slug) + '"' + (m.slug === RV.slug ? ' selected' : '') + '>' + esc(m.municipio) + '</option>'; }).join('');
    var funOpts = D.FUNCAL.funciones.map(function (f) { return '<option value="' + f.codigo + '"' + (f.codigo === RV.fun ? ' selected' : '') + '>' + esc(f.codigo + ' ' + f.nombre) + '</option>'; }).join('');
    c.innerHTML = '<p class="sub">Los trámites con <b>confianza inferior a 0,75</b> los clasificó un modelo automático. Comprueba la función FUNCAL y el procedimiento tipo: si son correctos, pulsa <b>Validar</b>; si no, cámbialos. Los cambios se acumulan y se publican juntos.</p>' +
      '<div class="filtros-adm"><select class="campo" id="rv-estado"><option value="pendientes">Pendientes de revisar</option><option value="corregidos">Ya corregidos o validados</option><option value="todos">Todos</option></select>' +
      '<select class="campo" id="rv-mun"><option value="">Todos los municipios</option>' + munOpts + '</select>' +
      '<select class="campo" id="rv-fun"><option value="">Todas las funciones</option>' + funOpts + '</select>' +
      '<input class="campo" id="rv-q" type="search" placeholder="Buscar en el título" value="' + esc(RV.q) + '"></div>' +
      '<p class="sub" id="rv-n"></p><div class="tabla-envoltura"><table class="tabla" id="rv-tabla"></table></div><div id="rv-pag" style="margin-top:.8rem"></div>';
    $('rv-estado').value = RV.estado;
    ['rv-estado', 'rv-mun', 'rv-fun'].forEach(function (id) { $(id).addEventListener('change', function () { leerFiltros(); pintarRevision(); }); });
    var tmr; $('rv-q').addEventListener('input', function () { clearTimeout(tmr); tmr = setTimeout(function () { leerFiltros(); pintarRevision(); }, 250); });
    pintarRevision();
  }
  function leerFiltros() { RV.estado = $('rv-estado').value; RV.slug = $('rv-mun').value; RV.fun = $('rv-fun').value; RV.q = $('rv-q').value; RV.pag = 1; }
  function filasRevision() {
    var q = E.norm(RV.q);
    return D.tramites.filter(function (t) {
      var corr = D.config.correcciones[t.id] || P.correcciones[t.id];
      if (RV.estado === 'pendientes' && !pendienteRevision(t) && !P.correcciones[t.id]) return false;
      if (RV.estado === 'corregidos' && !corr) return false;
      if (RV.slug && t.slug !== RV.slug) return false;
      if (RV.fun && t.esp.slice(0, 2) !== RV.fun) return false;
      if (q && E.norm(t.titulo).indexOf(q) < 0) return false;
      return true;
    }).sort(function (a, b) { return (ORIG[a.id].conf - ORIG[b.id].conf) || a.titulo.localeCompare(b.titulo, 'es'); });
  }
  function pintarRevision() {
    var filas = filasRevision(), N = 40, tramo = filas.slice(0, RV.pag * N);
    $('rv-n').textContent = fmt(filas.length) + ' trámites';
    $('rv-tabla').innerHTML = '<thead><tr><th>Municipio</th><th>Trámite</th><th>Función FUNCAL</th><th>Procedimiento tipo</th><th class="num">Confianza</th><th></th></tr></thead><tbody>' +
      tramo.map(function (t) {
        var p = P.correcciones[t.id], esp = p && p.esp || t.esp, proc = p && ('proc' in p) ? p.proc : t.proc;
        var m = D.munPorSlug[t.slug];
        return '<tr data-id="' + esc(t.id) + '"' + (p ? ' class="cambiado"' : '') + '><td>' + esc(m ? m.municipio : t.slug) + '</td>' +
          '<td><a href="https://' + esc(m.sede) + '/sta/CarpetaPublic/doEvent?APP_CODE=STA&PAGE_CODE=CATALOGO&DETALLE=' + esc(t.id.split(':')[1]) + '" target="_blank" rel="noopener">' + esc(t.titulo) + '</a>' +
          (D.config.correcciones[t.id] ? '<br><small class="ok">corregido</small>' : '') + '</td>' +
          '<td><select class="campo rv-esp">' + opcionesEsp(esp) + '</select></td>' +
          '<td><select class="campo rv-proc">' + opcionesProc(proc) + '</select></td>' +
          '<td class="num">' + (ORIG[t.id].conf).toFixed(2) + '</td>' +
          '<td><button class="boton sec peq rv-ok">Validar</button></td></tr>';
      }).join('') + '</tbody>';
    $('rv-pag').innerHTML = filas.length > tramo.length ? '<button class="boton sec" id="rv-mas">Ver ' + Math.min(N, filas.length - tramo.length) + ' más</button>' : '';
    if ($('rv-mas')) $('rv-mas').onclick = function () { RV.pag++; pintarRevision(); };
  }
  document.addEventListener('change', function (e) {
    var tr = e.target.closest && e.target.closest('#rv-tabla tr[data-id]'); if (!tr) return;
    var id = tr.dataset.id, esp = tr.querySelector('.rv-esp').value, proc = tr.querySelector('.rv-proc').value || null;
    // Al elegir un procedimiento tipo se propone su función FUNCAL
    if (e.target.classList.contains('rv-proc') && proc && D.procPorId[proc]) { esp = D.procPorId[proc].esp; tr.querySelector('.rv-esp').value = esp; }
    P.correcciones[id] = { esp: esp, proc: proc, revisado: true }; tr.classList.add('cambiado'); refrescarPendientes();
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.rv-ok'); if (!b) return;
    var tr = b.closest('tr'), id = tr.dataset.id;
    P.correcciones[id] = { esp: tr.querySelector('.rv-esp').value, proc: tr.querySelector('.rv-proc').value || null, revisado: true };
    tr.classList.add('cambiado'); b.textContent = '✓'; refrescarPendientes();
  });

  // ---------------- Procedimientos tipo ----------------
  function vProcedimientos(c) {
    var orig = {}; D.I.procedimientos.forEach(function (p) { orig[p[0]] = { nombre: p[1], esp: p[2], sinonimos: p[3] || [] }; });
    var lista = D.procs.slice().sort(function (a, b) { return b.n - a.n; });
    c.innerHTML = '<p class="sub">Los procedimientos tipo agrupan trámites equivalentes de distintos municipios. Los <b>sinónimos</b> son las frases con las que la gente busca (uno por línea); mejoran la detección en el buscador. Ocultar un procedimiento lo quita de la comparativa.</p>' +
      '<div class="filtros-adm"><input class="campo" id="pr-q" type="search" placeholder="Filtrar procedimientos"></div>' +
      '<div class="tabla-envoltura"><table class="tabla" id="pr-tabla"><thead><tr><th>Procedimiento</th><th>Función FUNCAL</th><th>Sinónimos de búsqueda</th><th class="num">Trámites</th><th class="num">Municipios</th><th>Oculto</th></tr></thead><tbody>' +
      lista.map(function (p) {
        var pe = P.procedimientos[p.id] || {}, v = function (k, d) { return k in pe ? pe[k] : d; };
        return '<tr data-id="' + esc(p.id) + '"' + (P.procedimientos[p.id] ? ' class="cambiado"' : '') + ' data-txt="' + esc(E.norm(p.id + ' ' + p.nombre)) + '">' +
          '<td><input class="campo pr-nombre" value="' + esc(v('nombre', p.nombre)) + '"><br><small><code>' + esc(p.id) + '</code></small></td>' +
          '<td><select class="campo pr-esp">' + opcionesEsp(v('funcal_especifica', p.esp)) + '</select></td>' +
          '<td><textarea class="campo pr-sin">' + esc((v('sinonimos', p.sinonimos) || []).join('\n')) + '</textarea></td>' +
          '<td class="num">' + fmt(p.n) + '</td><td class="num">' + fmt(p.municipios.size) + '</td>' +
          '<td><input type="checkbox" class="pr-oculto"' + (v('oculto', p.oculto) ? ' checked' : '') + ' aria-label="Ocultar"></td></tr>';
      }).join('') + '</tbody></table></div>';
    $('pr-q').addEventListener('input', function () {
      var q = E.norm(this.value);
      document.querySelectorAll('#pr-tabla tbody tr').forEach(function (tr) { tr.hidden = q && tr.dataset.txt.indexOf(q) < 0; });
    });
    $('pr-tabla').addEventListener('change', function (e) {
      var tr = e.target.closest('tr[data-id]'); if (!tr) return;
      var id = tr.dataset.id, o = orig[id], pub = D.config.procedimientos[id] || {};
      var actual = { nombre: tr.querySelector('.pr-nombre').value.trim(), funcal_especifica: tr.querySelector('.pr-esp').value,
        sinonimos: tr.querySelector('.pr-sin').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
        oculto: tr.querySelector('.pr-oculto').checked };
      var aj = {};
      if (actual.nombre && actual.nombre !== o.nombre) aj.nombre = actual.nombre;
      if (actual.funcal_especifica !== o.esp) aj.funcal_especifica = actual.funcal_especifica;
      if (JSON.stringify(actual.sinonimos) !== JSON.stringify(o.sinonimos)) aj.sinonimos = actual.sinonimos;
      if (actual.oculto) aj.oculto = true;
      if (JSON.stringify(aj) === JSON.stringify(pub)) delete P.procedimientos[id]; else P.procedimientos[id] = aj;
      tr.classList.toggle('cambiado', !!P.procedimientos[id]); refrescarPendientes();
    });
  }

  // ---------------- Municipios ----------------
  function vMunicipios(c) {
    c.innerHTML = '<p class="sub">Muestra u oculta municipios del buscador y añade una nota pública que aparecerá en su ficha y en el mapa. La URL de la sede se puede corregir si cambia.</p>' +
      '<div class="tabla-envoltura"><table class="tabla" id="mu-tabla"><thead><tr><th>Municipio</th><th>Provincia</th><th class="num">Trámites</th><th>Estado</th><th>Visible</th><th>Nota pública</th><th>URL de la sede</th></tr></thead><tbody>' +
      D.muns.map(function (m) {
        var pe = P.municipios[m.slug], pub = D.config.municipios[m.slug] || {}, v = pe || pub;
        return '<tr data-slug="' + esc(m.slug) + '"' + (pe ? ' class="cambiado"' : '') + '><td>' + esc(m.municipio) + '</td><td>' + esc(m.provincia) + '</td>' +
          '<td class="num">' + fmt(m.n_tramites) + '</td><td>' + (m.estado === 'con_datos' ? 'Con datos' : 'Sin catálogo') + '</td>' +
          '<td><input type="checkbox" class="mu-vis"' + (v.oculto ? '' : ' checked') + ' aria-label="Visible"></td>' +
          '<td><input class="campo mu-nota" value="' + esc(v.nota || '') + '" placeholder="Sin nota"></td>' +
          '<td><input class="campo mu-url" value="' + esc(v.url_sede || m.url_sede || '') + '"></td></tr>';
      }).join('') + '</tbody></table></div>';
    var original = {}; D.muns.forEach(function (m) { original[m.slug] = m.url_sede_original || m.url_sede; });
    $('mu-tabla').addEventListener('change', function (e) {
      var tr = e.target.closest('tr[data-slug]'); if (!tr) return;
      var s = tr.dataset.slug, aj = {}, url = tr.querySelector('.mu-url').value.trim(), nota = tr.querySelector('.mu-nota').value.trim();
      if (!tr.querySelector('.mu-vis').checked) aj.oculto = true;
      if (nota) aj.nota = nota;
      if (url && url !== original[s]) aj.url_sede = url;
      if (JSON.stringify(aj) === JSON.stringify(D.config.municipios[s] || {})) delete P.municipios[s]; else P.municipios[s] = aj;
      tr.classList.toggle('cambiado', !!P.municipios[s]); refrescarPendientes();
    });
  }

  // ---------------- Textos del portal ----------------
  function vPortal(c) {
    var p = P.portal || D.portal || {}, dest = new Set(p.destacados || []);
    c.innerHTML = '<form class="form-portal" id="fp">' +
      '<label class="et-campo">Título<input class="campo" name="titulo" value="' + esc(p.titulo || '') + '"></label>' +
      '<label class="et-campo">Subtítulo<input class="campo" name="subtitulo" value="' + esc(p.subtitulo || '') + '"></label>' +
      '<label class="et-campo">Aviso (sección de datos)<textarea class="campo" name="aviso">' + esc(p.aviso || '') + '</textarea></label>' +
      '<label class="et-campo">Ejemplos de búsqueda (uno por línea)<textarea class="campo" name="ejemplos">' + esc((p.ejemplos || []).join('\n')) + '</textarea></label>' +
      '<div class="et-campo">Trámites destacados en la portada<div class="multi">' + D.procs.filter(function (x) { return x.n; }).sort(function (a, b) { return b.municipios.size - a.municipios.size; }).map(function (x) {
        return '<label><input type="checkbox" name="destacados" value="' + esc(x.id) + '"' + (dest.has(x.id) ? ' checked' : '') + '> ' + esc(x.nombre) + ' <small>(' + x.municipios.size + ')</small></label>';
      }).join('') + '</div></div>' +
      '<label class="et-campo">URL del servicio de administración (Apps Script)<input class="campo" name="admin_api" value="' + esc(p.admin_api || '') + '" placeholder="https://script.google.com/macros/s/…/exec"></label>' +
      '</form>';
    $('fp').addEventListener('input', function () {
      var f = this, nuevo = Object.assign({}, D.portal, {
        titulo: f.titulo.value.trim(), subtitulo: f.subtitulo.value.trim(), aviso: f.aviso.value.trim(),
        ejemplos: f.ejemplos.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean),
        destacados: Array.from(f.querySelectorAll('[name=destacados]:checked')).map(function (x) { return x.value; }),
        admin_api: f.admin_api.value.trim()
      });
      if (!nuevo.admin_api) delete nuevo.admin_api;
      P.portal = JSON.stringify(nuevo) === JSON.stringify(D.portal) ? null : nuevo; refrescarPendientes();
    });
  }

  // ---------------- Ayuda ----------------
  function vAyuda(c) {
    c.innerHTML = '<div class="bloque" style="margin-top:0"><h3>Cómo se actualizan los datos cada semana</h3><ol style="display:grid;gap:.4rem;padding-left:1.2rem;margin:.6rem 0 0">' +
      '<li>Relanzar el extractor <code>proyecto/herramientas/sta_extractor.js</code> en cada sede (guarda un ZIP por sede).</li>' +
      '<li>Comparar con la extracción anterior: <code>python comparar_extracciones.py ANTERIOR NUEVA --salida informe.json</code> (altas, bajas y cambios por sede).</li>' +
      '<li>Regenerar el JSON normalizado: <code>cd scripts; python3 consolidar.py CARPETA_ZIPS; python3 build.py ..; python3 export.py ..</code></li>' +
      '<li>Subir a GitHub <code>data/</code> y los ZIP nuevos en <code>proyecto/extracciones/AAAA-MM-DD/</code>. Las correcciones hechas aquí se conservan porque viven en <code>config/</code>.</li></ol></div>' +
      '<div class="bloque"><h3>Qué guarda cada pantalla</h3><ul style="padding-left:1.2rem;margin:.6rem 0 0;display:grid;gap:.3rem">' +
      '<li><code>config/correcciones.json</code>: clasificación corregida o validada por trámite.</li>' +
      '<li><code>config/procedimientos.json</code>: nombre, función FUNCAL, sinónimos y ocultación de procedimientos tipo.</li>' +
      '<li><code>config/municipios.json</code>: visibilidad, nota pública y URL de sede.</li>' +
      '<li><code>config/portal.json</code>: textos, ejemplos, destacados y URL del servicio de Apps Script.</li></ul>' +
      '<p class="nota-adm">Conexión actual: <b>' + esc(B.tipo) + '</b>. El servicio de Google Apps Script está en <code>gas/Codigo.gs</code>; sus instrucciones de instalación, en <code>gas/README.md</code>.</p></div>';
  }

  // ---------------- Publicar ----------------
  $('b-descartar').addEventListener('click', function () {
    if (!confirm('¿Descartar los cambios sin publicar?')) return;
    P = vacio(); refrescarPendientes(); contarRevision(); mostrar(pestana);
  });
  $('b-publicar').addEventListener('click', function () {
    var btn = this; btn.disabled = true; btn.textContent = 'Publicando…';
    var quien = B.usuario.nombre, hoy = new Date().toISOString().slice(0, 10), tareas = [];
    if (Object.keys(P.correcciones).length) tareas.push(['correcciones', function (f) {
      f = f || { descripcion: '', correcciones: {} }; f.correcciones = f.correcciones || {};
      Object.keys(P.correcciones).forEach(function (id) { f.correcciones[id] = Object.assign({}, P.correcciones[id], { por: quien, fecha: hoy }); });
      return [f, Object.keys(P.correcciones).length + ' clasificaciones revisadas'];
    }]);
    if (Object.keys(P.procedimientos).length) tareas.push(['procedimientos', function (f) {
      f = f || { descripcion: '', procedimientos: {} }; f.procedimientos = f.procedimientos || {};
      Object.keys(P.procedimientos).forEach(function (id) { var a = P.procedimientos[id]; if (Object.keys(a).length) f.procedimientos[id] = a; else delete f.procedimientos[id]; });
      return [f, Object.keys(P.procedimientos).length + ' procedimientos tipo ajustados'];
    }]);
    if (Object.keys(P.municipios).length) tareas.push(['municipios', function (f) {
      f = f || { descripcion: '', municipios: {} }; f.municipios = f.municipios || {};
      Object.keys(P.municipios).forEach(function (s) { var a = P.municipios[s]; if (Object.keys(a).length) f.municipios[s] = a; else delete f.municipios[s]; });
      return [f, Object.keys(P.municipios).length + ' municipios ajustados'];
    }]);
    if (P.portal) tareas.push(['portal', function () { return [P.portal, 'textos del portal']; }]);

    var hechas = [];
    tareas.reduce(function (pr, t) {
      return pr.then(function () {
        var ruta = FICHEROS[t[0]];
        return B.leer(ruta).then(function (actual) {
          var r = t[1](actual.contenido);
          return B.guardar(ruta, r[0], actual.sha, 'Encuentra tu trámite (admin): ' + r[1] + ' · ' + quien).then(function () {
            hechas.push(r[1]);
            if (t[0] === 'portal') D.portal = r[0]; else D.config[t[0]] = r[0][t[0]];
            if (t[0] === 'correcciones') P.correcciones = {}; else if (t[0] === 'portal') P.portal = null; else P[t[0]] = {};
          });
        });
      });
    }, Promise.resolve()).then(function () {
      alert('Publicado: ' + hechas.join(', ') + '.\nLos cambios aparecerán en minemo.es en uno o dos minutos.');
    }).catch(function (x) {
      alert('No se pudo publicar todo' + (hechas.length ? ' (sí se publicó: ' + hechas.join(', ') + ')' : '') + ':\n' + x.message);
    }).then(function () {
      btn.disabled = false; btn.textContent = 'Publicar cambios';
      refrescarPendientes(); contarRevision(); mostrar(pestana);
    });
  });
})();
