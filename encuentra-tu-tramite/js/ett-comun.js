/* Encuentra tu trámite [PROTOTIPO] · funciones comunes del buscador y del admin
 * minemo.es · datos: catálogos de sedes electrónicas municipales T-Systems (STA)
 */
(function (global) {
  'use strict';

  var BASE = (function () {
    // Carpeta del módulo, funcione desde /encuentra-tu-tramite/ o desde una copia local
    var s = document.currentScript && document.currentScript.src;
    return s ? s.replace(/js\/ett-comun\.js.*$/, '') : './';
  })();

  // ---------- Normalización de texto ----------
  function norm(s) {
    return String(s || '').toLowerCase().replace(/l·l/g, 'll')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9ñ]+/g, ' ').trim();
  }
  // Singular aproximado (mismo criterio que la clasificación en Python)
  function raiz(w) {
    if (w.length > 4 && /[lrndzj]es$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  var VACIAS = new Set(('a al algo como con de del el en es esta este la las lo los me mi mis necesito ' +
    'para pedir por puedo que quiero quisiera se ser solicitar su sus tengo un una unos unas y o hacer ' +
    'tramite tramitar ayuntamiento municipal donde cual cuales hay sobre mas informacion info obtener ' +
    'conseguir realizar presentar gestionar ver saber').split(' '));
  function tokens(s, conVacias) {
    return norm(s).split(' ').filter(function (w) { return w && (conVacias || !VACIAS.has(w)); }).map(raiz);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return Number(n || 0).toLocaleString('es-ES'); }

  // ---------- Carga de datos ----------
  var cache = {};
  function json(ruta, sinCache) {
    var url = BASE + ruta + (sinCache ? (ruta.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now() : '');
    if (!sinCache && cache[url]) return cache[url];
    var p = fetch(url).then(function (r) {
      if (!r.ok) throw new Error('No se pudo cargar ' + ruta + ' (' + r.status + ')');
      return r.json();
    });
    if (!sinCache) cache[url] = p;
    return p;
  }
  function jsonOpcional(ruta, defecto) {
    return json(ruta, true).catch(function () { return defecto; });
  }

  var TIPOS_DOC = {
    'solicitud': 'Solicitud o instancia', 'representacion': 'Representación', 'identidad': 'Identidad (DNI/NIE/NIF)',
    'pago-tasa': 'Pago de tasa', 'declaracion-responsable': 'Declaración responsable', 'proyecto-tecnico': 'Proyecto técnico',
    'memoria': 'Memoria', 'planos': 'Planos', 'fotografias': 'Fotografías', 'presupuesto': 'Presupuesto', 'seguro': 'Seguro',
    'titularidad-propiedad': 'Titularidad o propiedad', 'bancario': 'Datos bancarios', 'empadronamiento': 'Empadronamiento',
    'libro-familia': 'Libro de familia', 'renta-ingresos': 'Renta o ingresos', 'vehiculo': 'Vehículo',
    'certificado-tecnico': 'Certificado técnico', 'estatutos-sociedad': 'Estatutos o sociedad', 'medico-sanitario': 'Médico o sanitario',
    'generico-otros': 'Otra documentación', 'otro': 'Sin clasificar'
  };
  var SILENCIO = { 'positivo': 'Positivo', 'negativo': 'Negativo', 'no procede': 'No procede', 'mixto': 'Mixto', 'caducidad': 'Caducidad', 'otro': 'Otro' };
  var TASA = { 'si': 'Con tasa', 'no': 'Sin tasa', 'ver_ordenanza': 'Según ordenanza' };

  /* Carga el índice y aplica la capa de ajustes del admin (config/*.json):
   *  - correcciones de clasificación por trámite
   *  - nombres, sinónimos y ocultación de procedimientos tipo
   *  - ocultación y notas de municipios
   */
  function cargarTodo() {
    return Promise.all([
      json('data/indice.json'), json('data/municipios.json'), json('data/funcal.json'), json('data/meta.json'),
      jsonOpcional('config/correcciones.json', { correcciones: {} }),
      jsonOpcional('config/procedimientos.json', { procedimientos: {} }),
      jsonOpcional('config/municipios.json', { municipios: {} }),
      jsonOpcional('config/portal.json', {})
    ]).then(function (r) {
      var I = r[0], MU = r[1], F = r[2], META = r[3];
      var corr = r[4].correcciones || {}, cProc = r[5].procedimientos || {}, cMun = r[6].municipios || {}, portal = r[7] || {};

      var FESP = {}, FCOM = {};
      F.funciones.forEach(function (f) { FCOM[f.codigo] = f; f.especificas.forEach(function (e) { FESP[e.codigo] = e; }); });

      // Procedimientos tipo
      var procs = I.procedimientos.map(function (p, i) {
        var c = cProc[p[0]] || {};
        return { i: i, id: p[0], nombre: c.nombre || p[1], esp: c.funcal_especifica || p[2], sinonimos: c.sinonimos || p[3] || [], sinonimos_origen: p[3] || [],
                 oculto: !!c.oculto, n: 0, municipios: new Set() };
      });
      var procPorId = {}; procs.forEach(function (p) { procPorId[p.id] = p; });

      // Municipios: los del índice (con datos) + todos los del mapa
      var munsIdx = I.municipios.map(function (m) { return m[0]; });
      var muns = MU.municipios.map(function (m) {
        var c = cMun[m.slug] || {};
        return Object.assign({}, m, { oculto: !!c.oculto, nota: c.nota || '', url_sede_original: m.url_sede, url_sede: c.url_sede || m.url_sede,
          lat: c.lat != null ? c.lat : m.lat, lon: c.lon != null ? c.lon : m.lon });
      });
      var munPorSlug = {}; muns.forEach(function (m) { munPorSlug[m.slug] = m; });

      var C = {}; I.campos.forEach(function (k, i) { C[k] = i; });
      var tramites = I.tramites.map(function (f) {
        var t = { id: f[C.id], slug: munsIdx[f[C.m]], titulo: f[C.titulo], esp: f[C.esp],
          proc: f[C.proc] == null ? null : I.procedimientos[f[C.proc]][0], conf: f[C.conf], ndoc: f[C.ndoc], dias: f[C.dias],
          sil: f[C.sil], tasa: f[C.tasa], online: !!f[C.online], texto: f[C.texto], corregido: false };
        var c = corr[t.id];
        if (c) {
          if (c.esp) t.esp = c.esp;
          if ('proc' in c) t.proc = c.proc || null;
          if (c.revisado) t.conf = Math.max(t.conf, 0.95);
          t.corregido = true; t.nota = c.nota || '';
        }
        return t;
      });
      tramites = tramites.filter(function (t) { var m = munPorSlug[t.slug]; return !(m && m.oculto); });
      tramites.forEach(function (t) {
        var p = t.proc && procPorId[t.proc];
        if (p) { p.n++; p.municipios.add(t.slug); }
        t._tit = new Set(tokens(t.titulo, true));
        t._txt = new Set(tokens(t.texto + ' ' + ((p && p.sinonimos) ? p.sinonimos.join(' ') : ''), true));
      });
      procs.forEach(function (p) {
        p._tok = new Set(tokens(p.nombre + ' ' + (p.sinonimos || []).join(' ') + ' ' + (FESP[p.esp] ? FESP[p.esp].nombre : ''), true));
        p._frases = [p.nombre].concat(p.sinonimos || []).map(norm);
      });

      return { I: I, META: META, FUNCAL: F, FESP: FESP, FCOM: FCOM, procs: procs, procPorId: procPorId,
        muns: muns, munPorSlug: munPorSlug, tramites: tramites, portal: portal,
        config: { correcciones: corr, procedimientos: cProc, municipios: cMun } };
    });
  }

  // ---------- Búsqueda ----------
  function detectarProcedimiento(D, consulta) {
    var q = tokens(consulta), nq = norm(consulta);
    if (!q.length) return null;
    var mejor = null;
    D.procs.forEach(function (p) {
      if (p.oculto || !p.n) return;
      var hits = q.filter(function (w) { return p._tok.has(w); }).length;
      var s = hits / q.length;
      if (p._frases.some(function (f) { return f && (nq.indexOf(f) > -1 || (f.length > 6 && f.indexOf(nq) > -1)); })) s += 1;
      if (s > 0 && (!mejor || s > mejor.s || (s === mejor.s && p.n > mejor.p.n))) mejor = { p: p, s: s };
    });
    return mejor && mejor.s >= 0.6 ? mejor.p : null;
  }

  function buscar(D, consulta, opciones) {
    opciones = opciones || {};
    var q = tokens(consulta);
    var proc = opciones.proc || null;
    var res = [];
    D.tramites.forEach(function (t) {
      if (opciones.slug && t.slug !== opciones.slug) return;
      if (opciones.funcion && t.esp.slice(0, 2) !== opciones.funcion) return;
      if (opciones.esp && t.esp !== opciones.esp) return;
      var s = 0;
      if (q.length) {
        q.forEach(function (w) {
          if (t._tit.has(w)) s += 2;
          else if (t._txt.has(w)) s += 1;
          else if (w.length > 4) {
            for (var x of t._tit) { if (x.indexOf(w) === 0) { s += 0.6; break; } }
          }
        });
        if (s === 0 && !(proc && t.proc === proc.id)) return;
      }
      if (proc && t.proc === proc.id) s += 4;
      if (!q.length && !proc && !opciones.funcion && !opciones.esp) return;
      res.push({ t: t, s: s });
    });
    res.sort(function (a, b) { return b.s - a.s || a.t.titulo.localeCompare(b.t.titulo, 'es'); });
    return res.map(function (r) { return r.t; });
  }

  function mediana(v) {
    v = v.filter(function (x) { return x != null; }).sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  global.ETT = { BASE: BASE, norm: norm, tokens: tokens, esc: esc, fmt: fmt, json: json, jsonOpcional: jsonOpcional,
    cargarTodo: cargarTodo, detectarProcedimiento: detectarProcedimiento,
    buscar: buscar, mediana: mediana, TIPOS_DOC: TIPOS_DOC, SILENCIO: SILENCIO, TASA: TASA };
})(window);
