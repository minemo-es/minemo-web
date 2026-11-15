/* Encuentra tu trámite [PROTOTIPO] · buscador público */
(function () {
  'use strict';
  var E = window.ETT, esc = E.esc, fmt = E.fmt;
  var D = null;                                 // datos cargados
  var S = { slug: '', q: '', proc: '', fun: '' }; // estado (se refleja en la URL)
  var POR_PAGINA = 25;
  var $ = function (id) { return document.getElementById(id); };
  var res = $('resultados');

  res.innerHTML = '<div class="cargando">Cargando los trámites…</div>';

  Promise.all([E.cargarTodo(), E.json('data/mapa_espana.json')]).then(function (r) {
    D = r[0]; D.mapa = r[1];
    prepararPortada();
    dibujarMapa();
    rellenarSelector();
    pintarRadiografia();
    leerURL();
    render();
  }).catch(function (e) {
    res.innerHTML = '<div class="bloque"><h2>No se han podido cargar los datos</h2><p class="sub">' + esc(e.message) + '</p></div>';
  });

  // ---------------- Portada ----------------
  function munsConDatos() {
    var s = new Set(); D.tramites.forEach(function (t) { s.add(t.slug); }); return s;
  }
  function prepararPortada() {
    var p = D.portal || {};
    if (p.titulo) $('p-titulo').textContent = p.titulo;
    if (p.subtitulo) $('p-subtitulo').textContent = p.subtitulo;
    if (p.aviso) $('p-aviso').textContent = p.aviso;
    $('c-tramites').textContent = fmt(D.tramites.length);
    $('c-municipios').textContent = fmt(munsConDatos().size);
    $('f-version').textContent = 'datos del ' + new Date(D.META.version).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
    var m = D.META.clasificacion_metodos || {}, reglas = 0, modelo = 0;
    Object.keys(m).forEach(function (k) { if (k.indexOf('modelo') === 0) modelo += m[k]; else reglas += m[k]; });
    $('metodo').innerHTML = 'Extraídos de ' + fmt(munsConDatos().size) + ' sedes electrónicas. ' + fmt(reglas) +
      ' trámites se clasificaron con reglas revisables y ' + fmt(modelo) + ' con un modelo automático (marcados como «clasificación orientativa»). ' +
      fmt(D.procs.filter(function (p) { return p.n; }).length) + ' procedimientos tipo permiten comparar el mismo trámite entre ayuntamientos.';
    var ej = (p.ejemplos && p.ejemplos.length) ? p.ejemplos : ['pedir un certificado de padrón', 'quiero hacer un fraccionamiento de pago', 'licencia de obra menor', 'pedir un vado'];
    $('ejemplos').innerHTML = ej.map(function (t) { return '<button type="button" class="chip" data-q="' + esc(t) + '">' + esc(t) + '</button>'; }).join('');
    $('ejemplos').addEventListener('click', function (e) {
      var b = e.target.closest('[data-q]'); if (!b) return;
      $('q').value = b.dataset.q; S.q = b.dataset.q; S.proc = ''; S.fun = ''; actualizar(true);
    });
    $('f-buscar').addEventListener('submit', function (e) {
      e.preventDefault(); S.q = $('q').value.trim(); S.proc = ''; S.fun = ''; S.slug = $('sel-mun').value; actualizar(true);
    });
    $('sel-mun').addEventListener('change', function () { S.slug = this.value; actualizar(!!(S.q || S.proc || S.fun)); });
  }

  function rellenarSelector() {
    var con = munsConDatos(), n = {};
    D.tramites.forEach(function (t) { n[t.slug] = (n[t.slug] || 0) + 1; });
    var opts = D.muns.filter(function (m) { return !m.oculto; }).map(function (m) {
      var tiene = con.has(m.slug);
      return '<option value="' + esc(m.slug) + '"' + (tiene ? '' : ' disabled') + '>' + esc(m.municipio) + ' (' + esc(m.provincia) + ')' +
        (tiene ? ' · ' + fmt(n[m.slug]) : ' · sin catálogo') + '</option>';
    });
    $('sel-mun').insertAdjacentHTML('beforeend', opts.join(''));
  }

  // ---------------- Mapa ----------------
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, at) { var e = document.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); return e; }
  function dibujarMapa() {
    var svg = $('mapa'), M = D.mapa, n = {};
    svg.setAttribute('viewBox', M.viewBox);
    var gp = el('g', {});
    M.provincias.forEach(function (p) { var x = el('path', { d: p.d, 'class': 'prov', 'data-prov': p.nombre }); gp.appendChild(x); });
    svg.appendChild(gp);
    if (M.borde_canarias) svg.appendChild(el('path', { d: M.borde_canarias, 'class': 'borde' }));
    D.tramites.forEach(function (t) { n[t.slug] = (n[t.slug] || 0) + 1; });
    var gpt = el('g', { id: 'puntos' });
    D.muns.filter(function (m) { return !m.oculto && m.x != null; })
      .sort(function (a, b) { return (n[b.slug] || 0) - (n[a.slug] || 0); })
      .forEach(function (m) {
        var c = el('circle', { cx: m.x, cy: m.y, r: n[m.slug] ? (3.5 + Math.sqrt(n[m.slug]) / 3.6).toFixed(1) : 4,
          'class': 'pt ' + (n[m.slug] ? 'datos' : 'sin'), 'data-slug': m.slug, tabindex: n[m.slug] ? 0 : -1,
          role: 'button', 'aria-label': m.municipio + ', ' + (n[m.slug] ? n[m.slug] + ' trámites' : 'sin catálogo') });
        gpt.appendChild(c);
      });
    svg.appendChild(gpt);
    svg.appendChild(el('g', { id: 'etiquetas' }));

    var tip = $('tooltip');
    function mostrar(ev, slug) {
      var m = D.munPorSlug[slug]; if (!m) return;
      var extra = '';
      if (D._marcado) extra = D._marcado.has(slug) ? '<br>✔ ' + esc(D._marcadoTexto) : (n[slug] ? '<br>✘ No consta en su catálogo' : '');
      tip.innerHTML = '<b>' + esc(m.municipio) + '</b>' + esc(m.provincia) + '<br>' +
        (n[slug] ? fmt(n[slug]) + ' trámites' : 'Sin catálogo extraíble') + extra + (m.nota ? '<br><i>' + esc(m.nota) + '</i>' : '');
      var box = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, k = box.width / vb.width;
      tip.style.left = (svg.offsetLeft + m.x * k) + 'px'; tip.style.top = (svg.offsetTop + m.y * k) + 'px'; tip.hidden = false;
    }
    gpt.addEventListener('mouseover', function (e) { var s = e.target.dataset && e.target.dataset.slug; if (s) mostrar(e, s); });
    gpt.addEventListener('focusin', function (e) { var s = e.target.dataset && e.target.dataset.slug; if (s) mostrar(e, s); });
    gpt.addEventListener('mouseout', function () { tip.hidden = true; });
    gpt.addEventListener('focusout', function () { tip.hidden = true; });
    function elegir(e) {
      var s = e.target.dataset && e.target.dataset.slug; if (!s || !n[s]) return;
      S.slug = (S.slug === s) ? '' : s; $('sel-mun').value = S.slug; actualizar(true);
    }
    gpt.addEventListener('click', elegir);
    gpt.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); elegir(e); } });
  }

  /* marcado: Set de slugs que «tienen» lo buscado (null = vista normal) */
  function colorearMapa(marcado, texto) {
    D._marcado = marcado; D._marcadoTexto = texto || '';
    var hay = {};
    D.tramites.forEach(function (t) { hay[t.slug] = 1; });
    document.querySelectorAll('#puntos .pt').forEach(function (c) {
      var s = c.dataset.slug, cl = 'pt ';
      if (!hay[s]) cl += 'sin';
      else if (marcado) cl += marcado.has(s) ? 'si' : 'no';
      else cl += 'datos';
      if (s === S.slug) cl += ' sel';
      c.setAttribute('class', cl);
    });
    document.querySelectorAll('.ley-proc').forEach(function (x) { x.hidden = !marcado; });
    var et = $('etiquetas'); et.innerHTML = '';
    if (S.slug && D.munPorSlug[S.slug]) {
      var m = D.munPorSlug[S.slug], t = el('text', { x: m.x + 9, y: m.y - 9, 'class': 'etq' });
      t.textContent = m.municipio; et.appendChild(t);
      var nodo = document.querySelector('#puntos .pt[data-slug="' + S.slug + '"]'); if (nodo) nodo.parentNode.appendChild(nodo);
    }
    var provSel = S.slug && D.munPorSlug[S.slug] ? E.norm(D.munPorSlug[S.slug].provincia) : '';
    document.querySelectorAll('#mapa .prov').forEach(function (p) {
      var nn = E.norm(p.dataset.prov);
      p.setAttribute('class', 'prov' + (provSel && (nn.indexOf(provSel) > -1 || provSel.indexOf(nn) > -1) ? ' activa' : ''));
    });
  }

  // ---------------- URL ----------------
  function leerURL() {
    var u = new URLSearchParams(location.search);
    S.slug = u.get('m') || ''; S.q = u.get('q') || ''; S.proc = u.get('p') || ''; S.fun = u.get('f') || '';
    if (S.slug && !D.munPorSlug[S.slug]) S.slug = '';
    $('q').value = S.q; $('sel-mun').value = S.slug;
  }
  function escribirURL() {
    var u = new URLSearchParams();
    if (S.slug) u.set('m', S.slug); if (S.q) u.set('q', S.q); if (S.proc) u.set('p', S.proc); if (S.fun) u.set('f', S.fun);
    var s = u.toString();
    history.replaceState(null, '', location.pathname + (s ? '?' + s : ''));
  }
  function actualizar(irAResultados) {
    escribirURL(); render();
    if (irAResultados) res.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  window.addEventListener('popstate', function () { leerURL(); render(); });

  // ---------------- Render principal ----------------
  function render() {
    pintarFunciones();
    var mun = S.slug ? D.munPorSlug[S.slug] : null;
    if (!S.q && !S.proc && !S.fun) { colorearMapa(null); res.innerHTML = mun ? fichaMunicipio(mun) : bienvenida(); return; }

    var proc = S.proc ? D.procPorId[S.proc] : (S.q ? E.detectarProcedimiento(D, S.q) : null);
    var lista = E.buscar(D, S.q, { slug: S.slug, proc: proc, funcion: S.fun });
    var html = '';

    if (S.fun && !S.q && !S.proc) {
      var f = D.FCOM[S.fun];
      html = '<div class="bloque"><div class="cab-res"><div><h2>' + esc(S.fun + ' · ' + (f ? f.nombre : '')) + '</h2>' +
        '<p class="sub">' + fmt(lista.length) + ' trámites ' + (mun ? 'en ' + esc(mun.municipio) : 'en ' + fmt(new Set(lista.map(function (t) { return t.slug; })).size) + ' municipios') + '</p></div>' +
        botonLimpiar() + '</div>' + chipsEspecificas(lista) + listaTramites(lista, !mun) + '</div>';
      colorearMapa(mun ? null : new Set(lista.map(function (t) { return t.slug; })), 'Tiene trámites de esta función');
      res.innerHTML = html; enlazarLista(lista, !mun); return;
    }

    if (mun) {
      var tiene = proc ? lista.filter(function (t) { return t.proc === proc.id; }) : [];
      html += '<div class="bloque"><div class="cab-res"><div><p class="mun-cab">' + esc(mun.municipio) + ' · ' + esc(mun.provincia) + '</p>' +
        '<h2>' + (S.q ? '«' + esc(S.q) + '»' : esc(proc ? proc.nombre : '')) + '</h2>' +
        '<p class="sub">' + fmt(lista.length) + ' resultado' + (lista.length === 1 ? '' : 's') + ' en el catálogo de ' + esc(mun.municipio) + '</p></div>' + botonLimpiar() + '</div>';
      if (proc) {
        if (tiene.length) {
          html += '<p class="sub" style="margin-top:.8rem">Corresponde al procedimiento tipo <span class="et proc">' + esc(proc.nombre) + '</span>. ' +
            '<button class="boton sec peq" data-comparar="' + esc(proc.id) + '">Ver cómo se tramita en los ' + fmt(proc.municipios.size) + ' municipios</button></p>';
        } else {
          html += '<div class="aviso-no"><b>En el catálogo de ' + esc(mun.municipio) + ' no consta «' + esc(proc.nombre) + '».</b> ' +
            'Puede tramitarse por instancia general o por otro canal; consulta la sede. Lo ofrecen ' + fmt(proc.municipios.size) + ' municipios. ' +
            '<button class="boton peq" data-comparar="' + esc(proc.id) + '">Ver cómo lo ofrecen</button></div>';
        }
      }
      html += listaTramites(lista, false) + '</div>';
      colorearMapa(proc ? proc.municipios : null, proc ? proc.nombre : '');
      res.innerHTML = html; enlazarLista(lista, false); return;
    }

    // Todos los municipios
    if (proc) {
      html += comparativa(proc);
      var otros = lista.filter(function (t) { return t.proc !== proc.id; });
      if (otros.length) html += '<div class="bloque"><h3>Otros trámites relacionados con «' + esc(S.q || proc.nombre) + '»</h3>' + listaTramites(otros, true) + '</div>';
      colorearMapa(proc.municipios, proc.nombre);
      res.innerHTML = html; enlazarComparativa(); enlazarLista(otros, true); return;
    }
    var slugs = new Set(lista.map(function (t) { return t.slug; }));
    html += '<div class="bloque"><div class="cab-res"><div><h2>«' + esc(S.q) + '»</h2><p class="sub">' + fmt(lista.length) + ' trámites en ' + fmt(slugs.size) +
      ' municipios. No hemos identificado un procedimiento tipo: prueba con otras palabras o elige un municipio.</p></div>' + botonLimpiar() + '</div>' +
      listaTramites(lista, true) + '</div>';
    colorearMapa(slugs, 'Tiene resultados');
    res.innerHTML = html; enlazarLista(lista, true);
  }

  function botonLimpiar() { return '<button class="boton sec peq" data-limpiar>Nueva búsqueda</button>'; }

  function bienvenida() {
    var dest = (D.portal.destacados || []).map(function (id) { return D.procPorId[id]; }).filter(Boolean);
    if (!dest.length) dest = D.procs.slice().sort(function (a, b) { return b.municipios.size - a.municipios.size; }).slice(0, 8);
    return '<div class="bloque"><h2>Compara el mismo trámite en todos los municipios</h2>' +
      '<p class="sub">Escribe lo que necesitas o elige un trámite frecuente. Si eliges un municipio en el mapa, verás solo su catálogo.</p>' +
      '<div class="ejemplos" style="margin-top:1rem">' + dest.map(function (p) {
        return '<button class="chip" data-comparar="' + esc(p.id) + '">' + esc(p.nombre) + ' · ' + fmt(p.municipios.size) + ' municipios</button>';
      }).join('') + '</div></div>';
  }

  function fichaMunicipio(m) {
    var ts = D.tramites.filter(function (t) { return t.slug === m.slug; });
    var procs = new Set(ts.map(function (t) { return t.proc; }).filter(Boolean));
    var docs = E.mediana(ts.map(function (t) { return t.ndoc; })), dias = E.mediana(ts.map(function (t) { return t.dias; }));
    var faltan = (D.portal.destacados || []).map(function (id) { return D.procPorId[id]; }).filter(function (p) { return p && !procs.has(p.id); });
    var tienen = D.procs.filter(function (p) { return procs.has(p.id); }).sort(function (a, b) { return b.municipios.size - a.municipios.size; }).slice(0, 14);
    return '<div class="bloque"><div class="cab-res"><div><p class="mun-cab">' + esc(m.provincia) + '</p><h2>' + esc(m.municipio) + '</h2>' +
      '<p class="sub"><a href="' + esc(m.url_sede) + '" target="_blank" rel="noopener">Sede electrónica ↗</a>' + (m.nota ? ' · ' + esc(m.nota) : '') + '</p></div>' +
      '<button class="boton sec peq" data-quitar-mun>Ver todos los municipios</button></div>' +
      '<div class="cifras">' + cifra(fmt(ts.length), 'trámites publicados') + cifra(fmt(procs.size), 'procedimientos tipo') +
      cifra(docs == null ? '—' : fmt(docs), 'documentos por trámite (mediana)') + cifra(dias == null ? '—' : fmt(dias) + ' días', 'plazo de resolución (mediana)') +
      cifra(fmt(ts.filter(function (t) { return t.online; }).length), 'con enlace para tramitar') + '</div>' +
      '<h3 style="margin-top:1.4rem">Trámites frecuentes en ' + esc(m.municipio) + '</h3><div class="ejemplos">' +
      tienen.map(function (p) { return '<button class="chip" data-proc="' + esc(p.id) + '">' + esc(p.nombre) + '</button>'; }).join('') + '</div>' +
      (faltan.length ? '<p class="sub" style="margin-top:1rem">No constan en su catálogo: ' + faltan.map(function (p) { return '<button class="chip" data-comparar="' + esc(p.id) + '">' + esc(p.nombre) + '</button>'; }).join(' ') + '</p>' : '') +
      '<p class="sub" style="margin-top:1rem">También puedes explorar sus trámites <a href="#funciones">por funciones</a>.</p></div>';
  }
  function cifra(v, t) { return '<div class="cifra"><b>' + v + '</b><span>' + esc(t) + '</span></div>'; }

  // ---------------- Comparativa de un procedimiento tipo ----------------
  function comparativa(p) {
    var ts = D.tramites.filter(function (t) { return t.proc === p.id; });
    var porMun = {}; ts.forEach(function (t) { (porMun[t.slug] = porMun[t.slug] || []).push(t); });
    var con = munsConDatos(), sinEl = Array.from(con).filter(function (s) { return !porMun[s]; });
    var docs = E.mediana(ts.map(function (t) { return t.ndoc; })), dias = E.mediana(ts.map(function (t) { return t.dias; }));
    var maxDoc = Math.max.apply(null, ts.map(function (t) { return t.ndoc || 0; }).concat([1]));
    var maxDias = Math.max.apply(null, ts.map(function (t) { return t.dias || 0; }).concat([1]));
    var sil = {}, tas = {};
    ts.forEach(function (t) { if (t.sil) sil[t.sil] = (sil[t.sil] || 0) + 1; if (t.tasa) tas[t.tasa] = (tas[t.tasa] || 0) + 1; });
    var f = D.FESP[p.esp];
    var filas = Object.keys(porMun).map(function (s) { return [D.munPorSlug[s], porMun[s]]; })
      .sort(function (a, b) { return a[0].municipio.localeCompare(b[0].municipio, 'es'); });
    var h = '<div class="bloque" id="comparativa"><div class="cab-res"><div><p class="mun-cab">Procedimiento tipo · FUNCAL ' + esc(p.esp) + (f ? ' ' + esc(f.nombre) : '') + '</p>' +
      '<h2>' + esc(p.nombre) + '</h2><p class="sub">Así se tramita en cada municipio. Pulsa un municipio para ver sus fichas.</p></div>' + botonLimpiar() + '</div>' +
      '<div class="cifras">' + cifra(fmt(porMun ? Object.keys(porMun).length : 0) + ' / ' + fmt(con.size), 'municipios lo ofrecen') +
      cifra(docs == null ? '—' : fmt(docs), 'documentos (mediana)') + cifra(dias == null ? '—' : fmt(dias) + ' días', 'plazo (mediana)') +
      cifra(resumen(sil, E.SILENCIO), 'silencio administrativo') + cifra(resumen(tas, E.TASA), 'tasa') + '</div>' +
      '<div class="tabla-envoltura"><table class="tabla" id="tabla-comp"><thead><tr><th data-k="0">Municipio</th><th data-k="1">Trámite en su sede</th>' +
      '<th data-k="2" class="num">Documentos</th><th data-k="3" class="num">Plazo</th><th data-k="4">Silencio</th><th data-k="5">Tasa</th><th>Enlaces</th></tr></thead><tbody>';
    filas.forEach(function (fm) {
      fm[1].forEach(function (t, i) {
        h += '<tr><td>' + (i ? '' : '<a href="#" class="mun-link" data-mun="' + esc(fm[0].slug) + '">' + esc(fm[0].municipio) + '</a><br><small>' + esc(fm[0].provincia) + '</small>') + '</td>' +
          '<td>' + esc(t.titulo) + '</td>' +
          '<td class="num" data-v="' + (t.ndoc || 0) + '">' + fmt(t.ndoc) + '<span class="barra-h" style="width:' + Math.round(40 * (t.ndoc || 0) / maxDoc) + 'px"></span></td>' +
          '<td class="num" data-v="' + (t.dias == null ? 99999 : t.dias) + '">' + (t.dias == null ? '—' : fmt(t.dias) + ' d') + (t.dias ? '<span class="barra-h albero" style="width:' + Math.round(40 * t.dias / maxDias) + 'px"></span>' : '') + '</td>' +
          '<td>' + esc(E.SILENCIO[t.sil] || '—') + '</td><td>' + esc(E.TASA[t.tasa] || '—') + '</td>' +
          '<td><a href="' + esc(urlFicha(t)) + '" target="_blank" rel="noopener">Ficha ↗</a></td></tr>';
      });
    });
    h += '</tbody></table></div>';
    if (sinEl.length) {
      h += '<p class="sub" style="margin-top:1rem"><b>No consta en el catálogo de ' + fmt(sinEl.length) + ' municipios:</b> ' +
        sinEl.map(function (s) { return D.munPorSlug[s]; }).filter(Boolean).sort(function (a, b) { return a.municipio.localeCompare(b.municipio, 'es'); })
          .map(function (m) { return esc(m.municipio); }).join(', ') + '.</p>';
    }
    return h + '</div>';
  }
  function resumen(obj, nombres) {
    var k = Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a]; });
    if (!k.length) return '—';
    var tot = k.reduce(function (s, x) { return s + obj[x]; }, 0);
    return esc(nombres[k[0]] || k[0]) + ' <small style="font-size:.9rem;font-weight:600">' + Math.round(100 * obj[k[0]] / tot) + '%</small>';
  }
  function urlFicha(t) {
    var m = D.munPorSlug[t.slug], det = t.id.split(':')[1];
    return 'https://' + (m ? m.sede : t.id.split(':')[0]) + '/sta/CarpetaPublic/doEvent?APP_CODE=STA&PAGE_CODE=CATALOGO&DETALLE=' + det;
  }
  function enlazarComparativa() {
    var tb = $('tabla-comp'); if (tb) ordenable(tb);
  }

  // ---------------- Listas de trámites ----------------
  function chipsEspecificas(lista) {
    var c = {}; lista.forEach(function (t) { c[t.esp] = (c[t.esp] || 0) + 1; });
    var k = Object.keys(c).sort();
    if (k.length < 2) return '';
    return '<div class="ejemplos" style="margin-top:.9rem">' + k.map(function (e) {
      return '<span class="et funcal">' + esc(e + ' ' + (D.FESP[e] ? D.FESP[e].nombre : '')) + ' · ' + c[e] + '</span>';
    }).join('') + '</div>';
  }
  function itemTramite(t, conMun) {
    var m = D.munPorSlug[t.slug], p = t.proc ? D.procPorId[t.proc] : null, f = D.FESP[t.esp];
    return '<li class="tramite" data-id="' + esc(t.id) + '">' + (conMun ? '<p class="mun">' + esc(m ? m.municipio : t.slug) + '</p>' : '') +
      '<h4><button type="button" data-detalle="' + esc(t.id) + '" aria-expanded="false">' + esc(t.titulo) + '</button></h4>' +
      '<div class="etiquetas"><span class="et funcal" title="Función FUNCAL">' + esc(t.esp + ' ' + (f ? f.nombre : '')) + '</span>' +
      (p ? '<span class="et proc">' + esc(p.nombre) + '</span>' : '') +
      (t.conf < 0.75 ? '<span class="et aviso" title="Asignada por un modelo automático">clasificación orientativa</span>' : '') + '</div>' +
      '<div class="metr"><span>Documentos: <b>' + fmt(t.ndoc) + '</b></span><span>Plazo: <b>' + (t.dias == null ? '—' : fmt(t.dias) + ' días') + '</b></span>' +
      '<span>Silencio: <b>' + esc(E.SILENCIO[t.sil] || '—') + '</b></span><span>Tasa: <b>' + esc(E.TASA[t.tasa] || '—') + '</b></span></div>' +
      '<div class="acciones-t"><button class="boton peq" data-detalle="' + esc(t.id) + '">Ver requisitos</button>' +
      '<a class="boton sec peq" href="' + esc(urlFicha(t)) + '" target="_blank" rel="noopener">Ficha oficial ↗</a>' +
      (p && !conMun ? '<button class="boton sec peq" data-comparar="' + esc(p.id) + '">Comparar con otros municipios</button>' : '') +
      '</div><div class="detalle" hidden></div></li>';
  }
  function listaTramites(lista, conMun) {
    if (!lista.length) return '<p class="vacio">No hay trámites que coincidan.</p>';
    return '<ul class="lista" data-pag="1">' + lista.slice(0, POR_PAGINA).map(function (t) { return itemTramite(t, conMun); }).join('') + '</ul>' +
      (lista.length > POR_PAGINA ? '<button class="boton sec mas" data-mas>Ver más (' + fmt(lista.length - POR_PAGINA) + ')</button>' : '');
  }
  function enlazarLista(lista, conMun) {
    res.querySelectorAll('[data-mas]').forEach(function (b) {
      b.addEventListener('click', function () {
        var ul = b.previousElementSibling, pag = +ul.dataset.pag + 1;
        ul.insertAdjacentHTML('beforeend', lista.slice((pag - 1) * POR_PAGINA, pag * POR_PAGINA).map(function (t) { return itemTramite(t, conMun); }).join(''));
        ul.dataset.pag = pag;
        var resto = lista.length - pag * POR_PAGINA;
        if (resto > 0) b.textContent = 'Ver más (' + fmt(resto) + ')'; else b.remove();
      });
    });
  }

  // Delegación de eventos en resultados
  res.addEventListener('click', function (e) {
    var b;
    if ((b = e.target.closest('[data-limpiar]'))) { S.q = ''; S.proc = ''; S.fun = ''; $('q').value = ''; actualizar(false); $('q').focus(); return; }
    if ((b = e.target.closest('[data-quitar-mun]'))) { S.slug = ''; $('sel-mun').value = ''; actualizar(false); return; }
    if ((b = e.target.closest('[data-comparar]'))) { S.proc = b.dataset.comparar; S.slug = ''; S.fun = ''; $('sel-mun').value = ''; actualizar(true); return; }
    if ((b = e.target.closest('[data-proc]'))) { S.proc = b.dataset.proc; S.q = ''; $('q').value = ''; S.fun = ''; actualizar(true); return; }
    if ((b = e.target.closest('[data-mun]'))) {
      e.preventDefault(); S.slug = b.dataset.mun; $('sel-mun').value = S.slug;
      if (!S.proc && S.q) { var p = E.detectarProcedimiento(D, S.q); if (p) S.proc = p.id; }
      actualizar(true); return;
    }
    if ((b = e.target.closest('[data-detalle]'))) { verDetalle(b.closest('.tramite')); }
  });

  // ---------------- Detalle (carga la ficha completa del municipio) ----------------
  function verDetalle(li) {
    var caja = li.querySelector('.detalle'), btn = li.querySelector('h4 button');
    if (!caja.hidden) { caja.hidden = true; btn.setAttribute('aria-expanded', 'false'); return; }
    caja.hidden = false; btn.setAttribute('aria-expanded', 'true');
    if (caja.dataset.ok) return;
    caja.innerHTML = '<div class="cargando">Cargando la ficha…</div>';
    var id = li.dataset.id, t = D.tramites.find(function (x) { return x.id === id; });
    E.json('data/municipios/' + t.slug + '.json').then(function (M) {
      var r = M.tramites.find(function (x) { return x.id === id; });
      if (!r) { caja.innerHTML = '<p>No se ha encontrado la ficha.</p>'; return; }
      var ep = r.epigrafes || {}, h = '';
      if (r.resumen || ep.descripcion) h += sec('Descripción', '<p>' + esc(ep.descripcion || r.resumen) + '</p>');
      if (ep.finalidad) h += sec('Finalidad', '<p>' + esc(ep.finalidad) + '</p>');
      if (r.documentos && r.documentos.length) {
        h += sec('Documentos que hay que presentar (' + r.documentos.length + ')', '<ul class="docs">' + r.documentos.map(function (d) {
          return '<li>' + (d.url ? '<a href="' + esc(d.url) + '" target="_blank" rel="noopener">' + esc(d.nombre) + '</a>' : esc(d.nombre)) +
            (d.obligatorio ? '<span class="ob">obligatorio</span>' : '') + (d.descripcion ? '<br><small>' + esc(d.descripcion) + '</small>' : '') + '</li>';
        }).join('') + '</ul>');
      } else h += sec('Documentos', '<p>La ficha no indica documentación.</p>');
      [['plazo_resolucion', 'Plazo de resolución'], ['silencio_administrativo', 'Silencio administrativo'], ['pago_tasas', 'Tasas'],
       ['organo_gestor', 'Órgano gestor'], ['normativa', 'Normativa'], ['informacion_adicional', 'Información adicional']].forEach(function (k) {
        if (ep[k[0]]) h += sec(k[1], '<p>' + esc(ep[k[0]]) + '</p>');
      });
      if (r.documentacion_relacionada && r.documentacion_relacionada.length) {
        h += sec('Documentación relacionada', '<ul>' + r.documentacion_relacionada.map(function (d) {
          var u = d.url || d.u, n = d.nombre || d.texto || d.t || u || ''; return '<li>' + (u ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(n) + '</a>' : esc(n)) + '</li>';
        }).join('') + '</ul>');
      }
      var enl = '<a class="boton peq" href="' + esc(r.url_ficha) + '" target="_blank" rel="noopener">Ver la ficha en la sede de ' + esc(r.municipio) + ' ↗</a>';
      if (r.url_tramitar) enl += ' <a class="boton sec peq" href="' + esc(r.url_tramitar) + '" target="_blank" rel="noopener">Tramitar en línea ↗</a>';
      h += '<div>' + enl + '</div><p class="sub" style="font-size:.8rem">Información extraída el ' + esc(String(r.extraido_at || '').slice(0, 10)) + '. Comprueba siempre la ficha oficial.</p>';
      caja.innerHTML = h; caja.dataset.ok = '1';
    }).catch(function (e) { caja.innerHTML = '<p>No se ha podido cargar la ficha: ' + esc(e.message) + '</p>'; });
  }
  function sec(t, c) { return '<div><h5>' + esc(t) + '</h5>' + c + '</div>'; }

  // ---------------- Funciones FUNCAL ----------------
  function pintarFunciones() {
    var c = {};
    D.tramites.forEach(function (t) { if (!S.slug || t.slug === S.slug) { var k = t.esp.slice(0, 2); c[k] = (c[k] || 0) + 1; } });
    $('fun-ambito').textContent = S.slug && D.munPorSlug[S.slug] ? 'en ' + D.munPorSlug[S.slug].municipio : 'en todos los municipios';
    $('lista-funciones').innerHTML = D.FUNCAL.funciones.map(function (f) {
      var n = c[f.codigo] || 0;
      return '<button class="fun' + (n ? '' : ' vacia') + (S.fun === f.codigo ? ' activo' : '') + '" data-fun="' + f.codigo + '"' + (n ? '' : ' disabled') + '>' +
        '<span class="cod">' + f.codigo + '</span><span class="nom">' + esc(f.nombre) + '</span><span class="n">' + fmt(n) + '</span></button>';
    }).join('');
  }
  $('lista-funciones').addEventListener('click', function (e) {
    var b = e.target.closest('[data-fun]'); if (!b) return;
    S.fun = b.dataset.fun; S.q = ''; S.proc = ''; $('q').value = ''; actualizar(true);
  });

  // ---------------- Radiografía ----------------
  function pintarRadiografia() {
    var t = $('tabla-radio'), n = {}, nproc = {}, docs = {}, dias = {};
    D.tramites.forEach(function (x) {
      n[x.slug] = (n[x.slug] || 0) + 1;
      (nproc[x.slug] = nproc[x.slug] || new Set()); if (x.proc) nproc[x.slug].add(x.proc);
      (docs[x.slug] = docs[x.slug] || []).push(x.ndoc); (dias[x.slug] = dias[x.slug] || []).push(x.dias);
    });
    var max = Math.max.apply(null, Object.values(n));
    var filas = D.muns.filter(function (m) { return !m.oculto; }).map(function (m) {
      var cob = m.cobertura_epigrafes || {};
      return { m: m, v: [m.municipio, m.provincia, n[m.slug] || 0, nproc[m.slug] ? nproc[m.slug].size : 0,
        E.mediana(docs[m.slug] || []), E.mediana(dias[m.slug] || []),
        cob.documentos_presentar, cob.silencio_administrativo, cob.pago_tasas] };
    });
    var cab = ['Municipio', 'Provincia', 'Trámites', 'Proced. tipo', 'Docs (mediana)', 'Plazo días (mediana)', '% con documentos', '% con silencio', '% con tasas'];
    var pct = function (v) { return v == null ? '—' : Math.round(v * 100) + '%'; };
    t.innerHTML = '<thead><tr>' + cab.map(function (c, i) { return '<th data-k="' + i + '"' + (i > 1 ? ' class="num"' : '') + ' aria-sort="none">' + c + '</th>'; }).join('') + '</tr></thead><tbody>' +
      filas.map(function (f) {
        var v = f.v, sin = !v[2];
        return '<tr' + (sin ? ' class="sin-datos"' : '') + '><td>' + (sin ? esc(v[0]) : '<a href="#buscar" class="mun-link" data-radio="' + esc(f.m.slug) + '">' + esc(v[0]) + '</a>') + '</td><td>' + esc(v[1]) + '</td>' +
          '<td class="num" data-v="' + v[2] + '">' + fmt(v[2]) + (v[2] ? '<span class="barra-h" style="width:' + Math.round(60 * v[2] / max) + 'px"></span>' : '') + '</td>' +
          '<td class="num" data-v="' + v[3] + '">' + fmt(v[3]) + '</td>' +
          '<td class="num" data-v="' + (v[4] == null ? -1 : v[4]) + '">' + (v[4] == null ? '—' : fmt(v[4])) + '</td>' +
          '<td class="num" data-v="' + (v[5] == null ? -1 : v[5]) + '">' + (v[5] == null ? '—' : fmt(v[5])) + '</td>' +
          [6, 7, 8].map(function (k) { return '<td class="num" data-v="' + (v[k] == null ? -1 : v[k]) + '">' + pct(v[k]) + '</td>'; }).join('') + '</tr>';
      }).join('') + '</tbody>';
    ordenable(t);
    t.addEventListener('click', function (e) {
      var a = e.target.closest('[data-radio]'); if (!a) return;
      e.preventDefault(); S.slug = a.dataset.radio; $('sel-mun').value = S.slug; S.q = ''; S.proc = ''; S.fun = ''; $('q').value = '';
      escribirURL(); render(); document.getElementById('buscar').scrollIntoView({ behavior: 'smooth' });
    });
  }

  function ordenable(tabla) {
    tabla.querySelectorAll('th[data-k]').forEach(function (th) {
      th.setAttribute('aria-sort', th.getAttribute('aria-sort') || 'none');
      th.addEventListener('click', function () {
        var k = +th.dataset.k, asc = th.getAttribute('aria-sort') !== 'ascending';
        tabla.querySelectorAll('th[data-k]').forEach(function (x) { x.setAttribute('aria-sort', 'none'); });
        th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
        var tb = tabla.tBodies[0], filas = Array.from(tb.rows);
        filas.sort(function (a, b) {
          var ca = a.cells[k], cb = b.cells[k];
          var va = ca.dataset.v != null ? +ca.dataset.v : ca.textContent.trim(), vb = cb.dataset.v != null ? +cb.dataset.v : cb.textContent.trim();
          var r = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es');
          return asc ? r : -r;
        });
        filas.forEach(function (f) { tb.appendChild(f); });
      });
    });
  }
})();
