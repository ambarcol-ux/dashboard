const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function moduleExports(file) {
  const context = { exports: {}, Date, console };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return context.exports;
}
const initialDeposit = moduleExports('lib/initial-deposit.ts');
const validation = moduleExports('lib/invoice-validation.ts');
const editing = moduleExports('lib/saved-record-editing.ts');
function handler(file, name, context) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) expression = node.initializer.getText(source);
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(expression, `Missing handler ${name}`);
  vm.runInNewContext(ts.transpileModule(`exports.handler = ${expression}`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, context);
  return context.exports.handler;
}
function fixture() {
  const errors = [], writes = [], rows = new Map();
  const context = {
    exports: {}, ...validation, ...editing, ...initialDeposit, console, Date, Number, String, Math,
    document: { getElementById: () => ({ focus() {} }) },
    window: { confirm: () => true },
    toast: { error: e => errors.push(e), success() {}, warning() {}, info() {} },
    router: { push() {} }, user: { id: 'tester', email: 'test@example.invalid' },
    setLoading() {}, setCrossBranchWarning() {}, setIsSubmittingException() {},
    setShowYellowModal() {}, setModalLoading() {}, setContratos() {}, setIsEditingDrawer() {},
    setSelectedContract(value) { context.saved = value; }, refreshBitacora: async () => {},
    calculateReturnDate: () => '2027-01-10', validateDressesAvailability: async () => ({ severity: null }),
    resolveVestidoIds: async () => [{ id: 'dress', sede_actual_id: 'sede', tipo: 'XV', observaciones: '' }],
    checkInventory: async () => true,
    vestidos: [{ vestido_id: 'dress', referencia: 'TEST' }],
    arreglos: [], totalArreglos: 10, vipDiscount: 0, vipCodeInput: '', vipStatus: 'idle',
    accesoriosSeleccionados: [], metodosPago: [], userRole: 'admin', adminAuthorizedTransfer: false,
    alistamientoData: {}, asesoras: [], sedes: [], prexv: { prexv_componentes: [] }, prexvPayload: () => ({ prexv_componentes: [] }),
    supabase: {
      auth: { getUser: async () => ({ data: { user: context.user } }) },
      from(table) {
        let payload, id, operation;
        const execute = () => {
          if (operation) {
            writes.push({ table, operation, payload });
            if (table === 'contratos') {
              const data = Array.isArray(payload) ? payload[0] : payload;
              id = id || 'new-contract';
              rows.set(id, { ...(rows.get(id) || {}), ...data, id });
              return { data: rows.get(id), error: null };
            }
          }
          return { data: [], error: null };
        };
        const q = {
          select() { return q; }, like() { return q; }, order() { return q; }, limit() { return q; },
          eq(key, value) { if (key === 'id') id = value; return q; },
          insert(value) { operation = 'insert'; payload = value; return q; },
          update(value) { operation = 'update'; payload = value; return q; },
          single: async () => execute(), then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); },
        };
        return q;
      },
    },
  };
  return { context, writes, errors, rows };
}
const createFile = 'app/contratos/nuevo/page.tsx';
const dashboardFile = 'app/dashboard/page.tsx';
const fields = ['sede','sede_id','asesora','asesora_id','cliente_nombre','cliente_documento','whatsapp','cliente_email','direccion','quinceanera_name','tipo_evento','fecha_evento','fecha_fotografia','cita_medidas','prueba_final','fecha_entrega','tipo_entrega','valor_total','servicios_adicionales','anticipo','valor_deposito','deposito_banco','deposito_tipo_cuenta','deposito_numero','deposito_titular'];
(async () => {
  for (const name of ['handleSubmit', 'handleSolicitarAutorizacion']) {
    for (const value of [undefined, null, '', ' ', '\t\n', '\u00a0', '\u2003']) {
      const f = fixture(); f.context.formData = { numero_factura: value, valor_deposito: '' };
      await handler(createFile, name, f.context)();
      assert.deepEqual(f.errors, [validation.INVOICE_REQUIRED_MESSAGE]);
      assert.equal(f.writes.length, 0, `${name} wrote data with blank invoice`);
    }
    const f = fixture(); f.context.formData = Object.fromEntries(fields.map(key => [key, '']));
    Object.assign(f.context.formData, { numero_factura: ' FAC-001 ', valor_deposito: '300000', sede: 'Bogotá', sede_id: 'sede', cliente_nombre: 'PRUEBA', valor_total: '100', servicios_adicionales: '20', anticipo: '0', fecha_evento: '2027-01-01' });
    await handler(createFile, name, f.context)();
    assert.deepEqual(f.errors, []);
    const saved = f.rows.get('new-contract');
    assert.equal(saved.numero_factura, 'FAC-001');
    assert.equal(saved.valor_deposito, 300000);
    assert.equal(saved.valor_total, 120); assert.equal(saved.total_arreglos, 10);
  }
  for (const value of [undefined, null, '', ' ', '\u2003']) {
    const f = fixture(); f.context.selectedContract = { id: 'legacy', numero_factura: null };
    f.context.editForm = { numero_factura: value };
    await handler(dashboardFile, 'saveContractEdit', f.context)();
    assert.deepEqual(f.errors, [validation.INVOICE_REQUIRED_MESSAGE]); assert.equal(f.writes.length, 0);
    f.context.contract = { numero_factura: value };
    await handler('app/firma/[id]/page.tsx', 'handleSign', f.context)();
    assert.equal(f.errors.at(-1), validation.INVOICE_REQUIRED_MESSAGE); assert.equal(f.writes.length, 0);
  }
  const f = fixture();
  f.context.selectedContract = { id: 'legacy', numero_factura: null, cliente_nombre: 'PRUEBA', valor_total: 100, anticipo: 20, saldo: 80, total_arreglos: 10 };
  f.context.editForm = { ...f.context.selectedContract, numero_factura: ' FAC-EDITADA ' };
  f.rows.set('legacy', { ...f.context.selectedContract });
  await handler(dashboardFile, 'saveContractEdit', f.context)();
  assert.deepEqual(f.errors, []);
  assert.equal(f.rows.get('legacy').numero_factura, 'FAC-EDITADA');
  assert.equal(f.context.saved.numero_factura, 'FAC-EDITADA');
  assert.equal(f.context.saved.saldo, 90);
  for (const name of ['generatePDF', 'handleManualRelease', 'copyToClipboard', 'handleApproveException', 'approveContract']) {
    const f = fixture(); f.context.validateStoredInvoice = async () => null;
    await handler(dashboardFile, name, f.context)({ id: 'legacy' });
    assert.equal(f.writes.length, 0);
  }
  console.log('PASS: both creation handlers, edit/read-back, unchanged totals, blank signing, and server rejection prevents issue/finalization side effects.');
})().catch(error => { console.error(error); process.exitCode = 1; });

// Render the real form and document with a deterministic, local hook fixture.
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function renderComponent(file, props, mounted = false) {
  let stateIndex = 0;
  const hooks = { ...React, useEffect() {}, useState(value) {
    const index = stateIndex++;
    return [mounted && index === 0 ? true : (typeof value === 'function' ? value() : value), () => {}];
  } };
  const m = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText, { exports: m.exports, console, Date, Intl, require(name) {
    if (name === 'react') return hooks;
    if (name === '@/lib/supabase') return { supabase: {} };
    if (name === '@/lib/initial-deposit') return initialDeposit;
    if (name === '@/lib/invoice-validation') return validation;
    if (name === '@/lib/prexv') return require('../tests/compile.cjs')('lib/prexv.ts');
    if (name === '@/components/PreXvFields') return { default: () => null, __esModule: true };
    if (name === 'next/navigation') return { useRouter: () => ({}) };
    return require(name);
  } });
  return renderToStaticMarkup(m.exports.default(props));
}
const formHtml = renderComponent(createFile, {}, true);
assert.match(formHtml, /id="numero_factura"[^>]*required=""/);
assert.match(formHtml, /Número de factura/);
assert.match(formHtml, /id="valor_deposito"[^>]*min="0"/);
const doc = { numero_contrato: 'TEST-001', numero_factura: 'FAC-VISIBLE-123', cliente_nombre: 'PRUEBA', cliente_documento: 'TEST', cliente_direccion: '', valor_total: 100, anticipo: 20, saldo: 80 };
assert.match(renderComponent('components/ContractTemplate.tsx', { data: doc, plantillas: [] }), /Factura: FAC-VISIBLE-123/);
const legacyDoc = renderComponent('components/ContractTemplate.tsx', { data: { ...doc, numero_factura: null }, plantillas: [] });
assert.doesNotMatch(legacyDoc, /Factura:/);
console.log('PASS: required input rendered; invoice visible in document; historical document remains readable.');
