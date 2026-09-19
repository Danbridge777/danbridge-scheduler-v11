(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.DanbridgeXlsx=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const encoder=new TextEncoder();
  const xml=value=>String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const sheetName=value=>String(value||'Sheet').replace(/[\\/*?:\[\]]/g,' ').slice(0,31)||'Sheet';
  const colName=index=>{let name='';for(let n=index+1;n;n=Math.floor((n-1)/26))name=String.fromCharCode(65+(n-1)%26)+name;return name};
  const crcTable=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0}return table})();
  const crcUpdate=(crc,bytes)=>{let value=crc;for(const byte of bytes)value=crcTable[(value^byte)&255]^(value>>>8);return value>>>0};
  const u16=value=>new Uint8Array([value&255,(value>>>8)&255]);
  const u32=value=>new Uint8Array([value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255]);
  const concatParts=parts=>new Blob(parts,{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const dosDateTime=date=>{const d=date||new Date(),year=Math.max(1980,d.getFullYear());return{date:((year-1980)<<9)|((d.getMonth()+1)<<5)|d.getDate(),time:(d.getHours()<<11)|(d.getMinutes()<<5)|(d.getSeconds()>>1)}};

  const excelDateSerial=value=>{const date=value instanceof Date?value:new Date(value);if(Number.isNaN(date.getTime()))return null;return(Date.UTC(date.getFullYear(),date.getMonth(),date.getDate(),date.getHours(),date.getMinutes(),date.getSeconds())-Date.UTC(1899,11,30))/86400000};
  const bodyStyle=(kind,alternate)=>{const offset=alternate?1:0;if(kind==='date')return 3+offset;if(kind==='integer'||kind==='money')return 5+offset;if(kind==='decimal')return 7+offset;if(kind==='datetime')return 9+offset;return alternate?2:0};
  function cell(value,row,column,style=0){
    const ref=`${colName(column)}${row}`;
    const alternate=style===2||style===4||style===6||style===8||style===10;
    if(value instanceof Date){const serial=excelDateSerial(value),hasTime=value.getHours()||value.getMinutes()||value.getSeconds(),dateStyle=hasTime?9+(alternate?1:0):3+(alternate?1:0);if(serial!==null)return`<c r="${ref}" s="${dateStyle}"><v>${serial}</v></c>`}
    if(typeof value==='number'&&Number.isFinite(value)){const numberStyle=style<=2?(Number.isInteger(value)?5:7)+(alternate?1:0):style;return`<c r="${ref}" s="${numberStyle}"><v>${value}</v></c>`}
    if(typeof value==='boolean')return`<c r="${ref}" t="b"${style?` s="${style}"`:''}><v>${value?1:0}</v></c>`;
    return`<c r="${ref}" t="inlineStr"${style?` s="${style}"`:''}><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
  }
  function staticEntry(name,text){const bytes=encoder.encode(text),crc=(crcUpdate(0xffffffff,bytes)^0xffffffff)>>>0;return{name,chunks:[bytes],size:bytes.length,compressedSize:bytes.length,method:0,crc}}
  async function compressEntry(entry){
    if(typeof CompressionStream!=='function')return{...entry,compressedSize:entry.size,method:0};
    try{const stream=new Blob(entry.chunks).stream().pipeThrough(new CompressionStream('deflate-raw')),bytes=new Uint8Array(await new Response(stream).arrayBuffer());return{...entry,chunks:[bytes],compressedSize:bytes.length,method:8}}
    catch{return{...entry,compressedSize:entry.size,method:0}}
  }
  async function sheetEntry(sheet,index,onProgress){
    const chunks=[];let crc=0xffffffff,size=0,rowNumber=1,processed=0;
    const push=text=>{const bytes=encoder.encode(text);chunks.push(bytes);size+=bytes.length;crc=crcUpdate(crc,bytes)};
    const columns=(sheet.widths||[]).map((width,column)=>`<col min="${column+1}" max="${column+1}" width="${Math.max(8,Math.min(60,+width||14))}" customWidth="1"/>`).join('');
    push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${columns?`<cols>${columns}</cols>`:''}<sheetData>`);
    if(sheet.header?.length){push(`<row r="${rowNumber}" ht="25" customHeight="1">${sheet.header.map((value,column)=>cell(value,rowNumber,column,1)).join('')}</row>`);rowNumber++}
    let buffer='';
    for(const row of typeof sheet.rows==='function'?sheet.rows():sheet.rows||[]){const alternate=processed%2===1;buffer+=`<row r="${rowNumber}" ht="21" customHeight="1">${row.map((value,column)=>cell(value,rowNumber,column,bodyStyle(sheet.columnKinds?.[column],alternate))).join('')}</row>`;rowNumber++;processed++;if(processed%1000===0){push(buffer);buffer='';onProgress?.({sheet:index,processed});await new Promise(resolve=>setTimeout(resolve,0))}}
    if(buffer)push(buffer);const lastColumn=colName(Math.max(0,(sheet.header?.length||1)-1)),lastRow=Math.max(1,rowNumber-1),wide=(sheet.header?.length||0)>8;push(`</sheetData><autoFilter ref="A1:${lastColumn}${lastRow}"/><printOptions horizontalCentered="0" verticalCentered="0"/><pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="${wide?'landscape':'portrait'}" fitToWidth="1" fitToHeight="0"/></worksheet>`);
    return compressEntry({name:`xl/worksheets/sheet${index+1}.xml`,chunks,size,crc:(crc^0xffffffff)>>>0,rows:processed});
  }
  function zip(entries){
    const parts=[],central=[],time=dosDateTime(new Date());let offset=0;
    for(const entry of entries){const name=encoder.encode(entry.name),compressedSize=entry.compressedSize??entry.size,method=entry.method||0,local=[u32(0x04034b50),u16(20),u16(0),u16(method),u16(time.time),u16(time.date),u32(entry.crc),u32(compressedSize),u32(entry.size),u16(name.length),u16(0),name],localSize=local.reduce((n,part)=>n+part.length,0);parts.push(...local,...entry.chunks);central.push(u32(0x02014b50),u16(20),u16(20),u16(0),u16(method),u16(time.time),u16(time.date),u32(entry.crc),u32(compressedSize),u32(entry.size),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name);offset+=localSize+compressedSize}
    const centralOffset=offset,centralSize=central.reduce((n,part)=>n+part.length,0);parts.push(...central,u32(0x06054b50),u16(0),u16(0),u16(entries.length),u16(entries.length),u32(centralSize),u32(centralOffset),u16(0));return concatParts(parts);
  }
  async function createWorkbook({sheets,onProgress}={}){
    if(!Array.isArray(sheets)||!sheets.length)throw new Error('Excel 至少需要一個工作表');
    const names=sheets.map((sheet,index)=>sheetName(sheet.name||`Sheet ${index+1}`));
    const entries=[
      staticEntry('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`),
      staticEntry('_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
      staticEntry('xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((name,i)=>`<sheet name="${xml(name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`),
      staticEntry('xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`),
      staticEntry('xl/styles.xml','<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="4"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="#,##0"/><numFmt numFmtId="166" formatCode="#,##0.00"/><numFmt numFmtId="167" formatCode="yyyy-mm-dd hh:mm"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Aptos"/><color rgb="FF172033"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17324D"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F7FB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFD9E2EC"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="11"><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="165" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="166" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="167" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="167" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>')
    ];
    const rowCounts=[];for(let index=0;index<sheets.length;index++){const entry=await sheetEntry(sheets[index],index,onProgress);rowCounts.push(entry.rows);entries.push(entry)}
    return{blob:zip(entries),rowCounts,sheetNames:names};
  }
  return Object.freeze({createWorkbook});
});
