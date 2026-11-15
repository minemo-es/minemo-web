# -*- coding: utf-8 -*-
"""Genera el JSON normalizado de «Encuentra tu trámite» a partir de los JSON extraídos de las sedes STA."""
import json, pickle, re, unicodedata, collections, hashlib, datetime, os, sys
import numpy as np
from reglas import PROCEDIMIENTOS, FUNCAL_REGLAS, ORGANO_FUNCAL, EXCLUIR, PRIMERO, GENERICOS

OUT = sys.argv[1] if len(sys.argv) > 1 else 'salida'
os.makedirs(OUT + '/municipios', exist_ok=True)
FUN = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'funcal.json'), encoding='utf-8'))
FCOM = {f['codigo']: f['nombre'] for f in FUN['funciones']}
FESP = {e['codigo']: e['nombre'] for f in FUN['funciones'] for e in f['especificas']}
MUN = json.load(open('municipios.json'))
rows = pickle.load(open('raw.pkl', 'rb'))


def norm(s):
    s = str(s or '').lower().replace('l·l', 'll').replace('l.l', 'll')
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    return re.sub(r'\s+', ' ', re.sub(r'[^a-z0-9ñ]+', ' ', s)).strip()


_ord = {p[0]: i for i, p in enumerate(PROCEDIMIENTOS)}
def _prio(p):
    pid = p[0]
    return (0 if pid in PRIMERO else 2 if pid in GENERICOS else 1, _ord[pid])
SING_OK = set('lrndzj')
def sing(w):
    if len(w) > 4 and w.endswith('es') and w[-3] in SING_OK: return w[:-2]
    if len(w) > 3 and w.endswith('s') and not w.endswith('ss'): return w[:-1]
    return w
def nm(s):  # texto normalizado y en singular para comparar con las reglas
    return ' '.join(sing(w) for w in norm(s).split())
def rx(p):  # aplica la misma singularización a las palabras literales del patrón
    esc = {}
    def guarda(m):
        k = chr(0xE000 + len(esc)); esc[k] = m.group(0); return k
    q = re.sub(r'\\[a-zA-Z]', guarda, p)
    q = re.sub(r'(?<![a-zñ])[a-zñ]{4,}(?![a-zñ])', lambda m: sing(m.group(0)), q)
    for k, v in esc.items(): q = q.replace(k, v)
    return re.compile(q)
PROC = [(pid, nom, esp, [rx(p) for p in pats], sin) for pid, nom, esp, pats, sin in sorted(PROCEDIMIENTOS, key=_prio)]
EXC = {k: rx(v) for k, v in EXCLUIR.items()}
FREG = [(esp, [rx(p) for p in pats]) for esp, pats in FUNCAL_REGLAS.items()]
OREG = [(rx(p), f) for p, f in ORGANO_FUNCAL]
for _, _, esp, _, _ in PROC:
    assert esp in FESP, esp
for esp in FUNCAL_REGLAS:
    assert esp in FESP, esp

def clasificar(titulo, desc, organo):
    t, d, o = nm(titulo), nm(desc)[:400], nm(organo)
    org_f = next((f for rx, f in OREG if rx.search(o)), None)
    for pid, nom, esp, pats, _ in PROC:
        if any(p.search(t) for p in pats) and not (pid in EXC and EXC[pid].search(t)):
            return dict(esp=esp, proc=pid, conf=0.9, metodo='regla_procedimiento_titulo', org=org_f)
    for esp, pats in FREG:
        if any(p.search(t) for p in pats):
            return dict(esp=esp, proc=None, conf=0.75 + (0.05 if org_f == esp[:2] else 0), metodo='regla_funcal_titulo', org=org_f)
    # descripción: primero procedimiento tipo (más precisión), luego palabras clave
    for pid, nom, esp, pats, _ in PROC:
        if any(p.search(d) for p in pats) and (org_f is None or org_f == esp[:2]):
            return dict(esp=esp, proc=None, conf=0.6, metodo='regla_procedimiento_descripcion', org=org_f)
    for esp, pats in FREG:
        if any(p.search(d) for p in pats) and (org_f is None or org_f == esp[:2]):
            return dict(esp=esp, proc=None, conf=0.55, metodo='regla_funcal_descripcion', org=org_f)
    return dict(esp=None, proc=None, conf=0, metodo='pendiente_ml', org=org_f)


# ---------- normalización de epígrafes ----------
RX_PLAZO = re.compile(r'(\d+|un|una|dos|tres|cuatro|seis|quince|diez|veinte|treinta)\s*(dias?|meses|mes|semanas?|anos?|horas?)\s*(habiles|naturales)?')
NUM = {'un': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'seis': 6, 'diez': 10, 'quince': 15, 'veinte': 20, 'treinta': 30}
def plazo(txt):
    t = norm(txt)
    if not t:
        return None
    m = RX_PLAZO.search(t)
    if not m:
        return {'texto': txt.strip()[:300], 'dias': None}
    n = int(m.group(1)) if m.group(1).isdigit() else NUM[m.group(1)]
    u = m.group(2)
    dias = n if u.startswith('dia') else n * 30 if u.startswith('mes') else n * 7 if u.startswith('semana') else n * 365 if u.startswith('ano') else None
    return {'texto': txt.strip()[:300], 'valor': n, 'unidad': u, 'tipo': m.group(3), 'dias': dias}

def _sil(t):
    pos = re.search(r'\b(positiv\w*|estimatori\w*|estimad\w*|estimacio\w*|favorable|afirmatiu)\b', t)
    neg = re.search(r'\b(negativ\w*|desestimatori\w*|desestimad\w*|desestimacio\w*|desfavorable)\b', t)
    if pos and not neg: return 'positivo'
    if neg and not pos: return 'negativo'
    if pos and neg: return 'mixto'
    if re.search(r'\b(no procede|no aplica|no se produce|sin efecto|no tiene|no previst\w*|no procedeix)\b', t): return 'no procede'
    if re.search(r'\bcaducidad\b', t): return 'caducidad'
    return None

def silencio(txt):
    """La sede STA guarda un valor de lista en la 1.ª línea y texto libre después."""
    lineas = [norm(l) for l in (txt or '').split('\n') if norm(l)]
    if not lineas:
        return None
    v = _sil(lineas[0])
    if v in (None, 'no procede') and len(lineas) > 1:
        w = _sil(' '.join(lineas[1:]))
        if w and w != 'no procede': return w
    return v or 'otro'

def tasa(txt):
    """'si' | 'no' | 'ver_ordenanza' | None (sin información)"""
    t = norm(txt)
    if not t:
        return None
    importe = re.search(r'\d+[.,]?\d*\s*(euros?|€|eur)\b|\btarifa\b|\bcuota\b|\bautoliquidacion\b|\babonar\b|\bpago previo\b', t)
    if re.search(r'\b(no (procede|hay|existe|tiene|esta sujet|devenga|conlleva|requiere|se exige|aplica)|gratuit\w*|exent\w*|sin (coste|cost|tasa|cargo)|ninguna?|no|cap|ninguno|gratis)\b|asum\w* (por )?el ayuntamiento', t) and not importe:
        return 'no'
    if not importe and re.search(r'\b(consult\w*|segun|ver|veure|vigent\w*)\b.*\b(ordenanza|ordenanca|ordenances|ordenanzas)\b|\bordenanzas? fiscal', t):
        return 'ver_ordenanza'
    return 'si'

def documentos(sec):
    dp = sec.get('documentos_presentar') or {}
    out = []
    if dp.get('grupos'):
        for g in dp['grupos']:
            gt = g.get('t') or ''
            ng = norm(gt)
            ob = True if re.search(r'obligatori|requerid|necesari|imprescindible', ng) else False if re.search(r'opcional|complementari|voluntari|si procede|en su caso', ng) else None
            for it in g.get('items', []):
                d = {'nombre': it.get('t', '')[:300], 'grupo': gt}
                if ob is not None: d['obligatorio'] = ob
                if it.get('u'): d['url'] = it['u']
                if it.get('descripcion'): d['descripcion'] = it['descripcion'][:500]
                out.append(d)
    elif dp.get('lineas'):
        for l in dp['lineas']:
            out.append({'nombre': l[:300]})
    return out

def txt(sec, k, n=4000):
    x = (sec.get(k) or {}).get('texto') or ''
    return x[:n]


# ---------- recorrido ----------
recs, vistos = [], set()
cnt = collections.Counter()
for r in rows:
    rec, host = r['rec'], r['host']
    tr = rec['datos']['tramite']; sec = tr.get('secciones') or {}
    uid = f"{host}:{tr.get('id_sede')}"
    if uid in vistos:
        continue
    vistos.add(uid)
    titulo = re.sub(r'\s+', ' ', rec.get('titulo') or '').strip()
    desc = txt(sec, 'descripcion') or txt(sec, 'finalidad')
    organo = tr.get('organo_gestor') or ''
    c = clasificar(titulo, desc, organo)
    cnt[c['metodo']] += 1
    esp = c['esp'] or '17-02'; fc = esp[:2]
    docs = documentos(sec)
    url = (tr.get('url') or '').replace('&lang=ES', '')
    o = {
        'id': uid,
        'municipio': r['municipio'], 'provincia': r['provincia'], 'sede': host,
        'titulo': titulo,
        'url_ficha': url,
        'url_tramitar': (tr.get('enlace_tramitar') or {}).get('u'),
        'organo_gestor': organo if organo != 'Sin órgano gestor' else None,
        'funcal': {'funcion': {'codigo': fc, 'nombre': FCOM[fc]}, 'especifica': {'codigo': esp, 'nombre': FESP[esp]},
                   'confianza': round(c['conf'], 2), 'metodo': c['metodo']},
        'procedimiento_tipo': None,
        'resumen': ' '.join(x for x in [txt(sec, 'descripcion', 1500), txt(sec, 'finalidad', 1500)] if x)[:2500],
        'epigrafes': {k: txt(sec, k) for k in ['descripcion', 'finalidad', 'organo_gestor', 'plazo_resolucion', 'silencio_administrativo', 'normativa', 'pago_tasas', 'informacion_adicional'] if txt(sec, k)},
        'plazo_resolucion': plazo(txt(sec, 'plazo_resolucion')),
        'silencio': silencio(txt(sec, 'silencio_administrativo')),
        'tasa': tasa(txt(sec, 'pago_tasas')),
        'documentos': docs,
        'n_documentos': len(docs),
        'n_documentos_obligatorios': sum(1 for d in docs if d.get('obligatorio')),
        'documentacion_relacionada': [{'t': i.get('t'), 'u': i.get('u')} for i in ((sec.get('documentacion_relacionada') or {}).get('items') or []) if i.get('u')][:40],
        'epigrafes_presentes': sorted(k for k, v in sec.items() if v),
        'huella': tr.get('huella'), 'extraido_at': tr.get('extraido_at'),
    }
    o['_ml'] = (c['metodo'] == 'pendiente_ml', f"{titulo} | {organo} | {desc[:300]}", c.get('org'))
    if c['proc']:
        p = next(x for x in PROCEDIMIENTOS if x[0] == c['proc'])
        o['procedimiento_tipo'] = {'id': p[0], 'nombre': p[1]}
    recs.append(o)

# ---------- aprendizaje supervisado para los trámites sin regla ----------
# Se entrena con los trámites clasificados por regla sobre el título (alta precisión) y se predice el resto.
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from scipy.sparse import hstack
train = [o for o in recs if o['funcal']['metodo'].startswith('regla_') and o['funcal']['metodo'].endswith('_titulo')]
pend = [o for o in recs if o['_ml'][0]]
vw = TfidfVectorizer(preprocessor=nm, ngram_range=(1, 2), min_df=2, sublinear_tf=True)
vc = TfidfVectorizer(preprocessor=nm, analyzer='char_wb', ngram_range=(3, 5), min_df=3, sublinear_tf=True, max_features=150000)
Xtxt = [o['_ml'][1] for o in train]
X = hstack([vw.fit_transform(Xtxt), vc.fit_transform(Xtxt)]).tocsr()
y = [o['funcal']['especifica']['codigo'] for o in train]
clf = LogisticRegression(max_iter=2000, C=4.0)
clf.fit(X, y)
# validación cruzada rápida sobre una partición de las etiquetas de regla
from sklearn.model_selection import cross_val_score
cv = cross_val_score(LogisticRegression(max_iter=1500, C=4.0), X, y, cv=3, scoring='accuracy')
print('exactitud CV (función específica) sobre etiquetas de regla:', [round(x, 3) for x in cv])
if pend:
    Xp = hstack([vw.transform([o['_ml'][1] for o in pend]), vc.transform([o['_ml'][1] for o in pend])]).tocsr()
    P = clf.predict_proba(Xp)
    for o, p in zip(pend, P):
        i = int(p.argmax()); esp = clf.classes_[i]; pr = float(p[i])
        org = o['_ml'][2]
        if org and esp[:2] != org and pr < 0.35:  # con poca seguridad, se prefiere la mejor clase dentro de la función del órgano gestor
            idx = [k for k, c in enumerate(clf.classes_) if c[:2] == org]
            if idx:
                k = max(idx, key=lambda k: p[k]); esp = clf.classes_[k]; pr = float(p[k])
        fc = esp[:2]
        o['funcal'] = {'funcion': {'codigo': fc, 'nombre': FCOM[fc]}, 'especifica': {'codigo': esp, 'nombre': FESP[esp]},
                       'confianza': round(min(0.7, pr), 2), 'metodo': 'modelo_supervisado' + ('+organo' if org else '')}
        cnt['modelo_supervisado'] += 1
for o in recs:
    o.pop('_ml', None)
cnt.pop('pendiente_ml', None)
print('trámites', len(recs), dict(cnt))
pickle.dump(recs, open('norm.pkl', 'wb'))
