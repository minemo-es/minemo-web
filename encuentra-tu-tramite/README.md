# Encuentra tu trámite [PROTOTIPO]

Módulo de [minemo.es](https://minemo.es/encuentra-tu-tramite/): un solo buscador para **14.905 trámites de 71 municipios** cuyas sedes electrónicas usan la plataforma T-Systems (STA), clasificados con el vocabulario **FUNCAL** (59 funciones comunes) y agrupados en **132 procedimientos tipo** comparables entre ayuntamientos.

Tiene dos usos:

- **Servicio a la ciudadanía:** eliges municipio (en el mapa o en la lista), escribes lo que necesitas («pedir un certificado de padrón», «fraccionar un pago») y ves la ficha de tu ayuntamiento con documentos, plazo, silencio, tasas y el enlace a la sede.
- **Radiografía de la burocracia municipal:** sin elegir municipio, ves cómo se tramita lo mismo en todos: quién lo ofrece, cuántos documentos pide cada uno, en qué plazo, etc.

## Páginas

| Página | Qué es |
|---|---|
| [`index.html`](index.html) | Buscador público con mapa de España, comparativa por procedimiento tipo, navegación por funciones FUNCAL y tabla de radiografía por municipio |
| [`admin.html`](admin.html) | Administración del contenido para usuarios autorizados (GitHub o cuenta de Apps Script): revisión de clasificaciones, procedimientos tipo y sinónimos, municipios y textos del portal |

## Estructura

```
encuentra-tu-tramite/
├── index.html, admin.html
├── css/ett.css                 estilos (identidad de minemo.es)
├── js/ett-comun.js             normalización, búsqueda y carga de datos (+ capa de ajustes del admin)
├── js/buscador.js              buscador público y mapa
├── js/admin.js                 administración (backends GitHub y Apps Script)
├── gas/                        servicio de administración en Google Apps Script (Codigo.gs, appsscript.json, README)
├── config/                     ajustes editables desde admin.html (correcciones, procedimientos, municipios, portal)
├── data/                       JSON normalizado que consume la web (ver data/README.md)
│   └── municipios/<slug>.json  fichas completas por municipio
├── scripts/                    consolidación, clasificación y exportación (Python)
└── proyecto/                   todo el material del proyecto
    ├── extracciones/2026-11-15/   los 71 ZIP originales de las sedes (formato elvira-recurso-1)
    ├── extracciones/_resumen_*.json
    ├── herramientas/              extractor STA, extractor_sede.html (Arganda), comparador semanal
    ├── tablas/                    tabla de sedes STA (CSV), otras entidades, coordenadas INE
    ├── vocabulario/               59 funciones comunes FUNCAL (XLSX original y JSON)
    ├── datos-normalizados/        tramites.json.gz (conjunto completo)
    └── docs/                      documentación y revisión
```

## Cómo funciona la capa de administración

Los datos de `data/` se regeneran con los scripts. Lo que se corrige a mano desde `admin.html` se guarda aparte, en `config/*.json`, y el buscador lo aplica al cargar. Así una nueva extracción no borra las correcciones.

`admin.html` admite dos formas de entrar:

1. **Cuenta de administración** (usuario y clave) servida por Google Apps Script. El token de GitHub vive solo en el script. Instalación en [`gas/README.md`](gas/README.md).
2. **Token de GitHub** con permiso de escritura en `minemo-es/minemo-web`.

Cada cambio queda como un commit con el nombre de quien lo hizo.

## Actualización semanal

1. Relanzar `proyecto/herramientas/sta_extractor.js` en cada sede → un ZIP por sede.
2. `python proyecto/herramientas/comparar_extracciones.py ANTERIOR NUEVA --salida informe.json` → altas, bajas y modificaciones.
3. `cd scripts && python3 consolidar.py CARPETA_ZIPS && python3 build.py .. && python3 export.py ..`
4. Subir `data/`, `proyecto/datos-normalizados/` y los ZIP nuevos en `proyecto/extracciones/AAAA-MM-DD/`.

## Fuentes y licencia de los datos

Información pública de los catálogos de procedimientos de cada sede electrónica municipal (extracción del 15/11/2026). Consulta siempre la ficha oficial antes de tramitar. Mapa: [es-atlas](https://github.com/martgnz/es-atlas) (IGN), proyección `conicConformalSpain`.
