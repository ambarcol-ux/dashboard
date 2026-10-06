// Closed preview adapter: no network, credentials, uploads or database writes.
// Read-only lookups let the real operation forms open against fictional contracts.
export const previewReadClient = {
  from: () => {
    let write = false;
    let single = false;
    const query: Record<string, unknown> = {};
    for (const method of ['select','eq','neq','in','not','order','limit','range','gte','lte','gt','lt','ilike','or']) {
      query[method] = () => query;
    }
    for (const method of ['update','insert','upsert','delete']) {
      query[method] = () => { write = true; return query; };
    }
    for (const method of ['single','maybeSingle']) {
      query[method] = () => { single = true; return query; };
    }
    query.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve({data:single?null:[],error:write?{message:'Inicia sesión en el ERP copia para guardar este movimiento.'}:null}).then(resolve,reject);
    return query;
  },
};
