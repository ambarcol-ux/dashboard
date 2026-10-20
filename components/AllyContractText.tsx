import type {ContractSection} from '@/lib/ally-contract-text';

/** Renders the alliance contract sections (signing page and admin copy). */
export default function AllyContractText({sections}:{sections:ContractSection[]}){
 return <article className="space-y-4 text-[13px] leading-relaxed text-gray-700">{sections.map(s=><section key={s.titulo}>
  <h3 className="font-black text-gray-900 text-sm mb-1">{s.titulo}</h3>
  {s.parrafos.map((p,i)=><p key={i} className="mb-1">{p}</p>)}
  {s.lista&&<ul className="list-disc pl-5 space-y-0.5">{s.lista.map((l,i)=><li key={i}>{l}</li>)}</ul>}
 </section>)}</article>;
}
