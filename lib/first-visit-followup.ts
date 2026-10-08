export const commercialResults=['EN SEGUIMIENTO','ALQUILÓ','AGENDÓ NUEVA CITA','DESISTIÓ','CERRADO SIN RESPUESTA','NO CONTACTAR','EVENTO FINALIZADO'] as const;
export function followupPlan(visit:string,event:string):string[]{
 const a=Date.parse(visit+'T12:00:00Z'),b=Date.parse(event+'T12:00:00Z'),day=86400000;
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a+day)return [];
 const gap=Math.round((b-a)/day),start=gap>=30?2:1,end=gap>=30?gap-7:gap-1,n=Math.min(5,end-start+1);
 return Array.from(new Set(Array.from({length:n},(_,i)=>new Date(a+(n===1?start:start+Math.round(i*(end-start)/(n-1)))*day).toISOString().slice(0,10))));
}
export function followupUrgency(date:string,done:boolean,result:string,today:string){
 if(done||result==='ALQUILÓ')return 'realizado';
 if(result!=='EN SEGUIMIENTO')return 'cerrado';
 if(date<today)return 'vencido';
 if(Date.parse(date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z')<=86400000)return 'próximo';
 return 'pendiente';
}
