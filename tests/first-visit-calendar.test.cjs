const assert=require('node:assert/strict'),compile=require('./compile.cjs');
const {colombianHolidays,blockedVisitDay}=compile('lib/first-visit-calendar.ts');
// Official Colombian calendars (Ley 51 de 1983).
assert.deepEqual([...colombianHolidays(2026)].sort(),['2026-01-01','2026-01-12','2026-03-23','2026-04-02','2026-04-03','2026-05-01','2026-05-18','2026-06-08','2026-06-15','2026-06-29','2026-07-20','2026-08-07','2026-08-17','2026-10-12','2026-11-02','2026-11-16','2026-12-08','2026-12-25']);
assert.deepEqual([...colombianHolidays(2027)].sort(),['2027-01-01','2027-01-11','2027-03-22','2027-03-25','2027-03-26','2027-05-01','2027-05-10','2027-05-31','2027-06-07','2027-07-05','2027-07-20','2027-08-07','2027-08-16','2027-10-18','2027-11-01','2027-11-15','2027-12-08','2027-12-25']);
assert.match(blockedVisitDay('2026-11-16'),/Lunes festivo/);
assert.match(blockedVisitDay('2026-10-18'),/Domingo/);
assert.equal(blockedVisitDay('2026-10-19'),null);// ordinary Monday
assert.equal(blockedVisitDay('2026-12-08'),null);// Tuesday holiday: only Monday holidays are blocked
assert.equal(blockedVisitDay('2026-10-17'),null);
console.log('PASS: Colombian holidays, blocked Sundays and Monday holidays');
