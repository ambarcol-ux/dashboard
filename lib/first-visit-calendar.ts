// Colombian holidays (Ley 51 de 1983). Mirrors private.festivo_colombia in the database,
// which is the authority; this copy only greys out days in the booking forms.
const iso=(d:Date)=>d.toISOString().slice(0,10);
const utc=(y:number,m:number,d:number)=>new Date(Date.UTC(y,m-1,d));
const plus=(d:Date,days:number)=>new Date(d.getTime()+days*86400000);
const nextMonday=(d:Date)=>plus(d,(8-d.getUTCDay())%7);
function easter(y:number){
 const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
 return utc(y,Math.floor((h+l-7*m+114)/31),(h+l-7*m+114)%31+1);
}
const cache=new Map<number,Set<string>>();
export function colombianHolidays(year:number){
 if(cache.has(year))return cache.get(year)!;
 const e=easter(year);
 const fixed=[[1,1],[5,1],[7,20],[8,7],[12,8],[12,25]].map(([m,d])=>utc(year,m,d));
 const moved=[[1,6],[3,19],[6,29],[8,15],[10,12],[11,1],[11,11]].map(([m,d])=>nextMonday(utc(year,m,d)));
 const easterBased=[plus(e,-3),plus(e,-2),nextMonday(plus(e,39)),nextMonday(plus(e,60)),nextMonday(plus(e,68))];
 const days=new Set([...fixed,...moved,...easterBased].map(iso));
 cache.set(year,days);return days;
}
export const isColombianHoliday=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&colombianHolidays(Number(day.slice(0,4))).has(day);
/** Why a first-visit day cannot be booked, or null when it is open. */
export function blockedVisitDay(day:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return null;
 const weekday=new Date(day+'T12:00:00Z').getUTCDay();
 if(weekday===0)return 'Domingo: sin atención';
 if(weekday===1&&isColombianHoliday(day))return 'Lunes festivo: sin atención';
 return null;
}
