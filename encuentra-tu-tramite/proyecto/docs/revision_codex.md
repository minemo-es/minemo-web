# Revisión: JSON normalizado «Encuentra tu trámite» [PROTOTIPO]

## Contexto
Julio (Archivo Municipal, Ayuntamiento de Arganda del Rey) extrajo los catálogos de procedimientos de 71 sedes electrónicas municipales de la plataforma T-Systems STA (14.905 fichas, formato elvira-recurso-1 de 10 epígrafes, igual que Arganda). Quiere un buscador «Encuentra tu trámite» alojado en minemo.es y GitHub con doble objetivo: (1) servicio al ciudadano: elegir municipio + pregunta en lenguaje natural («quiero hacer un fraccionamiento de pago», «pedir un certificado de padrón») y obtener la ficha de ese municipio; (2) comparar cómo se tramita lo mismo en todos los municipios («radiografía de la burocracia municipal»: documentos, plazos, silencio, tasas). Los trámites se asocian al vocabulario FUNCAL (59 funciones comunes, 255 específicas). Primer paso: el JSON normalizado (este entregable). La interfaz web viene después.

## Propuesta de Claude
- Esquema y ficheros: README.md (en este directorio).
- Código: scripts/reglas.py (134 procedimientos tipo con regex, exclusiones, prioridades), scripts/build.py (normalización, clasificación en cascada: regla título → regla FUNCAL → reglas sobre descripción → regresión logística TF-IDF entrenada con las etiquetas de regla; extracción de plazo, silencio, tasa, documentos), scripts/export.py (salida: indice.json, municipios/<slug>.json, procedimientos.json, funcal.json, municipios.json, tramites.json, meta.json; tipología de documentos).
- Resultados: 73 % con procedimiento tipo por título; 12 % por modelo supervisado (exactitud CV ≈ 78 % sobre etiquetas de regla, confianza limitada a 0,7); fraccionamiento 88 trámites/48 municipios; certificado de padrón 98/48; 30 % de documentos tipo «otro». Muestra de datos: data/meta.json, data/municipios.json, data/funcal.json (los ficheros grandes no hace falta leerlos enteros).

## Encargo al revisor
Actúa como revisor técnico senior, independiente y escéptico. Revisa la propuesta anterior.
Devuelve, en español:
1. Errores o fallos concretos (con ubicación y por qué).
2. Riesgos o supuestos no verificados.
3. Omisiones relevantes.
4. Mejoras propuestas, priorizadas (alta/media/baja).
5. Veredicto: APROBAR / APROBAR CON CAMBIOS / RECHAZAR, en una línea.
No reescribas todo; señala solo lo que cambiarías y por qué. Si algo es correcto, dilo brevemente.
