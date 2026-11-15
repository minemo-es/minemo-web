"""Exporta el JSON normalizado de «Encuentra tu trámite» a partir de norm.pkl.

Salida (carpeta data/):
  ../proyecto/datos-normalizados/tramites.json.gz   todos los trámites normalizados (comprimido)
  municipios/<slug>.json   los mismos registros, separados por municipio (carga bajo demanda)
  indice.json              índice compacto para el buscador en el navegador
  procedimientos.json      procedimientos tipo con la comparativa entre municipios («radiografía»)
  funcal.json              vocabulario FUNCAL con recuentos
  municipios.json          ficha y estadísticas de cada municipio
  meta.json                versión, fecha, métodos de clasificación
"""
import json, os, pickle, re, statistics, sys, unicodedata
from collections import Counter, defaultdict
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from reglas import PROCEDIMIENTOS

OUT = os.path.join(sys.argv[1] if len(sys.argv) > 1 else 'salida', 'data')
VERSION = date.today().isoformat()


def norm(s):
    s = unicodedata.normalize('NFD', (s or '').lower().replace('l·l', 'll'))
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return ' '.join(re.sub(r'[^a-z0-9ñ]+', ' ', s).split())


def slug(s):
    return norm(s).replace(' ', '-')


# ---------- tipología de documentos (para comparar la carga documental) ----------
TIPOS_DOC = [
    ('solicitud', r'\b(solicitud|solicitude|sol licitud|instancia|formulari\w*|impreso|modelo normalizado|sollicitud)\b'),
    ('representacion', r'\b(representacion|representacio|representante|otorgamiento|apoderamiento|poder notarial|autorizacion represent)'),
    ('identidad', r'\b(dni|nie|nif|cif|pasaporte|passaport|documento nacional|identidad|identidade|identitat|identificacion)\b'),
    ('pago-tasa', r'\b(tasa|taxa|autoliquidacion|autoliquidacio|justificante (de|del) (pago|ingreso)|carta de pago|abono)\b'),
    ('declaracion-responsable', r'\bdeclaracio\w* responsable\b'),
    ('proyecto-tecnico', r'\b(proyecto|projecte|proxecto)\b'),
    ('memoria', r'\bmemori\w*\b'),
    ('planos', r'\b(plano|planos|planol\w*|croquis|cartografia)\b'),
    ('fotografias', r'\b(fotografi\w*|fotos?)\b'),
    ('presupuesto', r'\b(presupuesto|pressupost)\b'),
    ('seguro', r'\b(seguro|asseguranca|poliza)\b'),
    ('titularidad-propiedad', r'\b(escritura|nota simple|titularidad|titulo de propiedad|contrato de (arrendamiento|alquiler|compraventa)|propiedad)\b'),
    ('bancario', r'\b(bancari\w*|iban|cuenta corriente|ficha de terceros|alta de terceros)\b'),
    ('empadronamiento', r'\b(empadronamiento|empadronament|padron)\b'),
    ('libro-familia', r'\b(libro de familia|llibre de familia)\b'),
    ('renta-ingresos', r'\b(renta|irpf|ingresos|nomina|pension|declaracion de la renta|prestacion)\b'),
    ('vehiculo', r'\b(permiso de circulacion|ficha tecnica|itv|vehiculo)\b'),
    ('certificado-tecnico', r'\b(certificado (final|tecnico|de instalacion)|boletin|certificat tecnic)\b'),
    ('estatutos-sociedad', r'\b(estatutos|escritura de constitucion|acta fundacional|registro de asociaciones)\b'),
    ('medico-sanitario', r'\b(informe medico|certificado medico|discapacidad|minusvalia|dependencia)\b'),
    ('generico-otros', r'\b(otra documentacion|otros documentos|documentacion (complementaria|adicional)|documento anexo|anexo|otros|documento \d+|documentacion)\b'),
]
TIPOS_RX = [(k, re.compile(p)) for k, p in TIPOS_DOC]


def tipo_doc(nombre):
    t = norm(nombre)
    for k, rx in TIPOS_RX:
        if rx.search(t):
            return k
    return 'otro'


def mediana(v):
    return round(statistics.median(v), 1) if v else None


def main():
    recs = pickle.load(open('norm.pkl', 'rb'))
    funcal = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'funcal.json'), encoding='utf-8'))
    os.makedirs(os.path.join(OUT, 'municipios'), exist_ok=True)

    for r in recs:
        for d in r['documentos']:
            d['tipo'] = tipo_doc(d['nombre'])
        r['tipos_documento'] = sorted({d['tipo'] for d in r['documentos']})
        r['municipio_slug'] = slug(r['municipio'])

    recs.sort(key=lambda r: (r['provincia'], r['municipio'], r['funcal']['especifica']['codigo'], r['titulo']))

    # ---------- tramites.json y por municipio ----------
    def dump(obj, *path, compact=True):
        p = os.path.join(OUT, *path)
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(obj, f, ensure_ascii=False, separators=(',', ':') if compact else None,
                      indent=None if compact else 1)
        return p

    # El conjunto completo se guarda comprimido fuera de data/ (proyecto/datos-normalizados/tramites.json.gz)
    import gzip
    dest = os.path.join(os.path.dirname(OUT), 'proyecto', 'datos-normalizados')
    os.makedirs(dest, exist_ok=True)
    with gzip.open(os.path.join(dest, 'tramites.json.gz'), 'wt', encoding='utf-8') as f:
        json.dump({'version': VERSION, 'total': len(recs), 'tramites': recs}, f, ensure_ascii=False, separators=(',', ':'))

    por_mun = defaultdict(list)
    for r in recs:
        por_mun[r['municipio_slug']].append(r)

    # ---------- municipios.json ----------
    municipios = []
    for ms, rs in sorted(por_mun.items(), key=lambda kv: kv[1][0]['municipio']):
        r0 = rs[0]
        nd = [r['n_documentos'] for r in rs]
        dias = [r['plazo_resolucion']['dias'] for r in rs if r['plazo_resolucion'] and r['plazo_resolucion'].get('dias')]
        sil = Counter(r['silencio'] for r in rs if r['silencio'])
        tas = Counter(r['tasa'] for r in rs if r['tasa'])
        municipios.append({
            'slug': ms, 'municipio': r0['municipio'], 'provincia': r0['provincia'], 'sede': r0['sede'],
            'url_sede': f"https://{r0['sede']}/sta/CarpetaPublic/doEvent?APP_CODE=STA&PAGE_CODE=PTS2_HOME",
            'n_tramites': len(rs),
            'n_tramitables_online': sum(1 for r in rs if r['url_tramitar']),
            'n_procedimientos_tipo': len({r['procedimiento_tipo']['id'] for r in rs if r['procedimiento_tipo']}),
            'n_funciones_funcal': len({r['funcal']['funcion']['codigo'] for r in rs}),
            'documentos_por_tramite_mediana': mediana(nd),
            'plazo_resolucion_dias_mediana': mediana(dias),
            'silencio': dict(sil), 'tasa': dict(tas),
            'cobertura_epigrafes': {k: round(sum(1 for r in rs if k in r['epigrafes_presentes']) / len(rs), 2)
                                    for k in ('descripcion', 'documentos_presentar', 'plazo_resolucion',
                                              'silencio_administrativo', 'pago_tasas', 'normativa', 'organo_gestor')},
        })
        dump({'version': VERSION, 'municipio': r0['municipio'], 'provincia': r0['provincia'], 'tramites': rs},
             'municipios', f'{ms}.json')
    # Coordenadas para el mapa (proyecto/tablas/municipios_coordenadas_ine.json) y municipios sin catálogo
    coords_p = os.path.join(os.path.dirname(OUT), 'proyecto', 'tablas', 'municipios_coordenadas_ine.json')
    if os.path.exists(coords_p):
        coords = json.load(open(coords_p, encoding='utf-8'))
        por_sede = {m['sede']: m for m in municipios}
        for host, v in coords.items():
            m = por_sede.get(host)
            if not m:
                m = {'slug': slug(v['municipio']), 'municipio': v['municipio'], 'provincia': v['provincia'], 'sede': host,
                     'url_sede': f"https://{host}/sta/CarpetaPublic/doEvent?APP_CODE=STA&PAGE_CODE=PTS2_HOME", 'n_tramites': 0}
                municipios.append(m)
            m.update({'estado': 'con_datos' if m.get('n_tramites') else 'sin_datos', 'ine': v['ine'], 'nombre_oficial': v['nombre_oficial'],
                      'lat': v['lat'], 'lon': v['lon'], 'x': v.get('x'), 'y': v.get('y')})
        municipios.sort(key=lambda m: m['municipio'])
    dump({'version': VERSION, 'municipios': municipios}, 'municipios.json', compact=False)

    # ---------- procedimientos.json (comparativa) ----------
    defs = {pid: dict(id=pid, nombre=nom, funcal_especifica=esp, sinonimos=sin) for pid, nom, esp, pats, sin in PROCEDIMIENTOS}
    FESP = {e['codigo']: e['nombre'] for f in funcal['funciones'] for e in f['especificas']}
    FCOM = {f['codigo']: f['nombre'] for f in funcal['funciones']}
    por_proc = defaultdict(list)
    for r in recs:
        if r['procedimiento_tipo']:
            por_proc[r['procedimiento_tipo']['id']].append(r)
    procedimientos = []
    for pid, d in defs.items():
        rs = por_proc.get(pid, [])
        mun = defaultdict(list)
        for r in rs:
            mun[r['municipio_slug']].append(r)
        filas = []
        for ms, mr in sorted(mun.items()):
            filas.append({
                'municipio': mr[0]['municipio'], 'municipio_slug': ms, 'provincia': mr[0]['provincia'],
                'tramites': [{
                    'id': r['id'], 'titulo': r['titulo'], 'url_ficha': r['url_ficha'], 'url_tramitar': r['url_tramitar'],
                    'n_documentos': r['n_documentos'], 'n_documentos_obligatorios': r['n_documentos_obligatorios'],
                    'tipos_documento': r['tipos_documento'],
                    'plazo_dias': (r['plazo_resolucion'] or {}).get('dias'),
                    'plazo_texto': (r['plazo_resolucion'] or {}).get('texto'),
                    'silencio': r['silencio'], 'tasa': r['tasa'], 'organo_gestor': r['organo_gestor'],
                } for r in mr],
            })
        nd = [r['n_documentos'] for r in rs]
        dias = [r['plazo_resolucion']['dias'] for r in rs if r['plazo_resolucion'] and r['plazo_resolucion'].get('dias')]
        tipos = Counter(t for r in rs for t in r['tipos_documento'])
        esp = d['funcal_especifica']
        procedimientos.append({
            **d,
            'funcal': {'funcion': {'codigo': esp[:2], 'nombre': FCOM.get(esp[:2])},
                       'especifica': {'codigo': esp, 'nombre': FESP.get(esp)}},
            'n_tramites': len(rs), 'n_municipios': len(mun),
            'radiografia': {
                'documentos_por_tramite': {'min': min(nd) if nd else None, 'mediana': mediana(nd), 'max': max(nd) if nd else None},
                'plazo_resolucion_dias': {'min': min(dias) if dias else None, 'mediana': mediana(dias),
                                          'max': max(dias) if dias else None, 'n_con_dato': len(dias)},
                'silencio': dict(Counter(r['silencio'] for r in rs if r['silencio'])),
                'tasa': dict(Counter(r['tasa'] for r in rs if r['tasa'])),
                'tramitable_online': sum(1 for r in rs if r['url_tramitar']),
                'tipos_documento_frecuencia': {k: round(v / len(rs), 2) for k, v in tipos.most_common()} if rs else {},
            },
            'municipios': filas,
        })
    procedimientos.sort(key=lambda p: (-p['n_municipios'], p['id']))
    dump({'version': VERSION, 'procedimientos': procedimientos}, 'procedimientos.json')

    # ---------- funcal.json con recuentos ----------
    cnt_f = Counter(r['funcal']['funcion']['codigo'] for r in recs)
    cnt_e = Counter(r['funcal']['especifica']['codigo'] for r in recs)
    mun_e = defaultdict(set)
    for r in recs:
        mun_e[r['funcal']['especifica']['codigo']].add(r['municipio_slug'])
    procs_e = defaultdict(list)
    for p in procedimientos:
        procs_e[p['funcal_especifica']].append(p['id'])
    fun_out = []
    for f in funcal['funciones']:
        fun_out.append({
            'codigo': f['codigo'], 'nombre': f['nombre'], 'n_tramites': cnt_f.get(f['codigo'], 0),
            'especificas': [{'codigo': e['codigo'], 'nombre': e['nombre'], 'n_tramites': cnt_e.get(e['codigo'], 0),
                             'n_municipios': len(mun_e.get(e['codigo'], ())), 'procedimientos_tipo': procs_e.get(e['codigo'], [])}
                            for e in f['especificas']],
        })
    dump({'version': VERSION, 'vocabulario': funcal.get('vocabulario'), 'fuente': funcal.get('fuente'), 'funciones': fun_out},
         'funcal.json', compact=False)

    # ---------- indice.json (compacto para búsqueda en cliente) ----------
    con_datos = [m for m in municipios if m.get('n_tramites')]
    mun_idx = {m['slug']: i for i, m in enumerate(con_datos)}
    proc_idx = {p['id']: i for i, p in enumerate(procedimientos)}
    campos = ['id', 'm', 'titulo', 'esp', 'proc', 'conf', 'ndoc', 'dias', 'sil', 'tasa', 'online', 'texto']
    filas = []
    for r in recs:
        sin = ' '.join(defs[r['procedimiento_tipo']['id']]['sinonimos']) if r['procedimiento_tipo'] else ''
        texto = norm(' '.join([r['titulo'], r['funcal']['especifica']['nombre'], sin, (r['resumen'] or '')[:160]]))
        filas.append([r['id'], mun_idx[r['municipio_slug']], r['titulo'], r['funcal']['especifica']['codigo'],
                      proc_idx[r['procedimiento_tipo']['id']] if r['procedimiento_tipo'] else None,
                      r['funcal']['confianza'], r['n_documentos'], (r['plazo_resolucion'] or {}).get('dias'),
                      r['silencio'], r['tasa'], 1 if r['url_tramitar'] else 0, texto])
    dump({'version': VERSION, 'campos': campos,
          'municipios': [[m['slug'], m['municipio'], m['provincia']] for m in con_datos],
          'procedimientos': [[p['id'], p['nombre'], p['funcal_especifica'], p['sinonimos']] for p in procedimientos],
          'tramites': filas}, 'indice.json')

    # ---------- meta.json ----------
    meta = {
        'nombre': 'Encuentra tu trámite [PROTOTIPO]', 'version': VERSION,
        'fuente': 'Catálogos de procedimientos de sedes electrónicas municipales T-Systems (STA), extracción SEDE() v1.2 formato elvira-recurso-1',
        'n_municipios': len([m for m in municipios if m.get('n_tramites')]), 'n_tramites': len(recs), 'n_procedimientos_tipo': len(procedimientos),
        'n_procedimientos_tipo_con_tramites': sum(1 for p in procedimientos if p['n_tramites']),
        'clasificacion_metodos': dict(Counter(r['funcal']['metodo'] for r in recs)),
        'con_procedimiento_tipo': sum(1 for r in recs if r['procedimiento_tipo']),
        'tipos_documento': [k for k, _ in TIPOS_DOC] + ['otro'],
    }
    dump(meta, 'meta.json', compact=False)
    print(json.dumps(meta, ensure_ascii=False, indent=1))


if __name__ == '__main__':
    main()
