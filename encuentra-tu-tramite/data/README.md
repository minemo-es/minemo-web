# Encuentra tu trámite [PROTOTIPO] — JSON normalizado

Conjunto de datos normalizado con los catálogos de procedimientos de **71 sedes electrónicas municipales T-Systems (STA)**: 14.905 trámites, clasificados en el vocabulario **FUNCAL** (59 funciones comunes / 255 específicas) y, cuando es posible, asignados a uno de **134 procedimientos tipo** comparables entre municipios.

Fuente: ZIPs de extracción `SEDE()` v1.2 (formato `elvira-recurso-1`, 10 epígrafes, misma estructura que Arganda), fecha 2026-11-15.

## Ficheros (`data/`)

| Fichero | Para qué sirve | Tamaño |
|---|---|---|
| `indice.json` | Índice compacto que carga el buscador en el navegador (búsqueda por texto, municipio, función FUNCAL, procedimiento tipo y sus sinónimos) | 5,6 MB |
| `mapa_espana.json` | Provincias de España proyectadas (Canarias en recuadro) para el mapa del buscador | 0,1 MB |
| `municipios/<slug>.json` | Fichas completas de un municipio; se cargan al abrir un resultado | 0,1–3 MB |
| `procedimientos.json` | Procedimientos tipo con la comparativa entre municipios («radiografía de la burocracia») | 6 MB |
| `funcal.json` | Vocabulario FUNCAL con nº de trámites y municipios por función, y los procedimientos tipo que cuelgan de cada una | 52 KB |
| `municipios.json` | Los 76 municipios: sede, código INE, coordenadas, nº de trámites, tramitables online, mediana de documentos y plazo, cobertura de epígrafes | 70 KB |
| `../proyecto/datos-normalizados/tramites.json.gz` | Todos los trámites normalizados en un solo fichero, comprimido (para análisis, no para la web) | 6,8 MB (50 MB sin comprimir) |
| `meta.json` | Versión, fuente y recuento por método de clasificación | 4 KB |

## Registro normalizado (un trámite)

```jsonc
{
  "id": "sede.tudela.es:1234",            // host de la sede + id de la ficha
  "municipio": "Tudela", "municipio_slug": "tudela", "provincia": "Navarra", "sede": "sede.tudela.es",
  "titulo": "Aplazamiento y/o fraccionamiento de pagos sin garantía",
  "url_ficha": "https://…PAGE_CODE=CATALOGO&DETALLE=1234", "url_tramitar": "https://…" | null,
  "organo_gestor": "Tesorería" | null,
  "funcal": {
    "funcion":    {"codigo": "30",    "nombre": "Gestión recaudatoria"},
    "especifica": {"codigo": "30-03", "nombre": "…"},
    "confianza": 0.9,                      // 0–1
    "metodo": "regla_procedimiento_titulo" // ver «Clasificación»
  },
  "procedimiento_tipo": {"id": "fraccionamiento", "nombre": "Fraccionamiento o aplazamiento de deudas"} | null,
  "resumen": "…",                          // descripción recortada
  "epigrafes": {"descripcion", "finalidad", "organo_gestor", "plazo_resolucion",
                "silencio_administrativo", "normativa", "pago_tasas", "informacion_adicional"},  // texto original
  "plazo_resolucion": {"texto": "3 meses", "valor": 3, "unidad": "meses", "tipo": "habiles"|"naturales"|null, "dias": 90} | null,
  "silencio": "positivo" | "negativo" | "no procede" | "mixto" | "caducidad" | "otro" | null,
  "tasa": "si" | "no" | "ver_ordenanza" | null,
  "documentos": [{"nombre", "grupo", "obligatorio", "url"?, "descripcion"?, "tipo": "identidad"}],
  "tipos_documento": ["identidad", "representacion", "solicitud"],
  "n_documentos": 3, "n_documentos_obligatorios": 2,
  "documentacion_relacionada": [...],
  "epigrafes_presentes": ["descripcion", "documentos_presentar", …],
  "huella": "…",                           // SHA-256 (truncado) para detectar cambios semanales
  "extraido_at": "2026-11-15T…"
}
```

`tipo` de documento es una tipología propia (22 clases: solicitud, identidad, representación, pago-tasa, declaración responsable, proyecto técnico, planos, memoria…) pensada para comparar la carga documental entre ayuntamientos.

## Clasificación (cómo se asigna cada trámite)

1. **Procedimiento tipo por título** (`regla_procedimiento_titulo`, 10.894 = 73 %): expresiones regulares sobre el título normalizado (sin tildes, en singular, variantes en catalán, gallego y euskera), con exclusiones y prioridades para evitar cruces (p. ej. «baja en el padrón» antes que «padrón»).
2. **Función FUNCAL por título** (`regla_funcal_titulo`, 1.652): palabras clave por función específica.
3. **Las mismas reglas sobre la descripción** (`regla_*_descripcion`, 551).
4. **Modelo supervisado** (`modelo_supervisado[+organo]`, 1.808 = 12 %): regresión logística TF‑IDF entrenada con los trámites ya clasificados por regla (exactitud en validación cruzada ≈ 78 % a nivel de función específica). Si la seguridad es baja, se elige la mejor clase dentro de la función del órgano gestor. La confianza se limita a 0,7: **estos son los registros que conviene revisar**.

## Cómo responde el buscador a las dos preguntas de ejemplo

- *«Quiero hacer un fraccionamiento de pago» en Tudela* → los dos trámites del procedimiento tipo `fraccionamiento` de Tudela (con y sin garantía). En el conjunto: 88 trámites en 48 municipios, mediana de 3 documentos.
- *«Pedir un certificado de padrón» en todos* → `padron-certificado`: 98 trámites en 48 municipios. En Tudela no hay ficha de ese trámite en el catálogo de la sede: el buscador debe decirlo y mostrar cómo lo ofrecen los demás.

## Regenerar

```
cd scripts
python3 consolidar.py C:/2026/minemo   # ZIPs → raw.pkl
python3 build.py ..                   # clasificación y normalización → norm.pkl
python3 export.py ..                  # → data/*.json
```

Requiere Python 3.11+ y `scikit-learn`. Las reglas están en `scripts/reglas.py`; el vocabulario, en `scripts/funcal.json`. Las correcciones hechas desde `admin.html` viven en `config/` y no se pierden al regenerar.

## Limitaciones conocidas

- 71 de 76 sedes: Llucmajor y Villajoyosa tienen un certificado no válido; Alaquàs, La Oliva y Sueca no publican catálogo de trámites.
- 2 procedimientos tipo sin trámites (`cambio-titularidad-licencia-urbanistica`, `juzgado-paz`).
- El 30 % de los documentos queda en `tipo: "otro"`.
- El plazo de 90 días aparece a menudo porque muchas sedes repiten el plazo legal general de 3 meses.
