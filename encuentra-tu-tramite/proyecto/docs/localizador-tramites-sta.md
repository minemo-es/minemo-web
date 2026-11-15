# Localizador de trámites con IA · sedes STA (T-Systems)

Proyecto: extender a otros ayuntamientos el modelo de extracción de trámites de la sede electrónica de Arganda del Rey (banco de recursos de Elvira) y valorar ofrecerlo como servicio.

## Decisiones
- Se mantiene **exactamente la estructura JSON de Arganda** (`elvira-recurso-1`, 10 epígrafes) para que todo sea compatible con el banco de Elvira. No se añaden epígrafes extra.
- Cada recurso añade el campo `sede` y su `id` lleva el host (`sede-<host>-<DETALLE>`) para no chocar entre municipios.

## Método (15/11/2026)
- Extractor `sta_extractor.js` (derivado de `SEDE()` v1.2 de extractor_sede.html), versión **sta-multi 1.2**:
  - PTS2 (actual): `div.section-entry > dt.entry-label + dd.entry-value`.
  - PTS (anterior): `tr > td.etiquetaAtributo + td.valorAtributo` (p. ej. Agüimes).
  - Pide siempre las fichas en castellano (`&lang=ES`) y reconoce epígrafes en catalán, gallego y euskera.
- Ejecución: Playwright abre el catálogo de cada sede, inyecta el extractor (mismo origen, 3 peticiones en paralelo con pausa) y guarda un ZIP por sede.

## Resultados (76 ayuntamientos)
- 51 extracciones correctas (≥ 5 epígrafes de media).
- 12 parciales: la sede usa nombres de epígrafes propios (Calahorra, Aspe, Arona, Alhama de Murcia, San Pedro del Pinatar, Puerto del Rosario, Molins de Rei, Torre-Pacheco, Mazarrón, Pilar de la Horadada, Vilanova i la Geltrú, OVC de Santa Cruz de Tenerife).
- 8 solo con oficina tributaria o muy pocas fichas; 3 sin catálogo (Alaquàs, La Oliva, Sueca); 2 con certificado no válido (Llucmajor, Villajoyosa).
- Benalmádena, Gavà, Getafe y Aspe no rellenan «Órgano gestor».

## «Encuentra tu trámite» [PROTOTIPO]
- 71 municipios · 14.905 trámites · 134 procedimientos tipo (132 con trámites) · FUNCAL (59 comunes / 255 específicas).
- Clasificación en cascada: regla sobre título → procedimiento tipo (73 %); reglas FUNCAL por título/descripción (12 %); modelo supervisado TF‑IDF + regresión logística entrenado con las etiquetas de regla (12 %, exactitud en validación cruzada ≈ 78 %, confianza ≤ 0,7 → revisar desde admin.html).
- Campos normalizados: plazo en días, silencio, tasa (si/no/ver_ordenanza), documentos con tipología propia (22 tipos), cobertura de epígrafes.
- Web: `minemo.es/encuentra-tu-tramite/` (buscador con mapa) y `admin.html` (administración con GitHub o Google Apps Script).

## Actualización semanal
1. Relanzar el extractor por sede en una carpeta con la fecha.
2. `python comparar_extracciones.py CARPETA_ANTERIOR CARPETA_NUEVA --salida informe.json`.
3. Regenerar el JSON normalizado y subirlo; las correcciones del admin (config/) se conservan.

## Pendiente
- Revisar los ~2.400 trámites con clasificación orientativa y reducir el 30 % de documentos de tipo «otro».
- Mapear los epígrafes propios de las sedes parciales sin romper la estructura.
- Revisar Segorbe (solo 2 fichas: el catálogo podría cargarse por categorías).
- Asignar área a los trámites de las sedes sin órgano gestor.
- Llucmajor y Villajoyosa: extraer cuando corrijan el certificado.
