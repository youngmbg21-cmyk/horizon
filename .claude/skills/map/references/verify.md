# Verifying scan.html

The HTML is the deliverable, so exercise it before handing it over. Any headless
browser works. With Playwright + a pre-installed Chromium:

```bash
node --input-type=module -e '
import { chromium } from "playwright";           // adjust path if resolving from a global install
const b = await chromium.launch();               // add { executablePath: "/opt/pw-browsers/chromium" } if needed
const p = await b.newPage({ viewport: { width: 1360, height: 900 } });
const errs = [];
p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
p.on("pageerror", e => errs.push("PAGEERR: " + e.message));
await p.goto("file://" + process.cwd() + "/.codemap/scan.html");
await p.waitForTimeout(2400);

const scan = JSON.parse(await p.$eval("#data", e => e.textContent));
const nodes = await p.$$eval(".node", e => e.length);
const links = await p.$$eval(".link", e => e.length);
let listCount = 0, defaultView = "n/a", textChanged = "n/a", detailOpen = false;
if ((scan.findings || []).length) {
  await p.click("#findBtn"); await p.waitForTimeout(250);
  listCount = await p.$$eval("#flist .fitem", e => e.length);
  await p.evaluate(() => document.querySelector("#flist .fitem").click());
  await p.waitForTimeout(300);
  defaultView = await p.$eval("#fviews button.on", e => e.dataset.v);
  const plain = await p.$eval("#flist .fitem.exp .fblock .bt", e => e.textContent);
  await p.evaluate(() => [...document.querySelectorAll("#fviews button")].find(b => b.dataset.v === "tech").click());
  await p.waitForTimeout(200);
  const tech = await p.$eval("#flist .fitem.exp .fblock .bt", e => e.textContent);
  textChanged = plain !== tech;
  detailOpen = await p.$eval("#detail", e => e.classList.contains("open"));
}
const ok = nodes === scan.graph.nodes.length
        && links === scan.graph.edges.length
        && listCount === (scan.findings || []).length
        && (!(scan.findings||[]).length || (textChanged === true && detailOpen))
        && errs.length === 0;
console.log(JSON.stringify({ ok, nodes, links, listCount, defaultView, textChanged, detailOpen, errs }));
await b.close();
process.exit(ok ? 0 : 1);
'
```

Expect `ok: true`, `defaultView: "plain"`, `textChanged: true`, and an empty
`errs`. If `nodes`/`links`/`listCount` disagree with the JSON, the data is the
problem — fix `scan.json` and re-run `build.mjs`, not the HTML.
