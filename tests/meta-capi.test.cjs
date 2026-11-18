const assert=require('node:assert/strict'),compile=require('./compile.cjs'),{createHash}=require('node:crypto');
const {capiEvent,capiPhone}=compile('lib/meta-capi.ts');
const sha=v=>createHash('sha256').update(v).digest('hex');
assert.equal(capiPhone('3001234567'),'573001234567');
assert.equal(capiPhone('+57 300 123 4567'),'573001234567');
assert.equal(capiPhone('13212180623'),'573212180623');// Cal.com +1 mistake
assert.equal(capiPhone('12025550123'),'');// real foreign numbers are not sent
const e=capiEvent({evento:{id:'x',evento:'Purchase',event_id:'capi_alquilo_abc',event_time:'2026-10-14T21:00:00Z'},cita:{id:'c1',email:' Ana@Mail.com ',telefono:'3001234567',cliente_nombre:'Ána María Pérez'},sede:'Bogotá'});
assert.equal(e.event_name,'Purchase');
assert.equal(e.event_id,'capi_alquilo_abc');
assert.equal(e.event_time,Date.parse('2026-10-14T21:00:00Z')/1000);
assert.equal(e.action_source,'system_generated');
assert.equal(JSON.stringify(e.user_data.em),JSON.stringify([sha('ana@mail.com')]));
assert.equal(JSON.stringify(e.user_data.ph),JSON.stringify([sha('573001234567')]));
assert.equal(JSON.stringify(e.user_data.fn),JSON.stringify([sha('ana')]));
assert.equal(JSON.stringify(e.user_data.ln),JSON.stringify([sha('mariaperez')]));
assert.equal(JSON.stringify(e.user_data.ct),JSON.stringify([sha('bogota')]));
assert.equal(JSON.stringify(e.user_data.country),JSON.stringify([sha('co')]));
assert.ok(!JSON.stringify(e).includes('Ana'));// nothing in clear text
const empty=capiEvent({evento:{id:'y',evento:'Schedule',event_id:'erp_schedule_c2',event_time:'2026-10-14T21:00:00Z'},cita:{id:'c2',email:'',telefono:'',cliente_nombre:''},sede:null});
assert.equal(empty.user_data.em,undefined);assert.equal(empty.user_data.ph,undefined);
console.log('PASS: Meta CAPI events hash user data and normalise Colombian phones');

// WhatsApp-ad (Business Messaging) event: only with the ad click, within 7 days, mapped names, no personal data.
const {capiMessagingEvent}=compile('lib/meta-capi.ts');
const now=Date.parse('2026-11-18T12:00:00Z');
const job={evento:{id:'z',evento:'Schedule',event_id:'erp_schedule_c3',event_time:'2026-11-17T12:00:00Z',valor:null},cita:{id:'c3',email:'a@b.co',telefono:'3001234567',cliente_nombre:'Ana'},sede:'Pereira',ctwa_clid:'ARAkLkA'};
const m=capiMessagingEvent(job,'1276534877505186',now);
assert.equal(m.event_name,'LeadSubmitted');
assert.equal(m.action_source,'business_messaging');
assert.equal(m.messaging_channel,'whatsapp');
assert.equal(m.event_id,'erp_schedule_c3_wa');
assert.equal(m.user_data.ctwa_clid,'ARAkLkA');
assert.ok(!JSON.stringify(m).includes('a@b.co'));
assert.equal(capiMessagingEvent({...job,ctwa_clid:null},'1276534877505186',now),null);
assert.equal(capiMessagingEvent({...job,evento:{...job.evento,event_time:'2026-11-01T12:00:00Z'}},'1276534877505186',now),null);
const p=capiMessagingEvent({...job,evento:{...job.evento,evento:'Purchase',valor:850000}},'1276534877505186',now);
assert.equal(p.event_name,'Purchase');assert.equal(p.custom_data.value,850000);
