import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {createRequire} from "node:module";
import assert from "node:assert/strict";

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const publicRoot = path.resolve(root, "../../../App/resources/app/public");
const prefix = "/modules/lumiel-jumpscare-tools/";
const mime = {".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".svg":"image/svg+xml", ".png":"image/png", ".gif":"image/gif", ".mp4":"video/mp4", ".webm":"video/webm", ".webp":"image/webp", ".ogg":"audio/ogg", ".mp3":"audio/mpeg", ".wav":"audio/wav", ".woff2":"font/woff2", ".json":"application/json"};
const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    const base = pathname.startsWith(prefix) ? root : publicRoot;
    const file = path.resolve(base, "." + (pathname.startsWith(prefix) ? pathname.slice(prefix.length - 1) : pathname));
    if (!file.startsWith(base + path.sep)) throw new Error("Invalid path");
    const data = await readFile(file);
    res.writeHead(200, {"Content-Type": mime[path.extname(file)] || "application/octet-stream"}); res.end(data);
  } catch { res.writeHead(404); res.end("Not found"); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const address = `http://127.0.0.1:${server.address().port}${prefix}tests/browser.html`;
const browser = await chromium.launch({channel: "chrome", headless: true, args: ["--autoplay-policy=no-user-gesture-required", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]});
const clients = new Map();
const errors = [];
const screenDir = process.env.SCREENSHOT_DIR || root;
const check = message => console.log(`PASS ${message}`);
try {
  for (const id of ["gm", "p1", "p2"]) {
    const page = await browser.newPage({viewport: {width: 1280, height: 900}});
    clients.set(id, page);
    page.on("pageerror", error => errors.push(`${id}: ${error.message}`));
    await page.exposeFunction("sendSocket", async (message, recipients) => {
      await Promise.all(recipients.filter(target => clients.has(target)).map(target =>
        clients.get(target).evaluate(({message, sender}) => window.deliver(message, sender), {message, sender: id})));
    });
    await page.goto(`${address}?user=${id}${id === "p2" ? "&enabled=false" : ""}`);
    await page.waitForFunction(() => window.harnessReady);
  }
  const gm = clients.get("gm"), player = clients.get("p1"), disabled = clients.get("p2");
  await player.evaluate(() => api.openPanel());
  assert.equal(await player.locator(".ljs-panel").count(), 0);
  assert.match(await player.evaluate(() => notifications.at(-1).message), /ГМу/);
  check("player cannot open GM panel");
  const catalog = [
    {id:"a",name:"Портрет в журнале",mode:"image",animation:"lunge",image:"/icons/svg/skull.svg",sound:"modules/lumiel-jumpscare-tools/assets/fnaf2-xscream.ogg",duration:1,volume:0.3,nextId:"b",targetIds:["p1","p2"]},
    {id:"b",name:"Следующий скример",mode:"popup",animation:"door",image:"/icons/svg/terror.svg",sound:"modules/lumiel-jumpscare-tools/assets/fnaf2-xscream.ogg",duration:0.8,volume:0.4,nextId:"",targetIds:["p1"]}
  ];
  // Root-relative HTTP paths are deliberately tested as Foundry's FilePicker may return them.
  await gm.evaluate(async catalog => { await game.settings.set("lumiel-jumpscare-tools", "scares", catalog); await api.openPanel(); }, catalog);
  await gm.waitForSelector(".ljs-panel");
  await gm.screenshot({path: path.join(screenDir, "panel.png")});
  await gm.locator('[data-cmd="preload"]').click();
  await gm.waitForFunction(() => ["ready", "error"].includes(runtime.reports.get("a")?.statuses.get("p1")?.state));
  assert.equal(await gm.evaluate(() => runtime.reports.get("a").statuses.get("p1").state), "ready");
  assert.equal(await gm.evaluate(() => runtime.reports.get("a").statuses.get("p2").state), "disabled");
  assert.equal(await gm.locator('[data-cmd="launch"]').isEnabled(), true);
  check("whole-chain preload, decoded audio and opted-out player acknowledgements");
  await gm.locator('[data-cmd="launch"]').click();
  await player.waitForSelector(".ljs-media-window");
  assert.equal(await disabled.locator(".ljs-media-window, .ljs-overlay").count(), 0);
  await player.locator(".ljs-media-window .test-close").click();
  await player.waitForSelector(".ljs-popup");
  await player.waitForSelector(".ljs-popup", {state:"detached"});
  assert.equal(await player.evaluate(() => soundEvents.filter(e => e.type === "play").length), 2);
  check("image closes into popup; audio stops; disabled player sees and hears nothing");
  await gm.locator('[data-cmd="add"]').click();
  await gm.locator('[data-field="name"]').fill("Таймер окна");
  await gm.locator('[data-field="image"]').fill("/icons/svg/skull.svg");
  await gm.locator('[data-field="mode"]').selectOption("image");
  await gm.locator('[data-field="duration"]').fill("0.2");
  assert.equal(await gm.locator('[data-field="duration"]').isEnabled(), true);
  await gm.locator('[data-cmd="save"]').click();
  const timedId = await gm.evaluate(() => game.settings.get("lumiel-jumpscare-tools", "scares").at(-1).id);
  await gm.locator('[data-cmd="add"]').click();
  await gm.locator('[data-field="name"]').fill("Ожидание крестика");
  await gm.locator('[data-field="image"]').fill("/icons/svg/terror.svg");
  await gm.locator('[data-field="duration"]').fill("0.2");
  await gm.locator('[data-field="advance"]').selectOption("close");
  await gm.locator('[data-cmd="append"]').click();
  await gm.locator('[data-next="0"]').selectOption("b");
  await gm.locator('[data-cmd="save"]').click();
  const closeId = await gm.evaluate(() => game.settings.get("lumiel-jumpscare-tools", "scares").at(-1).id);
  await gm.locator('[data-select="b"]').click();
  await gm.locator('[data-field="duration"]').fill("0.2");
  await gm.locator('[data-select="a"]').click();
  await gm.locator('[data-cmd="append"]').click();
  await gm.locator('[data-next="1"]').selectOption(timedId);
  await gm.locator('[data-cmd="append"]').click();
  await gm.locator('[data-next="2"]').selectOption(closeId);
  await gm.locator('[data-cmd="up:2"]').click();
  await gm.locator('[data-cmd="down:0"]').click();
  await gm.locator('[data-cmd="remove:1"]').click();
  await gm.locator('[data-cmd="append"]').click();
  await gm.locator('[data-next="2"]').selectOption("b");
  await gm.locator('[data-cmd="save"]').click();
  assert.deepEqual(await gm.evaluate(() => game.settings.get("lumiel-jumpscare-tools", "scares").find(s => s.id === "a").nextIds), [closeId, timedId, "b"]);
  assert.equal(await gm.evaluate(() => game.settings.get("lumiel-jumpscare-tools", "scares").some(s => Object.hasOwn(s, "nextId"))), false);
  await gm.locator(".ljs-panel .test-close").click();
  await gm.evaluate(() => api.openPanel());
  await gm.waitForSelector('[data-next="2"]');
  assert.deepEqual(await gm.locator("[data-next]").evaluateAll(selects => selects.map(select => select.value)), [closeId, timedId, "b"]);
  await gm.screenshot({path: path.join(screenDir, "queue-panel.png")});
  await gm.locator('[data-cmd="preload"]').click();
  await gm.waitForFunction(() => runtime.reports.get("a")?.statuses.get("p1")?.state === "ready");
  await player.evaluate(() => {
    window.scareOrder = [];
    window.scareObserver = new MutationObserver(records => {
      for (const record of records) for (const node of record.addedNodes) {
        if (node instanceof Element && node.matches(".ljs-media-window, .ljs-overlay")) {
          scareOrder.push(node.getAttribute("aria-label") ?? node.querySelector(".window-title")?.textContent);
        }
      }
    });
    scareObserver.observe(document.body, {childList:true});
  });
  await gm.locator('[data-cmd="launch"]').click();
  await player.waitForSelector(".ljs-media-window");
  await player.locator(".ljs-media-window .test-close").click();
  await player.waitForSelector('.ljs-popup[aria-label="Ожидание крестика"]');
  await player.waitForTimeout(350);
  assert.equal(await player.locator('.ljs-popup[aria-label="Ожидание крестика"]').count(), 1);
  await player.locator(".ljs-close").click();
  await player.waitForFunction(() => scareOrder.length === 5 && !document.querySelector(".ljs-media-window, .ljs-overlay"));
  assert.deepEqual(await player.evaluate(() => scareOrder), ["Портрет в журнале", "Ожидание крестика", "Следующий скример", "Таймер окна", "Следующий скример"]);
  check("queue order, nested successors, repeated items, close-only popup and timed window survive saving and reopening");
  for (const action of ["stop", "opt-out"]) {
    await player.evaluate(() => { scareOrder.length = 0; });
    await gm.locator('[data-cmd="launch"]').click();
    await player.waitForSelector(".ljs-media-window");
    await player.locator(".ljs-media-window .test-close").click();
    await player.waitForSelector('.ljs-popup[aria-label="Ожидание крестика"]');
    if (action === "stop") await gm.locator('[data-cmd="stop"]').click();
    else await player.evaluate(() => game.settings.set("lumiel-jumpscare-tools", "enabled", false));
    await player.waitForSelector(".ljs-popup", {state:"detached"});
    await player.waitForTimeout(350);
    assert.deepEqual(await player.evaluate(() => scareOrder), ["Портрет в журнале", "Ожидание крестика"]);
  }
  await player.evaluate(() => game.settings.set("lumiel-jumpscare-tools", "enabled", true));
  check("emergency stop and player opt-out cancel all remaining queued scares");
  await gm.locator('[data-select="b"]').click();
  await gm.locator('[data-field="animation"]').selectOption("dark");
  await gm.locator('[data-cmd="preload"]').click();
  await gm.waitForFunction(() => runtime.reports.get("b")?.statuses.get("p1")?.state === "ready");
  await gm.locator('[data-field="duration"]').fill("1.5");
  assert.equal(await gm.locator('[data-cmd="launch"]').isDisabled(), true);
  check("animation and timing changes invalidate preparation");
  await gm.locator('[data-cmd="preload"]').click();
  await gm.waitForFunction(() => runtime.reports.get("b")?.statuses.get("p1")?.state === "ready");
  await gm.locator('[data-cmd="launch"]').click();
  await player.waitForSelector(".ljs-popup");
  await player.evaluate(() => game.settings.set("lumiel-jumpscare-tools", "enabled", false));
  await player.waitForSelector(".ljs-popup", {state:"detached"});
  await gm.waitForFunction(() => !runtime.reports.get("b").statuses.has("p1"));
  assert.equal(await gm.locator('[data-cmd="launch"]').isDisabled(), true);
  await player.evaluate(() => game.settings.set("lumiel-jumpscare-tools", "enabled", true));
  check("opt-out during playback cancels the chain and invalidates GM status");
  await player.evaluate(() => deliver({type:"preload",requestId:"spoof",chain:[{id:"z",mode:"popup",image:"/icons/svg/terror.svg",sound:"",duration:1,volume:1}]}, "p2"));
  await player.evaluate(() => deliver({type:"play",requestId:"spoof"}, "p2"));
  assert.equal(await player.locator(".ljs-overlay").count(), 0);
  check("player-originated socket commands are ignored");
  await gm.locator('[data-field="image"]').fill("assets/missing-image.png");
  await gm.locator('[data-cmd="preload"]').click();
  await gm.waitForFunction(() => runtime.reports.get("b")?.statuses.get("p1")?.state === "error");
  assert.equal(await gm.locator('[data-cmd="launch"]').isDisabled(), true);
  check("missing media blocks launch with a per-player error");
  await gm.bringToFront();
  for (const mode of ["image", "popup"]) {
    for (const filename of ["animation.gif", "clip.mp4", "clip.webm"]) {
      const entry = {id:"media-test",name:filename,mode,animation:"lunge",image:`modules/lumiel-jumpscare-tools/tests/fixtures/${filename}?v=1`,sound:"",duration:3,volume:0.4,nextId:"",targetIds:["p1"]};
      await gm.evaluate(async entry => {
        await game.settings.set("lumiel-jumpscare-tools", "scares", [entry]);
        await api.preview(entry.id);
      }, entry);
      const container = mode === "image" ? ".ljs-media-window" : ".ljs-popup";
      await gm.waitForSelector(container);
      if (filename.endsWith("gif")) {
        const image = gm.locator(`${container} img`);
        assert.equal(await image.evaluate(el => el.complete && el.naturalWidth === 80 && el.src.startsWith("blob:")), true);
        if (mode === "image") {
          const before = await image.screenshot();
          let changed = false;
          for (let attempt = 0; attempt < 5 && !changed; attempt++) {
            await gm.waitForTimeout(120);
            changed = !before.equals(await image.screenshot());
          }
          assert.equal(changed, true, "GIF frames should advance");
        }
      } else {
        await gm.waitForFunction(container => document.querySelector(`${container} video`)?.currentTime > 0.05, container);
        assert.deepEqual(await gm.evaluate(container => {
          const video = document.querySelector(`${container} video`);
          window.testVideo = video;
          return {controls:video.controls,controlsAttribute:video.hasAttribute("controls"),pip:video.disablePictureInPicture,remote:video.disableRemotePlayback,tab:video.tabIndex,muted:video.muted,volume:video.volume,pointer:getComputedStyle(video).pointerEvents};
        }, container), {controls:false,controlsAttribute:false,pip:true,remote:true,tab:-1,muted:false,volume:0.4,pointer:"none"});
      }
      if (mode === "popup") {
        assert.equal(await gm.locator(".ljs-close").textContent(), "×");
        await gm.locator(".ljs-close").click();
      } else await gm.locator(".ljs-media-window .test-close").click();
      await gm.waitForSelector(container, {state:"detached"});
      if (!filename.endsWith("gif")) assert.equal(await gm.evaluate(() => testVideo.paused && !testVideo.getAttribute("src")), true);
      check(`${filename} plays in ${mode} mode without playback controls and cleans up`);
    }
  }
  const remoteVideo = {id:"remote-video",name:"Video",mode:"popup",animation:"close",image:"modules/lumiel-jumpscare-tools/tests/fixtures/clip.mp4",sound:"",duration:3,volume:0.4,nextId:"",targetIds:["p1"]};
  await gm.evaluate(async entry => { await game.settings.set("lumiel-jumpscare-tools", "scares", [entry]); api.preload(entry.id); }, remoteVideo);
  await gm.waitForFunction(() => runtime.reports.get("remote-video")?.statuses.get("p1")?.state === "ready");
  await gm.evaluate(() => api.launch("remote-video", ["p1"]));
  await player.waitForFunction(() => document.querySelector(".ljs-popup video")?.currentTime > 0.05);
  await gm.evaluate(() => api.stopAll());
  await player.waitForSelector(".ljs-popup", {state:"detached"});
  check("video preloads and plays on the selected remote client");
  await gm.locator("[data-foxy]").check();
  await gm.locator('[data-select="builtin-foxy"]').click();
  await gm.locator('[data-cmd="all"]').click();
  await gm.locator('[data-cmd="preload"]').click();
  await gm.waitForFunction(() => ["ready", "error"].includes(runtime.reports.get("builtin-foxy")?.statuses.get("p1")?.state), null, {timeout:60000});
  const state = await gm.evaluate(() => runtime.reports.get("builtin-foxy").statuses.get("p1"));
  assert.equal(state.state, "ready", state.detail);
  check("game frames and original audio preload before launch");
  assert.equal(await gm.locator('[data-select^="builtin-foxy"]').count(), 5);
  await gm.clock.install();
  await gm.clock.pauseAt(new Date());
  for (const id of ["builtin-foxy-1", "builtin-foxy", "builtin-foxy-4", "builtin-foxy-sl", "builtin-foxy-6"]) {
    await gm.locator(`[data-select="${id}"]`).click();
    await gm.waitForFunction(id => document.querySelector(`[data-select="${id}"]`)?.classList.contains("selected"), id);
    await gm.evaluate(id => api.preview(id), id);
    await gm.waitForSelector(".ljs-foxy");
    assert.equal(await gm.evaluate(() => getComputedStyle(document.querySelector(".ljs-foxy")).backgroundColor), "rgba(0, 0, 0, 0)");
    assert.equal(await gm.evaluate(() => getComputedStyle(document.querySelector(".ljs-foxy"), "::backdrop").backgroundColor), "rgba(0, 0, 0, 0.75)");
    const transparent = await gm.evaluate(() => {
      const canvas = document.querySelector(".ljs-foxy canvas");
      const pixels = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let clear = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] === 0) clear++;
      return clear > 100;
    });
    assert.equal(transparent, true, `${id} must not contain an opaque game room`);
    if (id === "builtin-foxy-1") {
      await gm.clock.runFor(70);
      const repaired = await gm.evaluate(async () => {
        const rendered = document.querySelector(".ljs-foxy canvas").getContext("2d");
        const atlas = new Image(); atlas.src = "modules/lumiel-jumpscare-tools/assets/fnaf1-foxy-atlas.webp"; await atlas.decode();
        const canvas = document.createElement("canvas"); canvas.width = 556; canvas.height = 720;
        const original = canvas.getContext("2d"); original.drawImage(atlas, 3 * 556, 0, 556, 720, 0, 0, 556, 720);
        let changed = 0;
        for (let y = 80; y < 146; y++) for (let x = 0; x < 65; x++) {
          const a = rendered.getImageData(x, y, 1, 1).data, b = original.getImageData(x, y, 1, 1).data;
          if (a[3] === 255 && Math.max(...[0, 1, 2].map(k => Math.abs(a[k] - b[k]))) > 10) changed++;
        }
        const unaffected = [130, 200];
        return {changed, untouched: [...rendered.getImageData(...unaffected, 1, 1).data].slice(0, 3).every((v, k) => v === original.getImageData(...unaffected, 1, 1).data[k])};
      });
      assert.ok(repaired.changed > 100, "the occluded ear uses clean adjacent-frame texture");
      assert.equal(repaired.untouched, true, "the rest of the original frame stays unchanged");
      check("FNAF 1 ear repair is confined to the occluded ear");
      await gm.clock.runFor(170);
    } else await gm.clock.runFor(240);
    await gm.screenshot({path: path.join(screenDir, `${id}.png`)});
    await gm.evaluate(() => runtime.stopLocal());
    await gm.clock.runFor(30);
    await gm.waitForSelector(".ljs-foxy", {state:"detached"});
    check(`original ${id} frames render transparently over dimmed Foundry and stop`);
  }
  await gm.clock.resume();
  await gm.locator('[data-select="builtin-foxy-1"]').click();
  await gm.locator('[data-cmd="append"]').click();
  await gm.locator('[data-next="0"]').selectOption(timedId);
  await gm.locator('[data-cmd="all"]').click();
  await gm.locator('[data-cmd="preload"]').click();
  await gm.waitForFunction(() => runtime.reports.get("builtin-foxy-1")?.statuses.get("p1")?.state === "ready");
  await player.evaluate(() => { scareOrder.length = 0; });
  await gm.locator('[data-cmd="launch"]').click();
  await player.waitForFunction(() => scareOrder.length === 2 && !document.querySelector(".ljs-overlay, .ljs-media-window"));
  assert.deepEqual(await player.evaluate(() => scareOrder), ["Foxy · FNAF 1", "Таймер окна"]);
  assert.equal(await gm.locator('[data-select="builtin-foxy-1"]').count(), 1);
  check("fixed Foxy animation finishes into its saved follow-up queue without creating a duplicate preset");
  await gm.locator('[data-select="builtin-foxy"]').click();
  await gm.locator('[data-cmd="launch"]').click();
  await player.waitForSelector(".ljs-foxy");
  await gm.locator('[data-cmd="stop"]').click();
  await player.waitForSelector(".ljs-foxy", {state:"detached"});
  check("GM emergency stop removes remote game animation");
  assert.deepEqual(errors, []);
  check("no uncaught browser errors");
} catch (error) {
  for (const [id, page] of clients) console.log(id, JSON.stringify(await page.evaluate(() => ({notifications, reports:[...runtime.reports].map(([id, r]) => [id, [...r.statuses]])})).catch(() => null)));
  console.log("Browser errors", errors);
  throw error;
} finally {
  await browser.close();
  server.close();
}
