/** Configuración › Integraciones › Correo: providers and the fields each one asks for (safe for the browser). */
export type EmailProviderId='brevo'|'mailjet'|'sendgrid'|'smtp';
type Field={key:string;label:string;placeholder?:string};

export const EMAIL_PROVIDERS:Record<EmailProviderId,{nombre:string;secreto:string;campos:Field[];sincroniza:boolean;eventos:boolean;ayuda:string}>={
 brevo:{nombre:'Brevo',secreto:'Clave API (v3)',sincroniza:true,eventos:true,
  campos:[{key:'lista_id',label:'ID de la lista de contactos',placeholder:'Ej: 3'}],
  ayuda:'Brevo › Configuración › SMTP y API › Claves API. La lista se crea en Contactos › Listas (su número es el ID).'},
 mailjet:{nombre:'Mailjet',secreto:'Clave secreta',sincroniza:true,eventos:true,
  campos:[{key:'api_key',label:'Clave API (pública)'},{key:'lista_id',label:'ID de la lista de contactos'}],
  ayuda:'Mailjet › Configuración de la cuenta › Claves API (pública y secreta).'},
 sendgrid:{nombre:'SendGrid',secreto:'Clave API',sincroniza:true,eventos:true,
  campos:[{key:'lista_id',label:'ID de la lista (Marketing)'}],
  ayuda:'SendGrid › Settings › API Keys (permisos de Marketing).'},
 smtp:{nombre:'SMTP (Gmail, Outlook u hosting)',secreto:'Contraseña',sincroniza:false,eventos:false,
  campos:[{key:'host',label:'Servidor',placeholder:'smtp.gmail.com'},{key:'puerto',label:'Puerto',placeholder:'465'},{key:'usuario',label:'Usuario'}],
  ayuda:'Solo envía correos: no sincroniza contactos ni recibe aperturas, clics o bajas.'},
};

