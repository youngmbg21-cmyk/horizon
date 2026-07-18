#!/usr/bin/env node
// Inject a scan.json into the bundled renderer template to produce a
// single self-contained scan.html. No network, no external deps.
//
// Usage:
//   node build.mjs <scan.json> <renderer.html> <out.html>
// Defaults: .codemap/scan.json  <skill>/assets/renderer.html  .codemap/scan.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const scanPath = process.argv[2] || '.codemap/scan.json';
const tplPath  = process.argv[3] || path.join(here, '..', 'assets', 'renderer.html');
const outPath  = process.argv[4] || '.codemap/scan.html';

const raw = fs.readFileSync(scanPath, 'utf8');
let scan;
try { scan = JSON.parse(raw); } catch (e) { console.error('scan.json is not valid JSON:', e.message); process.exit(1); }

// ---- validate the contract enough to catch the common mistakes ----
const errs = [];
const nodes = scan.graph?.nodes || [];
const edges = scan.graph?.edges || [];
const ids = new Set(nodes.map(n => n.id));
if (ids.size !== nodes.length) errs.push('node ids are not unique');
edges.forEach((e, i) => {
  if (!ids.has(e.from)) errs.push(`edge[${i}].from "${e.from}" has no node`);
  if (!ids.has(e.to))   errs.push(`edge[${i}].to "${e.to}" has no node`);
});
if (nodes.length > 60)  errs.push(`too many nodes (${nodes.length} > 60)`);
if (edges.length > 120) errs.push(`too many edges (${edges.length} > 120)`);
(scan.findings || []).forEach(f => {
  if (f.nodeId && !ids.has(f.nodeId)) errs.push(`finding ${f.id} nodeId "${f.nodeId}" has no node`);
  for (const v of ['plain', 'tech']) {
    for (const k of ['what', 'impact', 'fix']) {
      if (!f[v] || !f[v][k]) errs.push(`finding ${f.id} missing ${v}.${k}`);
    }
  }
});
if (errs.length) { console.error('scan.json failed validation:\n - ' + errs.join('\n - ')); process.exit(1); }

const tpl = fs.readFileSync(tplPath, 'utf8');
if (!tpl.includes('__SCAN_DATA__')) { console.error('renderer template missing __SCAN_DATA__ placeholder'); process.exit(1); }
// Guard against the data string breaking out of the <script> tag.
const dataStr = JSON.stringify(scan).replace(/<\//g, '<\\/');
const out = tpl.replace('__SCAN_DATA__', dataStr);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, out);
console.log(`Built ${outPath}  (${nodes.length} nodes, ${edges.length} edges, ${(scan.findings||[]).length} findings)`);
