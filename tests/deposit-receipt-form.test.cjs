const fs=require('fs'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict'),React=require('react');
const compile=require('./compile.cjs');
const source=fs.readFileSync('app/dashboard/devoluciones-depositos/page.tsx','utf8').replace('function MovementForm(', 'export function MovementForm(');
async function check(type){
 let cursor=0,success=0;const states=[],calls=[];
 const hooks={...React,useState(initial){const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],v=>{states[i]=v}]},useRef(initial){const i=cursor++;return states[i]??(states[i]={current:initial})},useEffect(){}};
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:mod.exports,Date,Intl,crypto:{randomUUID:()=> 'operation-test'},require(n){if(n==='react')return hooks;if(n==='react/jsx-runtime')return require(n);if(n==='@/lib/deposits')return compile('lib/deposits.ts');if(n==='@/lib/contract-calendar')return{bogotaDay:()=> '2026-09-17'};if(n==='@/lib/supabase')return{supabase:{storage:{from:()=>({upload:async()=>({error:null})})},rpc:async(name,args)=>{calls.push(args);return{error:null}}}};if(n==='lucide-react')return new Proxy({},{get:()=>()=>null});return{default:{}}}});
 const action={contract:{id:'contract-test',numero_contrato:'TEST',cliente_nombre:'Prueba',valor_deposito:300000},available:300000,type};
 const render=()=>{cursor=0;return mod.exports.MovementForm({action,onClose(){},onSuccess:async()=>{success++}})};
 const flatten=e=>!e||typeof e!=='object'?[]:[e,...React.Children.toArray(e.props?.children).flatMap(flatten)];
 let tree=render();const file=flatten(tree).find(e=>e.type==='input'&&e.props.type==='file');file.props.onChange({target:{files:[{type:'image/png',size:100}]}});tree=render();
 if(type==='soporte')assert(!flatten(tree).some(e=>e.type==='input'&&e.props.type==='number'),'Receipt must not ask for amount');
 await flatten(tree).find(e=>e.type==='form').props.onSubmit({preventDefault(){}});
 if(type==='soporte'){assert.equal(success,1);assert.equal(calls.length,1);assert.equal(calls[0].p_accion,'soporte');assert.equal(calls[0].p_datos.monto,0)}
 else{assert.equal(success,0);assert.equal(calls.length,0,'Blank additional income must not be recorded')}
}
(async()=>{await check('soporte');await check('ingreso');console.log('PASS: uploading receipt without amount submits support with zero; new income still requires a positive amount.');})().catch(e=>{console.error(e);process.exitCode=1});
