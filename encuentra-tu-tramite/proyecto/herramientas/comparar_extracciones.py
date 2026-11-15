#!/usr/bin/env python3
"""Compara dos extracciones de una misma sede STA (ZIP del extractor) y lista altas, bajas y cambios.

Uso:
  python comparar_extracciones.py ANTERIOR.zip NUEVA.zip [--salida informe.json]
  python comparar_extracciones.py CARPETA_ANTERIOR CARPETA_NUEVA      (compara todas las sedes por nombre de host)

La comparación usa la «huella» (SHA-256 truncado de título + epígrafes) que el extractor guarda en
_indice_tramites.json, así que no depende de la fecha de extracción. Para cada trámite modificado
indica qué epígrafes han cambiado.
"""
import argparse, json, re, sys, zipfile
from pathlib import Path


def lee_zip(ruta):
    with zipfile.ZipFile(ruta) as z:
        nombres = z.namelist()
        indice = json.loads(z.read('_indice_tramites.json').decode('utf-8'))
        todos = json.loads(z.read('_todos.json').decode('utf-8')) if '_todos.json' in nombres else {'recursos': []}
    recursos = {r['id']: r for r in todos.get('recursos', [])}
    tramites = {}
    for org in indice.get('organos', []):
        for t in org.get('tramites', []):
            t = dict(t, organo_gestor=org.get('organo_gestor'))
            tramites[t['id']] = t
    return indice.get('sede', ''), tramites, recursos


def secciones(rec):
    return ((rec or {}).get('datos', {}).get('tramite', {}) or {}).get('secciones', {}) or {}


def compara(ant_zip, nue_zip):
    sede_a, A, RA = lee_zip(ant_zip)
    sede_b, B, RB = lee_zip(nue_zip)
    altas = [{'id': i, 'titulo': B[i]['titulo'], 'organo_gestor': B[i]['organo_gestor'], 'url': B[i]['url']} for i in B if i not in A]
    bajas = [{'id': i, 'titulo': A[i]['titulo'], 'organo_gestor': A[i]['organo_gestor'], 'url': A[i]['url']} for i in A if i not in B]
    cambios = []
    for i in B:
        if i in A and A[i].get('huella') != B[i].get('huella'):
            sa, sb = secciones(RA.get(i)), secciones(RB.get(i))
            eps = sorted(k for k in set(sa) | set(sb) if (sa.get(k) or {}).get('texto') != (sb.get(k) or {}).get('texto') or (sa.get(k) or {}).get('enlaces') != (sb.get(k) or {}).get('enlaces'))
            if A[i]['titulo'] != B[i]['titulo']:
                eps = ['titulo'] + eps
            cambios.append({'id': i, 'titulo': B[i]['titulo'], 'organo_gestor': B[i]['organo_gestor'], 'url': B[i]['url'], 'epigrafes_cambiados': eps})
    return {'sede': sede_b or sede_a, 'anterior': str(ant_zip), 'nueva': str(nue_zip),
            'totales': {'anterior': len(A), 'nueva': len(B), 'altas': len(altas), 'bajas': len(bajas), 'modificados': len(cambios), 'sin_cambios': len(B) - len(altas) - len(cambios)},
            'altas': altas, 'bajas': bajas, 'modificados': cambios}


def host_de(nombre):
    m = re.match(r'tramites_sede_(.+?)_por-organo_\d{4}-\d{2}-\d{2}\.zip$', nombre)
    return m.group(1) if m else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('anterior'); ap.add_argument('nueva'); ap.add_argument('--salida')
    a = ap.parse_args()
    pa, pn = Path(a.anterior), Path(a.nueva)
    if pa.is_dir() and pn.is_dir():
        ant = {host_de(p.name): p for p in pa.glob('tramites_sede_*.zip') if host_de(p.name)}
        nue = {host_de(p.name): p for p in pn.glob('tramites_sede_*.zip') if host_de(p.name)}
        informe = {'sedes': [compara(ant[h], nue[h]) for h in sorted(set(ant) & set(nue))],
                   'solo_en_anterior': sorted(set(ant) - set(nue)), 'solo_en_nueva': sorted(set(nue) - set(ant))}
        for s in informe['sedes']:
            t = s['totales']; print(f"{s['sede']}: +{t['altas']} altas, -{t['bajas']} bajas, ~{t['modificados']} modificados ({t['nueva']} trámites)")
    else:
        informe = compara(pa, pn); t = informe['totales']
        print(f"{informe['sede']}: +{t['altas']} altas, -{t['bajas']} bajas, ~{t['modificados']} modificados ({t['nueva']} trámites)")
    if a.salida:
        Path(a.salida).write_text(json.dumps(informe, ensure_ascii=False, indent=1), encoding='utf-8')


if __name__ == '__main__':
    sys.exit(main())
