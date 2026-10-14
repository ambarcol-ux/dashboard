// Shared by the ally sign-up and VIP-pass routes (and their tests).
export const allySlug=(name:string)=>name.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,'');
export const validEmail=(value:string)=>value.length<=160&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const validPhone=(value:string)=>/^[0-9+\s()-]{7,20}$/.test(value);
const text=(value:unknown,max:number)=>String(value??'').trim().slice(0,max+1);

export function allyRegistration(input:Record<string,unknown>){
 const marca=text(input.marca,120),contacto=text(input.contacto,120),telefono=text(input.telefono,20),correo=text(input.correo,160).toLowerCase();
 if(marca.length<2||marca.length>120||contacto.length<2||contacto.length>120||!validPhone(telefono)||!validEmail(correo)||input.aceptaTerminos!==true)throw Error('Revisa los datos y acepta los términos.');
 const slug=allySlug(marca);
 if(slug.length<2)throw Error('Escribe un nombre de marca válido.');
 return {nombre_aliado:marca,contacto_nombre:contacto,telefono,correo,porcentaje_comision:0,estado:'Activo',vitrina_sede:'Ámbar Couture',slug_unico:slug,acepto_terminos:true};
}

export function vipPassRequest(input:Record<string,unknown>,today:string){
 const nombre=text(input.nombre,120),telefono=text(input.telefono,20),correo=text(input.correo,160).toLowerCase(),fecha=text(input.fechaEvento,10);
 if(nombre.length<2||nombre.length>120||!validPhone(telefono)||!validEmail(correo)||!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||fecha<today)throw Error('Por favor, completa todos los campos correctamente.');
 return {nombre,telefono,correo,fecha};
}
