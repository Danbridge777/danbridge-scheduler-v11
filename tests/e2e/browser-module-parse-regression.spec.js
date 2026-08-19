const fs=require('node:fs/promises');
const path=require('node:path');
const {test,expect}=require('@playwright/test');

test('firebase cloud module parses in the browser engine', async ({page})=>{
  const source=await fs.readFile(path.join(__dirname,'../../js/core/firebase-auth-and-cloud-sync.module.js'),'utf8');
  const body=source
    .replace(/^import\s+.*;\s*$/gm,'')
    .replace(/^export\s+(?=(?:async\s+)?function\b|class\b|(?:const|let|var)\b)/gm,'');
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error?.stack||error?.message||error)));
  await page.setContent(`<script type="module">async function danbridgeModuleParseProbe(){\n${body}\n}\ndocument.body.dataset.parse='ok';</script>`);
  await expect(page.locator('body')).toHaveAttribute('data-parse','ok');
  expect(errors).toEqual([]);
});
