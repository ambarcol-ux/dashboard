const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
let effect,count,requests=0,resolveRequest,now=100000;const listeners=new Map(),intervals=new Set();
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/DepositAlert.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:mod.exports,Date:{now:()=>now},document:{visibilityState:'visible'},setInterval:fn=>{intervals.add(fn);return fn},clearInterval:fn=>intervals.delete(fn),window:{addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name)}},require(n){if(n==='react')return{useState:()=>[count,value=>{count=value}],useEffect:fn=>{effect=fn}};if(n==='@/lib/supabase')return{supabase:{from:()=>({select:()=>({in:()=>{requests++;return new Promise(resolve=>{resolveRequest=resolve})}})})}};return{}}});
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve()};
(async()=>{
 mod.exports.useDepositCount(5,'u');assert.equal(effect(),undefined);assert.equal(requests,0);assert.equal(intervals.size,0);
 mod.exports.useDepositCount(undefined,'u');const cleanup=effect();assert.equal(requests,1);assert.equal(intervals.size,1);
 listeners.get('focus')();listeners.get('depositos-actualizados')();assert.equal(requests,1,'Concurrent requests deduplicated');
 resolveRequest({count:5,error:null});await flush();assert.equal(count,5);
 listeners.get('focus')();assert.equal(requests,1,'Fresh count avoids focus reload');
 now+=30001;listeners.get('focus')();assert.equal(requests,1,'Under 2 minutes a focus does not reload');
 now+=90000;listeners.get('focus')();assert.equal(requests,2);
 resolveRequest({count:6,error:null});await flush();
 cleanup();assert.equal(intervals.size,0);assert.equal(listeners.size,0);
 console.log('PASS: supplied count skips network; single poller; no overlapping queries; stale-only focus; listener cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
