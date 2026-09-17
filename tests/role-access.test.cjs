const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const mod={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/role-access.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:mod.exports});
const {canAccessPath,homeForRole,DEPOSITS_PATH}=mod.exports;
for(const role of ['contabilidad','CONTABILIDAD']) {
 assert.equal(homeForRole(role),DEPOSITS_PATH);
 for(const path of [DEPOSITS_PATH,DEPOSITS_PATH+'/', '/login']) assert.equal(canAccessPath(role,path),true);
 for(const path of ['/dashboard','/admin/users','/admin/reports','/contratos/nuevo','/perfil','/disponibilidad','/api/send-email',DEPOSITS_PATH+'/otro']) assert.equal(canAccessPath(role,path),false);
}
for(const role of ['admin','ADMIN','asesora']) {
 assert.equal(homeForRole(role),'/dashboard');
 assert.equal(canAccessPath(role,'/dashboard'),true);
}
console.log('PASS: accounting-only routes, login landing, administrator and advisor navigation');
