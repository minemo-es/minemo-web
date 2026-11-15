/* Extractor de trámites para cualquier sede STA (T-Systems) · derivado de SEDE() v1.2 de Arganda.
   Se inyecta en la propia sede (mismo origen). Lanza la extracción en segundo plano y deja el estado en window.__STA.
   Resultado: descarga tramites_sede_<host>_por-organo_<fecha>.zip y guarda los recursos en window.__STA_RECS. */
(function(){
'use strict';
const VER='sta-multi 1.2 (base extractor_sede 1.2; PTS2 y PTS; lang=ES)';
const O=location.origin,HOST=location.hostname,CAT=O+'/sta/CarpetaPublic/doEvent?APP_CODE=STA&PAGE_CODE=CATALOGO&lang=ES';
const uF=id=>CAT+'&DETALLE='+encodeURIComponent(id);
const idDe=u=>{const m=String(u||'').match(/[?&;]DETALLE=([0-9A-Za-z_\-]+)/i);return m?m[1]:'';};
const SECC=[
['descripcion','Descripción',['descripcion','descripcion del tramite','descripcion del procedimiento','objeto','objeto del tramite','descripcio','descricion','deskribapena']],
['finalidad','Finalidad',['finalidad','finalidad del tramite','finalidad del procedimiento','finalitat','finalidade','xedea']],
['organo_gestor','Órgano gestor',['organo gestor','organo competente','organo responsable','organo tramitador','unidad gestora','unidad responsable','servicio gestor','departamento gestor','unidad tramitadora','organ gestor','organo xestor','organo kudeatzailea']],
['plazo_resolucion','Plazo de resolución',['plazo de resolucion','plazo maximo de resolucion','plazo de resolucion y notificacion','plazo maximo para resolver y notificar','plazo de tramitacion','termini de resolucio','prazo de resolucion','ebazteko epea']],
['silencio_administrativo','Efecto del silencio administrativo',['efecto del silencio administrativo','efectos del silencio administrativo','efecto del silencio','silencio administrativo','sentido del silencio','sentido del silencio administrativo','efecte del silenci administratiu','efecto do silencio administrativo','administrazioaren isilbidearen ondorioa']],
['normativa','Normativa básica',['normativa basica','normativa','normativa aplicable','legislacion aplicable','legislacion','marco normativo','normativa basica','oinarrizko araudia','araudia']],
['pago_tasas','Pago de tasas',['pago de tasas','tasas','tasas y precios publicos','tasas e impuestos','pago de tasas e impuestos','pagament de taxes','pagament de taxa','pagamento de taxas','tasen ordainketa']],
['informacion_adicional','Información adicional',['informacion adicional','observaciones','otra informacion','mas informacion','informacio addicional','informacion adicional','informazio gehigarria']],
['documentacion_relacionada','Documentación relacionada',['documentacion relacionada','documentos relacionados','impresos relacionados','impresos y formularios','modelos normalizados','documentacio relacionada','documentacion relacionada','lotutako dokumentazioa']],
['documentos_presentar','Documentos a presentar',['documentos a presentar','documentacion a presentar','documentacion a aportar','documentacion necesaria','documentacion requerida','documentos a aportar','documents a presentar','documentos a presentar','aurkeztu beharreko dokumentuak']]];
const GRUPOS=/^(solicitud|solicitudes|documentacion adjunta|documentacion complementaria|documentacion obligatoria|documentacion opcional|documentacion especifica|otros documentos|documentacion a aportar por el interesado)$/;
const nrm=s=>String(s||'').replace(/ /g,' ').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/^\s*\d{1,2}\s*[.\-–)]+[\s\-–.]*/,'').replace(/[\s:.\-–]+$/,'').replace(/\s+/g,' ').trim();
const limpia=s=>String(s||'').replace(/ /g,' ').replace(/[ \t\r\f\v]+/g,' ').replace(/ *\n */g,'\n').trim();
const LBL={};SECC.forEach(([k,,ls])=>ls.forEach(l=>{LBL[l]=k;}));
const SALTA=/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|SELECT|OPTION|SVG|IFRAME|INPUT|TEXTAREA|HEAD|META|LINK)$/;
const BLOQUE=/^(DIV|P|LI|UL|OL|DL|DT|DD|TR|TABLE|TBODY|THEAD|TFOOT|SECTION|ARTICLE|ASIDE|HEADER|FOOTER|NAV|MAIN|H1|H2|H3|H4|H5|H6|FIELDSET|LEGEND|FORM|BLOCKQUOTE|PRE|ADDRESS|FIGURE|FIGCAPTION|HR|CAPTION|DETAILS|SUMMARY|CENTER)$/;
const dentroDeA=el=>{for(let p=el;p;p=p.parentElement)if(p.tagName==='A'||p.tagName==='BUTTON')return true;return false;};
function enlace(a,base){const img=a.querySelector&&a.querySelector('img[alt]');const t=limpia(a.textContent)||limpia(a.getAttribute('title'))||(img?limpia(img.getAttribute('alt')):'');if(!t)return null;
 const href=String(a.getAttribute('href')||'').trim(),oc=String(a.getAttribute('onclick')||'');let u='',accion='';
 if(href&&!/^(javascript:|#|$)/i.test(href)){try{u=new URL(href,base||O).href;}catch(e){u=href;}}
 else{const m=(href+' '+oc).match(/['"]((?:https?:\/\/|\/)[^'"\s]+)['"]/);if(m){try{u=new URL(m[1],base||O).href;}catch(e){u=m[1];}}else if(href||oc)accion=(href+' '+oc).replace(/\s+/g,' ').trim().slice(0,240);}
 const l={t:t,u:u};if(accion)l.accion=accion;return l;}
function fichas(nodo,out,base){for(let n=nodo.firstChild;n;n=n.nextSibling){if(n.nodeType===3){out.push({k:'T',v:n.nodeValue,p:n.parentNode});continue;}if(n.nodeType!==1)continue;const tg=n.tagName;if(SALTA.test(tg))continue;
 if(tg==='BR'){out.push({k:'B'});continue;}if(tg==='A'||(tg==='BUTTON'&&n.getAttribute('onclick'))){const l=enlace(n,base);if(l){out.push({k:'A',v:l});continue;}}if(tg==='IMG')continue;
 const b=BLOQUE.test(tg);if(b)out.push({k:'B'});fichas(n,out,base);if(b)out.push({k:'B'});else if(tg==='TD'||tg==='TH')out.push({k:'T',v:' ',p:n});}}
function trocea(tokens){const sec={};let cur=null,linea='',ultA=false,trasA='',pPrev=null;const cierra=()=>{const t=limpia(linea);if(cur&&t)cur.lineas.push(t);linea='';ultA=false;trasA='';pPrev=null;};
 for(const tk of tokens){if(tk.k==='H'){cierra();cur=tk.v?(sec[tk.v]=sec[tk.v]||{lineas:[],enlaces:[]}):null;continue;}if(!cur)continue;if(tk.k==='B'){cierra();continue;}
  if(tk.k==='T'){const v=tk.v;if(pPrev&&tk.p!==pPrev&&/[a-záéíóúüñ)]$/i.test(linea)&&/^[A-ZÁÉÍÓÚÑ¿¡]/.test(v))cierra();linea+=v;if(ultA)trasA+=v;if(v.trim())pPrev=tk.p;continue;}
  if(tk.k==='A'){if(ultA&&!trasA.trim())cierra();linea+=(linea&&!/\s$/.test(linea)?' ':'')+tk.v.t;cur.enlaces.push(tk.v);ultA=true;trasA='';pPrev=null;}}
 cierra();return sec;}
function estructura(k,s){const vistos=new Set(),enl=s.enlaces.filter(l=>{const x=l.t+'|'+l.u;if(vistos.has(x))return false;vistos.add(x);return true;});
 const et=new Set((SECC.find(x=>x[0]===k)||[,,[]])[2]);const lineas=s.lineas.filter(l=>!et.has(nrm(l)));const o={texto:lineas.join('\n'),lineas:lineas,enlaces:enl};
 if(k==='documentacion_relacionada'||k==='documentos_presentar'){const item=t=>{const l=enl.find(x=>x.t===t);return l?Object.assign({t:t},l.u?{u:l.u}:{},l.accion?{accion:l.accion}:{}):{t:t};};o.items=lineas.map(item);
  if(k==='documentacion_relacionada'&&enl.length){const tl=new Set(enl.map(l=>nrm(l.t)));o.items=enl.map(l=>Object.assign({t:l.t},l.u?{u:l.u}:{},l.accion?{accion:l.accion}:{})).concat(lineas.filter(x=>!tl.has(nrm(x))&&!enl.some(l=>x.includes(l.t))).map(t=>({t:t,sin_enlace:true})));o.lineas=o.items.map(x=>x.t);o.texto=o.lineas.join('\n');}
  if(k==='documentos_presentar'&&lineas.some(l=>GRUPOS.test(nrm(l)))){const g=[];let cg=null;lineas.forEach(l=>{if(GRUPOS.test(nrm(l))){cg={t:l,items:[]};g.push(cg);}else{if(!cg){cg={t:'',items:[]};g.push(cg);}cg.items.push(item(l));}});o.grupos=g;o.items=lineas.filter(l=>!GRUPOS.test(nrm(l))).map(item);}}
 return o;}
function analizarSTA(doc,url){/* PTS2 (actual): div.section-entry > dt.entry-label + dd.entry-value · PTS (anterior): tr > td.etiquetaAtributo + td.valorAtributo */
 const E=[...doc.querySelectorAll('.section-entry')].map(e=>({dt:e.querySelector('dt.entry-label'),dd:e.querySelector('dd.entry-value')})).concat([...doc.querySelectorAll('tr')].map(e=>({dt:e.querySelector(':scope > td.etiquetaAtributo, :scope > th.etiquetaAtributo'),dd:e.querySelector(':scope > td.valorAtributo')}))).filter(x=>x.dt&&x.dd);if(!E.length)return null;const S={},otros=[];
 E.forEach(({dt,dd})=>{const k=LBL[nrm(dt.textContent)];if(!k){otros.push(limpia(dt.textContent));return;}if(S[k])return;
  if(k==='documentos_presentar'&&dd.querySelector('dl.documents-node')){const grupos=[...dd.querySelectorAll('dl.documents-node')].map(n=>{const g=n.querySelector('dt.level0'),items=[];
    [...n.querySelectorAll('dl.document-list > dt, dl.document-list > dd.document-description')].forEach(el=>{if(el.tagName==='DT'){const a=el.querySelector('a[href]'),l=a?enlace(a,url):null,it={t:limpia(el.textContent)};if(l&&l.u)it.u=l.u;if(it.t)items.push(it);}
     else if(items.length){const d=limpia(el.textContent);if(d&&d!==items[items.length-1].t)items[items.length-1].descripcion=d;}});return {t:g?limpia(g.textContent):'',items:items};}).filter(g=>g.t||g.items.length);
   const lineas=[];grupos.forEach(g=>{if(g.t)lineas.push(g.t);g.items.forEach(i=>lineas.push(i.t+(i.descripcion?' — '+i.descripcion:'')));});const enl=[];grupos.forEach(g=>g.items.forEach(i=>{if(i.u)enl.push({t:i.t,u:i.u});}));
   if(lineas.length)S[k]={texto:lineas.join('\n'),lineas:lineas,enlaces:enl,grupos:grupos,items:grupos.flatMap(g=>g.items)};return;}
  const tk=[{k:'H',v:k}];fichas(dd,tk,url);const c=trocea(tk)[k]||{lineas:[],enlaces:[]};const prot=c.lineas.filter(l=>/^informaci[oó]n (b[aá]sica )?sobre protecci[oó]n de datos/i.test(l));
  c.lineas=c.lineas.filter(l=>!prot.includes(l));c.enlaces=c.enlaces.filter(e=>!prot.some(l=>l.includes(e.t))&&!/\/RAT\.pdf(\?|$)/i.test(e.u||''));if(c.lineas.length||c.enlaces.length)S[k]=estructura(k,c);});
 return {secciones:S,primero:E[0].dt,otros:otros};}
function tituloDe(doc,primero){const gen=/^(catalogo|catalogo de tramites|catalogo de procedimientos|sede electronica|ayuntamiento|inicio|menu|buscar|acceso|carpeta ciudadana|tramites|informacion del tramite|detalle del tramite|ficha del tramite|no hay subtitulo)$/;
 const c=[...doc.querySelectorAll('h1,h2,h3,h4,[class*="titul" i],[class*="title" i],[id*="titul" i],[class*="nombre" i]')].filter(el=>{if(dentroDeA(el))return false;const t=limpia(el.textContent),n=nrm(t);if(t.length<3||t.length>180||LBL[n]||gen.test(n))return false;if(primero&&!(el.compareDocumentPosition(primero)&4))return false;return true;});
 if(c.length)return limpia(c[c.length-1].textContent).replace(/\s*\n\s*/g,' ');const dt=limpia(doc.title||'').replace(/\s*[|\-–·]\s*(sede|ayuntamiento|ajuntament|concello).*$/i,'');return gen.test(nrm(dt))?'':dt;}
function organoDe(t){let l=String(t||'').split('\n').map(x=>x.trim()).find(x=>x&&!/^horario/i.test(x))||'';l=l.replace(/\s*[(\[].*$/,'').replace(/\s*[,;:–—-]\s*(avda|avenida|c\/|calle|plaza|pza|paseo|tel|tfno|tel[eé]fono|horario|planta|edificio)\b.*$/i,'').replace(/[.\s]+$/,'').trim();return l.length>90?l.slice(0,90).trim():l;}
function temaDe(o){return String(o||'').replace(/^(el|la)\s+/i,'').replace(/^(departamento|concejal[ií]a|servicio|servicios|[aá]rea|unidad|secci[oó]n|oficina|negociado|delegaci[oó]n|direcci[oó]n|gerencia|jefatura)(\s+(municipal|general))?\s+(de\s+(la\s+|los\s+|las\s+)?|del\s+)/i,'').replace(/^(el|la)\s+/i,'').trim()||String(o||'').trim();}
async function huella(o){const s=JSON.stringify(o);try{const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(h)].slice(0,12).map(b=>b.toString(16).padStart(2,'0')).join('');}catch(e){let h=0x811c9dc5;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0;}return 'fnv'+h.toString(16);}}
async function analizar(doc,url,tc){const id=idDe(url);const sta=analizarSTA(doc,url);
 if(!sta||!Object.keys(sta.secciones).length){const cortos=[...new Set([...(doc.body||doc).querySelectorAll('h1,h2,h3,h4,dt,th,strong,b,legend,label')].map(e=>limpia(e.textContent)).filter(t=>t.length>2&&t.length<60))].slice(0,40);return {ok:false,id_sede:id,url:url,titulo:tc||'',error:'Sin epígrafes STA reconocibles',diagnostico:cortos,otros:sta?sta.otros:[]};}
 const S={},vac=[];SECC.forEach(([k])=>{if(sta.secciones[k])S[k]=sta.secciones[k];else vac.push(k);});
 const titulo=tituloDe(doc,sta.primero)||limpia(tc)||((S.descripcion||{}).lineas||[])[0]||'Trámite '+id;
 const tram=[...doc.querySelectorAll('a')].map(a=>enlace(a,url)).filter(l=>l&&l.u&&/^(tramitar|tramitaci[oó]n electr[oó]nica|iniciar( el)? tr[aá]mite|acceder al tr[aá]mite|solicitar en l[ií]nea|presentar solicitud|tramitar en l[ií]nea|tramitar online)/i.test(l.t))[0];
 const org=organoDe((S.organo_gestor||{}).texto);const o={id_sede:id,titulo:titulo,url:url||'',sede:O,organo_gestor:org||'Sin órgano gestor',tema:org?temaDe(org):'',secciones:S,secciones_vacias:vac,epigrafes_no_mapeados:[...new Set(sta.otros)]};
 if(tc&&limpia(tc)!==titulo)o.titulo_catalogo=limpia(tc);if(tram)o.enlace_tramitar=tram;o.huella=await huella({t:titulo,s:S});o.extraido_at=new Date().toISOString();o.extractor=VER;return {ok:true,tramite:o};}
function minus(t){t=String(t||'').trim();return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñü]/.test(t)?t.charAt(0).toLowerCase()+t.slice(1):t;}
function aRecurso(tr){const s=tr.secciones||{},tx=k=>(s[k]&&s[k].texto)||'';const conEnl=k=>{const e=(s[k]&&s[k].enlaces)||[];return tx(k)+(e.length?'\nEnlaces: '+e.map(l=>l.t+(l.u?' ('+l.u+')':'')).join(' · '):'');};
 const lab=Object.fromEntries(SECC.map(([k,l])=>[k,l]));const dc=SECC.filter(([k])=>k!=='descripcion'&&k!=='finalidad'&&s[k]).map(([k])=>({dato:lab[k],valor:conEnl(k),pagina:''}));
 dc.push({dato:'Ficha del trámite en la sede electrónica',valor:tr.url||'',pagina:''});if(tr.enlace_tramitar)dc.push({dato:'Tramitar en línea',valor:tr.enlace_tramitar.t+' ('+tr.enlace_tramitar.u+')',pagina:''});
 const og=tx('organo_gestor'),ct=[];if(og){const tel=(og.match(/(?:\+34\s?)?[689]\d{2}[\s.]?\d{2,3}[\s.]?\d{2,3}[\s.]?\d{0,3}/)||[''])[0].trim(),em=(og.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)||[''])[0];ct.push({nombre:og.split('\n')[0].replace(/\s*\(.*$/,'').trim(),telefono:tel,email:em,web:''});}
 const t=tr.titulo,tm=minus(t),P=[t,'¿Cómo solicitar '+tm+'?','¿Qué documentos necesito para '+tm+'?','¿Dónde se tramita '+tm+'?'];const d1=((s.descripcion||{}).lineas||[])[0];if(d1&&nrm(d1)!==nrm(t)&&d1.length<120)P.splice(1,0,d1);
 if(s.plazo_resolucion)P.push('¿Cuánto tarda '+tm+'?');if(s.pago_tasas)P.push('¿Hay que pagar alguna tasa por '+tm+'?');
 return {formato:'elvira-recurso-1',id:'sede-'+HOST+'-'+(tr.id_sede||'sin-id'),sede:O,titulo:t,tipo:'tramite',origen:'sede',grupo:tr.organo_gestor||'Sin órgano gestor',area_sugerida:tr.tema||'',fuente:tr.url||'',url_analizada:tr.url||'',vigencia:{desde:'',hasta:''},intenciones:[],preguntas:[...new Set(P)],
  indicaciones:'Ficha oficial del trámite en la Sede electrónica. Para tramitarlo, remite siempre al enlace de la sede electrónica de esta ficha.',datos:{resumen:[tx('descripcion'),tx('finalidad')].filter(Boolean).join('\n'),eventos:[],actividades:[],datos_clave:dc,contactos:ct,tramite:tr}};}
function slug(t){return String(t||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60)||'tramite';}
function nombreArchivo(r){return slug(r.titulo)+'__'+(((r.datos||{}).tramite||{}).id_sede||'sin-id')+'.json';}
function carpeta(t){return String(t||'Sin órgano gestor').replace(/[\\/:*?"<>|]+/g,'-').replace(/\s+/g,' ').trim().slice(0,80);}
function grupos(recs){const G=new Map();recs.forEach(r=>{const g=r.grupo||'Sin órgano gestor';if(!G.has(g))G.set(g,[]);G.get(g).push(r);});return [...G.entries()].sort((a,b)=>a[0].localeCompare(b[0],'es')).map(([g,L])=>({grupo:g,tema:(L[0]||{}).area_sugerida||'',recursos:L.sort((x,y)=>String(x.titulo).localeCompare(String(y.titulo),'es'))}));}
function descodifica(buf,ct){let cs=((ct||'').match(/charset=([\w-]+)/i)||[])[1];if(!cs){const c=new TextDecoder('latin1').decode(new Uint8Array(buf).slice(0,4096));cs=(c.match(/<meta[^>]+charset=["']?([\w-]+)/i)||[])[1];}try{return new TextDecoder(cs||'utf-8').decode(buf);}catch(e){return new TextDecoder('utf-8').decode(buf);}}
function zip(files){const T=[];for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;T[n]=c>>>0;}const crc=d=>{let c=0xFFFFFFFF;for(let i=0;i<d.length;i++)c=T[(c^d[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;};
 const enc=new TextEncoder(),P=[],C=[];let off=0;const now=new Date(),hora=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1),dia=((now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
 for(const f of files){const nm=enc.encode(f.name),d=enc.encode(f.data),c=crc(d);const h=new DataView(new ArrayBuffer(30));h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x0800,true);h.setUint16(10,hora,true);h.setUint16(12,dia,true);h.setUint32(14,c,true);h.setUint32(18,d.length,true);h.setUint32(22,d.length,true);h.setUint16(26,nm.length,true);P.push(new Uint8Array(h.buffer),nm,d);
  const ce=new DataView(new ArrayBuffer(46));ce.setUint32(0,0x02014b50,true);ce.setUint16(4,20,true);ce.setUint16(6,20,true);ce.setUint16(8,0x0800,true);ce.setUint16(12,hora,true);ce.setUint16(14,dia,true);ce.setUint32(16,c,true);ce.setUint32(20,d.length,true);ce.setUint32(24,d.length,true);ce.setUint16(28,nm.length,true);ce.setUint32(42,off,true);C.push(new Uint8Array(ce.buffer),nm);off+=30+nm.length+d.length;}
 const tam=C.reduce((n,x)=>n+x.length,0),e=new DataView(new ArrayBuffer(22));e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,tam,true);e.setUint32(16,off,true);return new Blob([...P,...C,new Uint8Array(e.buffer)],{type:'application/zip'});}
function paquete(recs,errores){const fecha=new Date().toISOString().slice(0,10),G=grupos(recs),files=[];const comb=(L,g)=>JSON.stringify({formato:'elvira-recursos-1',sede:O,generado:new Date().toISOString(),grupo:g||undefined,total:L.length,recursos:L},null,1);
 G.forEach(x=>{const c=carpeta(x.grupo)+'/';x.recursos.forEach(r=>files.push({name:c+nombreArchivo(r),data:JSON.stringify(r,null,1)}));files.push({name:c+'_todos_'+slug(x.grupo)+'.json',data:comb(x.recursos,x.grupo)});});
 files.push({name:'_indice_tramites.json',data:JSON.stringify({formato:'elvira-indice-1',sede:O,generado:new Date().toISOString(),total:recs.length,errores:errores.length,organos:G.map(x=>({organo_gestor:x.grupo,tema:x.tema,total:x.recursos.length,tramites:x.recursos.map(r=>({id:r.id,titulo:r.titulo,archivo:carpeta(x.grupo)+'/'+nombreArchivo(r),url:r.fuente,huella:r.datos.tramite.huella,secciones:Object.keys(r.datos.tramite.secciones)}))}))},null,1)});
 if(errores.length)files.push({name:'_errores.json',data:JSON.stringify(errores,null,1)});files.push({name:'_todos.json',data:comb(recs)});
 return {zip:zip(files),nombre:'tramites_sede_'+slug(HOST)+'_por-organo_'+fecha+'.zip'};}
function descarga(n,b){const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=n;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},3000);}
function enlacesCatalogo(doc,html){const L=new Map();(doc?[...doc.querySelectorAll('a,[onclick]')]:[]).forEach(a=>{const s=(a.getAttribute('href')||'')+' '+(a.getAttribute('onclick')||'');const id=idDe(s);if(!id)return;const t=limpia(a.textContent)||limpia(a.getAttribute('title'));if(!L.has(id)||(!L.get(id).t&&t))L.set(id,{id:id,t:t,u:uF(id)});});
 let filas=doc?[...doc.querySelectorAll('table tbody tr[id]')]:[];try{if(doc===document&&window.jQuery&&jQuery.fn.dataTable){jQuery('table').each(function(){if(jQuery.fn.dataTable.isDataTable(this))filas=filas.concat(jQuery(this).DataTable().rows().nodes().toArray());});}}catch(e){}
 filas.forEach(tr=>{const id=tr.id;if(!/^\d{12,}$/.test(id))return;const td=tr.querySelectorAll('td');const t=limpia((td[0]||tr).textContent);const amb=limpia((td[td.length-1]||{}).textContent||'').replace(/^REG\w+\s+/,'').replace(/[,\s]+$/,'');const x={id:id,t:t,u:uF(id)};if(amb&&amb!==t)x.ambito=amb;if(!L.has(id)||!L.get(id).t)L.set(id,x);else if(x.ambito&&!L.get(id).ambito)L.get(id).ambito=x.ambito;});
 if(html){const re=/DETALLE=([0-9A-Za-z_\-]+)/gi;let m;while((m=re.exec(html)))if(!L.has(m[1]))L.set(m[1],{id:m[1],t:'',u:uF(m[1])});}return [...L.values()];}
async function traer(it){const r=await fetch(it.u,{credentials:'same-origin',cache:'no-store'});if(!r.ok)throw new Error('HTTP '+r.status);const html=descodifica(await r.arrayBuffer(),r.headers.get('content-type'));return analizar(new DOMParser().parseFromString(html,'text/html'),it.u,it.t);}
async function extraerTodos(items,cb,conc,pausa){const res=new Array(items.length);let i=0,h=0;async function ob(){while(i<items.length){const k=i++,it=items[k];try{res[k]=await traer(it);if(res[k].ok&&it.ambito)res[k].tramite.ambito_catalogo=it.ambito;}catch(e){res[k]={ok:false,id_sede:it.id,url:it.u,titulo:it.t,error:String(e&&e.message||e)};}h++;cb&&cb(h,items.length);if(pausa)await new Promise(r=>setTimeout(r,pausa));}}
 await Promise.all(Array.from({length:Math.min(conc,items.length)},ob));return res;}
const ST=window.__STA={host:HOST,estado:'buscando',inicio:new Date().toISOString(),version:VER};
(async()=>{try{
 let lista=/PAGE_CODE=CATALOGO/i.test(location.href)&&!idDe(location.href)?enlacesCatalogo(document,document.documentElement.innerHTML):[];
 if(!lista.length){const r=await fetch(CAT,{credentials:'same-origin'});const h=descodifica(await r.arrayBuffer(),r.headers.get('content-type'));lista=enlacesCatalogo(new DOMParser().parseFromString(h,'text/html'),h);ST.catalogo_por_fetch=true;}
 ST.total=lista.length;ST.estado=lista.length?'extrayendo':'catalogo_vacio';if(!lista.length)return;
 const res=await extraerTodos(lista,(n,t)=>{ST.hechos=n;},3,250);
 const ok=res.filter(r=>r&&r.ok),err=res.filter(r=>!r||!r.ok);const recs=ok.map(r=>aRecurso(r.tramite));window.__STA_RECS=recs;window.__STA_ERR=err;
 const cob={};SECC.forEach(([k])=>{cob[k]=recs.filter(r=>r.datos.tramite.secciones[k]).length;});
 const noMap={};ok.forEach(r=>(r.tramite.epigrafes_no_mapeados||[]).forEach(x=>{noMap[x]=(noMap[x]||0)+1;}));
 const p=paquete(recs,err);ST.zip=p.nombre;ST.zip_bytes=p.zip.size;descarga(p.nombre,p.zip);
 Object.assign(ST,{estado:'terminado',fin:new Date().toISOString(),ok:recs.length,errores:err.length,organos:grupos(recs).length,cobertura:cob,epigrafes_no_mapeados:noMap,
  media_epigrafes:recs.length?+(recs.reduce((n,r)=>n+Object.keys(r.datos.tramite.secciones).length,0)/recs.length).toFixed(2):0,
  ejemplo_errores:err.slice(0,3).map(e=>({t:e.titulo,e:e.error,d:(e.diagnostico||[]).slice(0,12)})),ejemplo:recs[0]?{titulo:recs[0].titulo,organo:recs[0].grupo,secciones:Object.keys(recs[0].datos.tramite.secciones)}:null});
}catch(e){ST.estado='error';ST.error=String(e&&e.message||e);}})();
return 'lanzado en '+HOST;
})();
