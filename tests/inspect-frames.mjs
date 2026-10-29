import {createServer} from "node:http";
import {readFile, readdir, writeFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createRequire} from "node:module";
import {FOXY_CLIPS} from "../scripts/foxy-data.js";
const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../assets/sources");
const server = createServer(async (req, res) => {
  try { res.setHeader("Content-Type", "image/png"); res.setHeader("Access-Control-Allow-Origin", "*"); res.end(await readFile(path.join(root, new URL(req.url, "http://localhost").pathname))); }
  catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({channel:"chrome", headless:true});
const failures = [];
try {
  const page = await browser.newPage({viewport:{width:1500,height:1000}});
  for (const game of process.argv.length > 2 ? process.argv.slice(2) : ["fnaf1", "fnaf4"]) {
    const files = (await readdir(path.join(root, game))).filter(f => f.endsWith(".png")).sort((a,b) => Number.parseInt(a)-Number.parseInt(b));
    await page.setContent(`<style>body{margin:0;background:#555;font:16px sans-serif}.grid{display:grid;grid-template-columns:repeat(4,1fr)}figure{margin:4px}img,canvas{width:100%}</style><div class="grid">${files.map(f=>`<figure>${f}<img crossorigin="anonymous" src="http://127.0.0.1:${server.address().port}/${game}/${f}"></figure>`).join("")}</div>`);
    await page.evaluate(async()=>Promise.all([...document.images].map(im=>im.decode())));
    await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR, `source-${game}.png`),fullPage:true});
    const masks = JSON.parse(await readFile(path.join(root, `../${game}-foxy-masks.json`), "utf8"));
    await page.evaluate(({game, masks, repairs}) => {
      const images = [...document.images];
      images.forEach((image, index) => {
        const canvas = document.createElement("canvas");
        canvas.width = game === "fnaf1" ? 556 : image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        context.clip(new Path2D(masks[index]), "evenodd");
        context.drawImage(image, game === "fnaf1" ? 94 : 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
        for (const repair of repairs) {
          if (repair.frame !== index) continue;
          context.save();
          context.clip(new Path2D(repair.targetPath));
          context.transform(...repair.transform);
          context.clip(new Path2D(repair.sourcePath));
          context.drawImage(images[repair.sourceFrame], game === "fnaf1" ? 94 : 0, 0, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
          context.restore();
        }
        image.replaceWith(canvas);
      });
    }, {game, masks, repairs:FOXY_CLIPS[game].repairs ?? []});
    const checks = JSON.parse(await readFile(path.join(root, `../../tests/${game}-mask-checks.json`), "utf8"));
    if (checks.length !== files.length || masks.length !== files.length) throw new Error(`${game}: incomplete frame coverage`);
    const results = await page.evaluate(({files, checks}) => checks.map(check => {
      const canvas = document.querySelectorAll("canvas")[files.indexOf(check.file)];
      const context = canvas.getContext("2d");
      const failed = [];
      for (const [kind, coordinates] of Object.entries(check)) {
        if (kind === "file") continue;
        for (const [x, y] of coordinates) {
          const alpha = context.getImageData(x, y, 1, 1).data[3];
          if (kind === "foreground" ? alpha < 200 : alpha > 5) failed.push({kind, x, y, alpha});
        }
      }
      return {file: check.file, checked: check.foreground.length + check.background.length, failed};
    }), {files, checks});
    await writeFile(path.join(process.env.SCREENSHOT_DIR, `${game}-mask-results.json`), JSON.stringify(results, null, 2));
    for (const result of results) for (const failed of result.failed) failures.push({game, file:result.file, ...failed});
    console.log(`${game}: ${results.length} frames, ${results.reduce((sum, r) => sum + r.checked, 0)} landmarks, ${results.reduce((sum, r) => sum + r.failed.length, 0)} failures`);
    await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR, `masked-${game}.png`),fullPage:true});
    for (let start = 0; start < files.length; start += 4) {
      await page.evaluate(({start, game}) => {
        const figures = [...document.querySelectorAll("figure")];
        figures.forEach((figure, index) => { figure.hidden = index < start || index >= start + 4; });
        document.querySelector(".grid").style.gridTemplateColumns = `repeat(2, ${game === "fnaf1" ? 556 : 591}px)`;
        document.body.style.background = "#70858c";
      }, {start, game});
      await page.screenshot({path:path.join(process.env.SCREENSHOT_DIR, `checked-${game}-${start / 4}.png`),fullPage:true});
    }
  }
  if (failures.length) throw new Error(JSON.stringify(failures));
} finally {await browser.close();server.close();}
