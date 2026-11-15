# Material del proyecto «Localizador de trámites · sedes STA»

Todo lo producido para extraer, normalizar y comparar los catálogos de trámites de las sedes electrónicas municipales de T-Systems (STA).

| Carpeta | Contenido |
|---|---|
| `extracciones/2026-11-15/` | 71 ZIP, uno por sede (`tramites_sede_<host>_por-organo_2026-11-15.zip`), con `_indice_tramites.json`, `_todos.json`, `_errores.json` y una carpeta por órgano gestor. Formato `elvira-recurso-1` (10 epígrafes, igual que Arganda). Recomprimidos sin cambiar su contenido (de 468 MB a 59 MB). |
| `extracciones/_resumen_extraccion*.json` | Resumen de los dos lotes de extracción (trámites, órganos y epígrafes por sede). |
| `herramientas/sta_extractor.js` | Extractor genérico para sedes STA (versión sta-multi 1.2): PTS2 y PTS, fichas en castellano (`&lang=ES`), epígrafes en catalán, gallego y euskera. |
| `herramientas/extractor_sede.html` | Extractor original de la sede de Arganda del Rey (`SEDE()` v1.2). En esta copia pública se ha retirado la contraseña de acceso. |
| `herramientas/comparar_extracciones.py` | Compara dos extracciones (ZIP o carpetas) por la huella SHA-256 de cada trámite: altas, bajas y modificados con los epígrafes que cambian. |
| `tablas/sedes_sta_ayuntamientos.csv` | Las 76 sedes municipales localizadas: URL, tipo, comprobación, trámites extraídos, órganos gestores, media de epígrafes y estado. |
| `tablas/sedes_sta_otras_entidades.csv` | Otras 11 entidades con sede STA (diputaciones, cabildos, consorcios). |
| `tablas/municipios_coordenadas_ine.json` | Código INE, nombre oficial, centroide (lat/lon) y posición en el mapa de cada municipio. |
| `vocabulario/` | 59 funciones comunes FUNCAL con sus funciones específicas (XLSX original y JSON). |
| `datos-normalizados/tramites.json.gz` | Los 14.905 trámites normalizados en un solo fichero. |
| `docs/` | Documentación del proyecto y paquete de revisión externa. |
