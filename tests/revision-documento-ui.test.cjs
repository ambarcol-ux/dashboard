const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript'),React=require('react');
const compile=require('./compile.cjs');
const flatten=e=>!e||typeof e!=='object'?[]:[e,...React.Children.toArray(e.props?.children).flatMap(flatten)];
function mount(path,extras){
 const state=[],effects=[];let cursor=0;const mod={exports:{}};
 const hooks={...React,useState(v){const i=cursor++;if(!(i in state))state[i]=v;return[state[i],v=>state[i]=typeof v==='function'?v(state[i]):v]},useRef(v){const i=cursor++;return state[i]??(state[i]={current:v})},useEffect:fn=>effects.push(fn)};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:mod.exports,console,URLSearchParams,Date,Event:class {constructor(type){this.type=type}},setTimeout,clearTimeout,document:extras.document||{},window:extras.window,require(n){if(n==='react')return hooks;if(n==='react/jsx-runtime')return require(n);if(n==='@/lib/supabase')return{supabase:extras.supabase};if(n==='next/navigation')return{useRouter:()=>({replace(){},refresh(){}})};if(n==='lucide-react')return new Proxy({},{get:()=>()=>null});if(n==='sonner')return{Toaster:()=>null,toast:{success(){},error(){}}};if(n.startsWith('@/lib/'))return compile(n.slice(2)+'.ts');return{default:()=>null};}});
 return {effects,render(props){cursor=0;return mod.exports.default(props)}};
}
(async()=>{
 const calls=[];const request={id:'request',contrato_id:'contract',estado:'en_proceso',responsable_id:'previous',responsable_nombre:'Anterior',created_at:'2026-10-07T12:00:00Z',metodo:'Transferencia',monto:300000,descuento:0};
 const props={requests:[request],events:[],contracts:[{id:'contract',numero_contrato:'TEST',sede:'Sede'}],profile:{id:'accountant',rol:'contabilidad'},onChange:async()=>{request.responsable_id='accountant'},openReceipt:async()=>{}};
 const panel=mount('components/DepositRequests.tsx',{window:{prompt:()=> 'Continuar trámite',confirm:()=>true,dispatchEvent(){}},supabase:{rpc:async(name,args)=>{calls.push({name,args});return{error:null}}}});
 let tree=panel.render(props);flatten(tree).find(e=>e.type==='button'&&e.props.children==='Ver solicitud').props.onClick();tree=panel.render(props);
 await flatten(tree).find(e=>e.type==='button'&&e.props.children==='Retomar pago a mi nombre').props.onClick();
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.equal(calls[0].name,'retomar_devolucion');assert.equal(calls[0].args.p_responsable_esperado,'previous');assert.equal(calls[0].args.p_motivo,'Continuar trámite');
 tree=panel.render(props);assert(flatten(tree).some(e=>e.type==='button'&&e.props.children==='Registrar pago y comprobante'));
 request.estado='devuelto';tree=panel.render(props);assert(!flatten(tree).some(e=>e.type==='button'&&['Retomar pago a mi nombre','Registrar pago y comprobante'].includes(e.props.children)));
 let verified=0,updated=0,signedOut=0,removed=false;const doc={cookie:''};
 const login=mount('app/login/page.tsx',{document:doc,window:{location:{hash:'#recovery_token=test-token',pathname:'/login'},history:{replaceState(){removed=true}}},supabase:{auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),verifyOtp:async args=>{assert.equal(args.type,'recovery');verified++;return{error:null}},updateUser:async()=>{updated++;return{error:null}},signOut:async()=>{signedOut++}}}});
 login.render();login.effects[0]();for(let i=0;i<20;i++)await Promise.resolve();tree=login.render();assert(removed);assert.equal(verified,1);
 const form=()=>flatten(login.render()).find(e=>e.type==='form');
 await form().props.onSubmit({preventDefault(){}});assert.equal(updated,0,'Reject empty password');
 tree=login.render();flatten(tree).find(e=>e.props?.name==='password').props.onChange({target:{name:'password',value:'Only-a-test-123'}});
 tree=login.render();flatten(tree).find(e=>e.props?.['aria-label']==='Confirmar nueva contraseña').props.onChange({target:{value:'Only-a-test-123'}});
 await form().props.onSubmit({preventDefault(){}});assert.equal(updated,1);assert.equal(signedOut,1);assert(doc.cookie.includes('max-age=0'));
 console.log('PASS: retake owner, payment controls, completed request read-only, recovery verification, password validation and session cleanup');
})().catch(e=>{console.error(e);process.exitCode=1});
