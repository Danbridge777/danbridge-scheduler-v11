/**
 * Danbridge Scheduler — Date Utilities (V15.3)
 *
 * 從大型業務檔抽出的純日期工具。函式內容與 V15.2 完全一致。
 */
function localDate(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}

function todayStr(){return localDate(new Date())}

function monthNow(){return todayStr().slice(0,7)}

function weekday(d){return ['日','一','二','三','四','五','六'][new Date(d+'T00:00:00').getDay()]}

function shiftDate(ds,days){const d=new Date(ds+'T00:00:00');d.setDate(d.getDate()+days);return localDate(d)}

function monthLabel(m){const[y,mo]=String(m||'').split('-');return y&&mo?`${y}年${Number(mo)}月`:m}
