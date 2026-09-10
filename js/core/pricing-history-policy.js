// Server-side guard. Compare with the record read INSIDE the committing
// transaction, never with a browser-supplied baseline or client clock.
const fields = {
 students: ['rate', 'partTimeTeacherRate', 'courseType'],
 teachers: ['rate', 'payrollMode', 'baseSalary', 'overtimeRate', 'deductionRate', 'minWeeklyHours', 'workDays', 'type']
};
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : plain(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const snapshot = (record, collection) => Object.fromEntries(fields[collection].map(key => [key, record?.[key] ?? null]));
const fail = message => { throw new Error('費率歷程保護：' + message); };
export function validPricingDate(value) {
 return typeof value === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) && value >= '0001-01-01' && Number.isFinite(Date.parse(value + 'T00:00:00Z')) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
}
export function pricingServerDate(now = Date.now()) {
 const timestamp = typeof now === 'number' ? now : Date.parse(now);
 if (!Number.isFinite(timestamp)) fail('伺服器日期無效');
 return new Date(timestamp + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function validatePricingHistory(record, collection) {
 if (!fields[collection] || !record) return null;
 if (record.pricingHistory === undefined && record.pricingHistoryVersion === undefined) return null;
 const rows = record.pricingHistory;
 if (record.pricingHistoryVersion !== 1 || !Array.isArray(rows) || rows.length < 1 || rows.length > 120) fail('版本或筆數不符');
 let previous = '';
 for (const row of rows) {
  if (!plain(row) || !validPricingDate(row.effectiveFrom) || row.effectiveFrom <= previous || !plain(row.values)) fail('日期重複、順序或格式不符');
  if (Object.keys(row.values).length !== fields[collection].length || fields[collection].some(key => !Object.hasOwn(row.values, key))) fail('費率欄位不完整');
  for (const [key, value] of Object.entries(row.values)) {
   if (value === null) continue;
   if (key === 'workDays') {
    if (!Array.isArray(value) || value.some(day => !Number.isInteger(day) || day < 0 || day > 6) || new Set(value).size !== value.length) fail('上班日格式不符');
   } else if (['courseType', 'payrollMode', 'type'].includes(key)) {
    if (typeof value !== 'string') fail('計費類型格式不符');
   } else if (!(typeof value === 'number' || typeof value === 'string') || !Number.isFinite(Number(value)) || Number(value) < 0) fail('金額或時數無效');
  }
  previous = row.effectiveFrom;
 }
 if (rows[0].effectiveFrom !== '0001-01-01') fail('缺少原始費率基準');
 if (!same(snapshot(record, collection), rows.at(-1).values)) fail('最新設定與歷程不一致，請更新頁面後重試');
 return rows;
}
export function assertPricingHistoryTransition({collection, before, after, now = Date.now(), restore = false}) {
 if (!fields[collection] || !after) return;
 const next = validatePricingHistory(after, collection);
 // A separately authorized, transaction-bound restore preview may restore an
// older complete record. Ordinary clients cannot obtain this bypass flag.
 if (restore) return;
 // Importing a brand-new identity cannot overwrite an existing price history.
 // Tombstone revives must still supply their retained record as `before`.
 if (!before) return;
 const prior = validatePricingHistory(before, collection);
 if (!prior && !next) return; // Legacy records remain writable during rollout.
 if (prior && !next) fail('不可移除已存在的歷程，請更新頁面後重試');
 if (prior && same(prior, next)) return;
 const today = pricingServerDate(now);
 if (!prior && before && !same(next[0].values, snapshot(before, collection))) fail('原始費率與雲端資料不符');
 if (prior) {
  for (const row of prior) {
   const replacement = next.find(item => item.effectiveFrom === row.effectiveFrom);
   if (!replacement || (row.effectiveFrom < today && !same(row, replacement))) fail('不可刪除或覆寫已生效的歷史');
  }
 }
 for (let index = 1; index < next.length; index++) {
  const row = next[index], original = prior?.find(item => item.effectiveFrom === row.effectiveFrom);
  if (original && same(original, row)) continue;
  if (row.effectiveFrom < today) fail('新增或修改生效日不得早於伺服器今天');
  const previous = next[index - 1].values;
  if ((collection === 'teachers' || previous.courseType !== row.values.courseType || previous.courseType === '安親' || row.values.courseType === '安親') && !row.effectiveFrom.endsWith('-01')) fail('薪資、安親或課程類型只能從月份第一天生效');
 }
}
