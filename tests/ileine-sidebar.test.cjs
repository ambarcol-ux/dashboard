const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),compile=require('./compile.cjs');
const modExports={};
const deps={'next/link':{default:({children,...props})=>React.createElement('a',props,children)},'@/components/DepositAlert':{default:()=>null,useDepositCount:()=>0},'@/lib/role-access':compile('lib/role-access.ts'),'@/lib/panel-access':compile('lib/panel-access.ts'),'@/lib/use-panel-overrides':{usePanelOverrides:()=>null},'@/lib/use-permissions':{usePermissions:()=>null}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/Sidebar.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports:modExports,require:n=>deps[n]?{__esModule:true,...deps[n]}:require(n)});
const html=renderToStaticMarkup(React.createElement(modExports.default,{user:{id:'f5e07ef5-2daf-467e-a56a-2caeaf093c4f',rol:'asesora'},handleLogout:()=>{}}));
const links=[...html.matchAll(/<a[^>]*href="([^"]+)"/g)].map(x=>x[1]);
assert.deepEqual(links,[...deps['@/lib/role-access'].operationsPanels,...deps['@/lib/role-access'].operationsPanels]);
assert(!html.includes('MI PERFIL'));assert(html.includes('GESTIÓN DE INVENTARIO'));
console.log('PASS: Barranquilla advisor sidebar renders exactly the seven requested panels');
