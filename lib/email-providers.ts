import {connect as tlsConnect} from 'node:tls';
import {connect as netConnect,type Socket} from 'node:net';

/** Configuración › Integraciones › Correo: one interchangeable connection. Adding a provider = one entry here. */
import {EMAIL_PROVIDERS,type EmailProviderId} from './email-provider-list';
export {EMAIL_PROVIDERS,type EmailProviderId};
export type EmailConnection={proveedor:EmailProviderId;config:Record<string,string>;secreto:string};
export type Contact={email:string;nombre:string|null;telefono:string|null};

const json=async(r:Response)=>{const d=await r.json().catch(()=>({}));return d as Record<string,unknown>;};
const fail=(r:Response,d:Record<string,unknown>)=>`El proveedor respondió ${r.status}${d.message||d.ErrorMessage?`: ${String(d.message||d.ErrorMessage).slice(0,160)}`:''}`;
const basic=(u:string,p:string)=>'Basic '+Buffer.from(`${u}:${p}`).toString('base64');
const T=()=>AbortSignal.timeout(15000);

/** Checks the credentials; returns the account name (or server) when they work. */
export async function testConnection(c:EmailConnection):Promise<{ok:true;detalle:string}|{ok:false;error:string}>{
 try{
  if(c.proveedor==='brevo'){const r=await fetch('https://api.brevo.com/v3/account',{headers:{'api-key':c.secreto,accept:'application/json'},signal:T()});const d=await json(r);
   return r.ok?{ok:true,detalle:`Cuenta ${String(d.companyName||d.email||'Brevo')}`}:{ok:false,error:fail(r,d)};}
  if(c.proveedor==='mailjet'){const r=await fetch('https://api.mailjet.com/v3/REST/myprofile',{headers:{Authorization:basic(c.config.api_key||'',c.secreto)},signal:T()});const d=await json(r);
   return r.ok?{ok:true,detalle:'Cuenta Mailjet'}:{ok:false,error:fail(r,d)};}
  if(c.proveedor==='sendgrid'){const r=await fetch('https://api.sendgrid.com/v3/user/account',{headers:{Authorization:`Bearer ${c.secreto}`},signal:T()});const d=await json(r);
   return r.ok?{ok:true,detalle:`Cuenta SendGrid (${String(d.type||'activa')})`}:{ok:false,error:fail(r,d)};}
  return await smtpLogin(c);
 }catch{return {ok:false,error:'Sin respuesta del proveedor. Revisa la conexión e intenta de nuevo.'};}
}

type Mail={to:string;nombre:string|null;asunto:string;texto:string;html:string};
type Result={ok:true;detalle:string}|{ok:false;error:string};
const smtpLogin=(c:EmailConnection)=>smtpSession(c,null);
const b64=(v:string)=>Buffer.from(v,'utf8').toString('base64');
const header=(v:string)=>`=?UTF-8?B?${b64(v)}?=`;

/** SMTP: greeting, EHLO and AUTH LOGIN with the saved user and password; with a mail, also MAIL/RCPT/DATA. */
function smtpSession(c:EmailConnection,mail:Mail|null):Promise<Result>{
 const host=String(c.config.host||'').trim(),port=Number(c.config.puerto||465),from=String(c.config.remitente_email||c.config.usuario||'').trim();
 if(!/^[a-z0-9.-]+$/i.test(host)||!Number.isInteger(port))return Promise.resolve({ok:false,error:'Revisa el servidor y el puerto.'});
 return new Promise(resolve=>{
  const socket:Socket=port===465?tlsConnect({host,port,servername:host}):netConnect({host,port});let buf='';let step=0;
  const done=(v:Result)=>{try{socket.end();}catch{}resolve(v);};
  const send=(l:string)=>socket.write(l+'\r\n');
  const onData=(chunk:Buffer)=>{buf+=chunk.toString();const lines=buf.split('\r\n').filter(Boolean);if(!buf.endsWith('\r\n')||!/^\d{3} /.test(lines[lines.length-1]||''))return;const code=Number(buf.slice(0,3)),text=buf;buf='';
   if(step===0){if(code!==220)return done({ok:false,error:'El servidor no respondió como SMTP.'});step=1;send('EHLO erp');}
   else if(step===1){if(code!==250)return done({ok:false,error:'El servidor rechazó el saludo.'});if(!/AUTH/i.test(text))return done({ok:false,error:'El servidor no ofrece inicio de sesión en este puerto (usa 465).'});step=2;send('AUTH LOGIN');}
   else if(step===2){if(code!==334)return done({ok:false,error:'El servidor no acepta AUTH LOGIN.'});step=3;send(b64(String(c.config.usuario||'')));}
   else if(step===3){if(code!==334)return done({ok:false,error:'Usuario rechazado.'});step=4;send(b64(c.secreto));}
   else if(step===4){if(code!==235)return done({ok:false,error:'Usuario o contraseña incorrectos.'});if(!mail){send('QUIT');return done({ok:true,detalle:`Servidor ${host}`});}step=5;send(`MAIL FROM:<${from}>`);}
   else if(step===5){if(code!==250)return done({ok:false,error:'El servidor rechazó el remitente.'});step=6;send(`RCPT TO:<${mail!.to}>`);}
   else if(step===6){if(code!==250&&code!==251)return done({ok:false,error:'El servidor rechazó el destinatario.'});step=7;send('DATA');}
   else if(step===7){if(code!==354)return done({ok:false,error:'El servidor no aceptó el mensaje.'});step=8;
    const name=String(c.config.remitente_nombre||'').trim();
    socket.write([`From: ${name?header(name)+' ':''}<${from}>`,`To: <${mail!.to}>`,`Subject: ${header(mail!.asunto)}`,'MIME-Version: 1.0','Content-Type: text/html; charset=UTF-8','Content-Transfer-Encoding: base64','',
     (b64(mail!.html).match(/.{1,76}/g)||[]).join('\r\n'),'.',''].join('\r\n'));}
   else if(step===8){send('QUIT');done(code===250?{ok:true,detalle:'smtp'}:{ok:false,error:'El servidor no entregó el mensaje.'});}
  };
  socket.setTimeout(15000,()=>done({ok:false,error:'El servidor no respondió a tiempo.'}));
  socket.on('data',onData);socket.on('error',()=>done({ok:false,error:'No se pudo conectar al servidor.'}));
 });
}

/** Sends one email through the active provider. Returns the provider's message id when it has one. */
export async function sendEmail(c:EmailConnection,mail:Mail):Promise<Result>{
 const from=String(c.config.remitente_email||'').trim(),name=String(c.config.remitente_nombre||'Ámbar Couture').trim();
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from))return {ok:false,error:'Falta el correo del remitente en Integraciones.'};
 try{
  let r:Response;
  if(c.proveedor==='brevo'){r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':c.secreto,'content-type':'application/json',accept:'application/json'},signal:T(),
   body:JSON.stringify({sender:{name,email:from},to:[{email:mail.to,...(mail.nombre?{name:mail.nombre}:{})}],subject:mail.asunto,htmlContent:mail.html,textContent:mail.texto})});
   const d=await json(r);return r.ok?{ok:true,detalle:String(d.messageId||'')}:{ok:false,error:fail(r,d)};}
  if(c.proveedor==='mailjet'){r=await fetch('https://api.mailjet.com/v3.1/send',{method:'POST',headers:{Authorization:basic(c.config.api_key||'',c.secreto),'content-type':'application/json'},signal:T(),
   body:JSON.stringify({Messages:[{From:{Email:from,Name:name},To:[{Email:mail.to,Name:mail.nombre||''}],Subject:mail.asunto,TextPart:mail.texto,HTMLPart:mail.html}]})});
   const d=await json(r);const m=(d.Messages as {To?:{MessageID?:number}[]}[]|undefined)?.[0]?.To?.[0]?.MessageID;return r.ok?{ok:true,detalle:String(m||'')}:{ok:false,error:fail(r,d)};}
  if(c.proveedor==='sendgrid'){r=await fetch('https://api.sendgrid.com/v3/mail/send',{method:'POST',headers:{Authorization:`Bearer ${c.secreto}`,'content-type':'application/json'},signal:T(),
   body:JSON.stringify({personalizations:[{to:[{email:mail.to,...(mail.nombre?{name:mail.nombre}:{})}]}],from:{email:from,name},subject:mail.asunto,content:[{type:'text/plain',value:mail.texto},{type:'text/html',value:mail.html}]})});
   return r.ok?{ok:true,detalle:r.headers.get('x-message-id')||''}:{ok:false,error:fail(r,await json(r))};}
  return await smtpSession(c,mail);
 }catch{return {ok:false,error:'Sin respuesta del proveedor; se reintentará.'};}
}

/** Sends the authorized contacts to the provider's list (creates or updates). */
export async function syncContacts(c:EmailConnection,contacts:Contact[]):Promise<{ok:true;enviados:number}|{ok:false;error:string}>{
 const lista=String(c.config.lista_id||'').trim();
 if(!EMAIL_PROVIDERS[c.proveedor].sincroniza)return {ok:false,error:'Este proveedor no sincroniza contactos.'};
 if(!/^[A-Za-z0-9-]+$/.test(lista))return {ok:false,error:'Escribe el ID de la lista de contactos.'};
 if(!contacts.length)return {ok:true,enviados:0};
 try{
  for(let i=0;i<contacts.length;i+=500){
   const part=contacts.slice(i,i+500);let r:Response;
   if(c.proveedor==='brevo')r=await fetch('https://api.brevo.com/v3/contacts/import',{method:'POST',headers:{'api-key':c.secreto,'content-type':'application/json',accept:'application/json'},signal:T(),
    body:JSON.stringify({listIds:[Number(lista)],updateExistingContacts:true,emptyContactsAttributes:false,jsonBody:part.map(p=>({email:p.email,attributes:{...(p.nombre?{NOMBRE:p.nombre}:{})}}))})});
   else if(c.proveedor==='mailjet')r=await fetch(`https://api.mailjet.com/v3/REST/contactslist/${lista}/managemanycontacts`,{method:'POST',headers:{Authorization:basic(c.config.api_key||'',c.secreto),'content-type':'application/json'},signal:T(),
    body:JSON.stringify({Action:'addnoforce',Contacts:part.map(p=>({Email:p.email,Name:p.nombre||''}))})});
   else r=await fetch('https://api.sendgrid.com/v3/marketing/contacts',{method:'PUT',headers:{Authorization:`Bearer ${c.secreto}`,'content-type':'application/json'},signal:T(),
    body:JSON.stringify({list_ids:[lista],contacts:part.map(p=>({email:p.email,first_name:p.nombre||undefined}))})});
   if(!r.ok)return {ok:false,error:fail(r,await json(r))};
  }
  return {ok:true,enviados:contacts.length};
 }catch{return {ok:false,error:'Sin respuesta del proveedor. Intenta de nuevo.'};}
}

/** Normalizes webhook payloads of each provider to {evento,email,baja}. Baja = unsubscribe or spam complaint. */
export function parseEvents(proveedor:EmailProviderId,body:unknown):{evento:string;email:string|null;baja:boolean;payload:unknown}[]{
 const list=Array.isArray(body)?body:[body];
 return list.filter(x=>x&&typeof x==='object').slice(0,500).map(raw=>{
  const x=raw as Record<string,unknown>,evento=String(x.event||x.Event||'desconocido').toLowerCase().slice(0,40),email=String(x.email||x.Email||'').trim().toLowerCase().slice(0,160)||null;
  const baja=proveedor==='brevo'?['unsubscribed','unsubscribe','spam','complaint'].includes(evento):proveedor==='mailjet'?['unsub','spam'].includes(evento):['unsubscribe','group_unsubscribe','spamreport'].includes(evento);
  return {evento,email,baja,payload:raw};
 });
}
