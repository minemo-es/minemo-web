import zipfile,json,glob,re,collections,sys
# uso: python3 consolidar.py <carpeta_con_los_zip>   (por defecto C:/2026/minemo o la carpeta actual)
CARPETA = sys.argv[1] if len(sys.argv) > 1 else '.'
M=json.load(open('municipios.json'))
rows=[];stats=collections.Counter()
for z in sorted(glob.glob(CARPETA + '/tramites_sede_*.zip')):
    with zipfile.ZipFile(z) as f:
        todos=json.loads(f.read('_todos.json'))
    sede=todos.get('sede') or ''
    host=re.sub(r'^https?://','',sede).split(':')[0].split('/')[0]
    mun,prov=M.get(host,[host,''])
    for r in todos['recursos']:
        tr=r['datos']['tramite']
        rows.append({'host':host,'municipio':mun,'provincia':prov,'rec':r})
    stats[mun]+=len(todos['recursos'])
print(len(rows),len(stats))
import pickle;pickle.dump(rows,open('raw.pkl','wb'))
