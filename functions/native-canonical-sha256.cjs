'use strict';

const {createHash}=require('node:crypto');

function canonicalValue(value){return Array.isArray(value)?value.map(canonicalValue):(value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalValue(value[key])])):value)}
function nativeCanonicalSha256(value){return createHash('sha256').update(JSON.stringify(canonicalValue(value)),'utf8').digest('hex')}

module.exports={nativeCanonicalSha256};
