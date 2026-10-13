const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {isAdminProfile}=compile('lib/role-access.ts');
// Only admins see first-visit WhatsApp confirmations and reminders.
assert(isAdminProfile({id:'x',rol:'Admin'}));
assert(isAdminProfile({id:'x',rol:'asesora',email:'dubian.h88@gmail.com'}));
assert(!isAdminProfile({id:'x',rol:'asesora'}));
assert(!isAdminProfile({id:'x',rol:'contabilidad'}));
assert(!isAdminProfile({id:'6fa678ad-dbe1-486a-a3e8-5f818fb06f34',rol:'admin'}));
assert(!isAdminProfile(null));
console.log('PASS: only admin profiles count as administrators');
