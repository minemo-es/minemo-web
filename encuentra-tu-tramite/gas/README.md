# Servicio de administración en Google Apps Script

`admin.html` puede guardar cambios de dos formas:

- **Con un token de GitHub** de cada administrador (no necesita nada de esta carpeta).
- **Con usuario y clave**, a través de este script de Google. El token de GitHub se guarda una sola vez en el script y los administradores no lo ven nunca.

El script solo puede leer y escribir `encuentra-tu-tramite/config/*.json` (correcciones, procedimientos, municipios y portal). No puede tocar los datos ni el código.

## Instalación (10 minutos)

1. **Token de GitHub.** En GitHub → *Settings → Developer settings → Fine-grained tokens*, crea un token:
   - Repositorio: solo `minemo-es/minemo-web`.
   - Permisos: *Contents: Read and write* (y *Metadata: Read*, que se añade solo).
   - Caducidad: la que decidáis (por ejemplo, un año). Apunta la fecha para renovarlo.
2. **Proyecto de Apps Script.** Entra en <https://script.google.com> → *Nuevo proyecto* → llámalo «Encuentra tu trámite · admin».
   - Pega el contenido de `Codigo.gs` en el fichero `Código.gs`.
   - En *Configuración del proyecto* marca «Mostrar el archivo de manifiesto appsscript.json» y sustituye su contenido por el de `appsscript.json`.
3. **Propiedades del script** (*Configuración del proyecto → Propiedades del script*):

   | Propiedad | Valor |
   |---|---|
   | `GITHUB_TOKEN` | el token del paso 1 |
   | `GITHUB_REPO` | `minemo-es/minemo-web` (opcional, es el valor por defecto) |
   | `GITHUB_RAMA` | `main` (opcional) |
   | `HOJA_REGISTRO_ID` | opcional: id de una hoja de Google donde anotar cada acceso y cambio |
   | `COMMIT_EMAIL` | opcional: correo que figurará como autor técnico de los commits |

4. **Configurar.** En el editor, elige la función `configurar` y pulsa *Ejecutar*. Autoriza los permisos. Debe aparecer «Correcto: acceso de escritura…».
5. **Administradores.** En la función `crearAdministrador` escribe usuario, nombre y una clave larga; ejecútala y **vuelve a dejar la clave vacía**. Repite para cada persona. `listarAdministradores` y `bajaAdministrador` sirven para gestionarlos.
6. **Publicar como aplicación web.** *Implementar → Nueva implementación → Aplicación web*:
   - Ejecutar como: **Yo**.
   - Quién tiene acceso: **Cualquier usuario** (la protección la ponen el usuario y la clave).
   - Copia la URL que termina en `/exec`.
7. **Conectar con el admin.** Abre `https://minemo.es/encuentra-tu-tramite/admin.html`, despliega «Dirección del servicio» y pega la URL. Después de entrar, en *Textos del portal* puedes guardarla en `config/portal.json` (campo `admin_api`) para que aparezca ya rellenada.

Al modificar `Codigo.gs` hay que crear una **nueva versión** de la implementación (*Implementar → Gestionar implementaciones → Editar → Nueva versión*) para que la URL use el código nuevo.

## Seguridad

- Las claves se guardan con sal y 2.000 rondas de SHA-256; la sesión es un testigo firmado con HMAC que caduca a las 8 horas.
- Tras 5 intentos fallidos, el usuario queda bloqueado 10 minutos.
- Solo se aceptan las rutas `config/correcciones.json`, `config/procedimientos.json`, `config/municipios.json` y `config/portal.json`, y el contenido tiene que ser JSON válido.
- Cada commit lleva el nombre del administrador en el mensaje; si se configura `HOJA_REGISTRO_ID`, también queda en la hoja.
- Si el token de GitHub se ve comprometido, revócalo en GitHub y pon uno nuevo en `GITHUB_TOKEN`.

## Acciones que atiende (`POST` con cuerpo JSON en `text/plain`)

| `accion` | Datos | Respuesta |
|---|---|---|
| `login` | `usuario`, `clave` | `sesion`, `usuario`, `nombre` |
| `yo` | `sesion` | `usuario`, `nombre` |
| `leer` | `sesion`, `ruta` | `contenido` (texto JSON), `sha` |
| `guardar` | `sesion`, `ruta`, `contenido`, `sha`, `mensaje` | `sha`, `url` del commit |
| `historial` | `sesion` | `commits` de `config/` |
