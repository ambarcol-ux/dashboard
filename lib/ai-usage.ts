import Anthropic from '@anthropic-ai/sdk';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';

/** USD per million tokens (Claude API list prices, Nov 2026). Cache writes: 1.25× input (5 min) or 2× (1 h); reads as listed. */
const PRICES:Record<string,{in:number;out:number;read:number}>={
 'claude-haiku-5-5':{in:0.10,out:0.50,read:0.01},
 'claude-sonnet-5-5':{in:2,out:10,read:0.10},
 'claude-opus-5-5':{in:4,out:20,read:0.20},
};
type Usage={input_tokens?:number|null;output_tokens?:number|null;cache_read_input_tokens?:number|null;cache_creation_input_tokens?:number|null;
 cache_creation?:{ephemeral_5m_input_tokens?:number|null;ephemeral_1h_input_tokens?:number|null}|null};

/** Estimated cost in USD of one response. */
export function usageCost(model:string,u:Usage){
 const p=PRICES[model]||PRICES['claude-haiku-5-5'],m=1_000_000;
 const w1h=u.cache_creation?.ephemeral_1h_input_tokens||0,w5m=(u.cache_creation_input_tokens||0)-w1h;
 return ((u.input_tokens||0)*p.in+(u.output_tokens||0)*p.out+(u.cache_read_input_tokens||0)*p.read+Math.max(0,w5m)*p.in*1.25+w1h*p.in*2)/m;
}

let db:SupabaseClient|null=null;
/** Saves one call in ia_consumo (never breaks the caller). */
async function record(funcion:string,model:string,u:Usage){
 try{
  if(!process.env.NEXT_PUBLIC_SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY)return;
  db??=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
  await db.from('ia_consumo').insert({funcion:funcion.slice(0,60),modelo:model.slice(0,60),entrada:u.input_tokens||0,salida:u.output_tokens||0,
   cache_escritura:u.cache_creation_input_tokens||0,cache_lectura:u.cache_read_input_tokens||0,costo_usd:Number(usageCost(model,u).toFixed(6))});
 }catch{/* measurement only */}
}

/** Anthropic client whose messages.create also records tokens and cost under the name of the ERP function that uses it. */
export function aiClient(funcion:string,options?:ConstructorParameters<typeof Anthropic>[0]){
 const client=new Anthropic(options),create=client.messages.create.bind(client.messages);
 const tracked=async(params:Anthropic.MessageCreateParamsNonStreaming,opts?:Anthropic.RequestOptions)=>{
  const r=await create(params,opts);
  await record(funcion,String(params.model),r.usage as Usage);
  return r;
 };
 (client.messages as unknown as {create:typeof tracked}).create=tracked;
 return client;
}
