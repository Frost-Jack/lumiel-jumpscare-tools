import {ID, buildChain, fingerprint} from "./core.js";
import {prepareFoxy} from "./foxy.js";
import {loadMedia, displayMedia} from "./media.js";

const CHANNEL = `module.${ID}`;
const resources = new Map();
const soundStops = new WeakMap();
const prepared = new Map();
export const reports = new Map();
const foxy = new Map();
let generation = 0;
let closeCurrent;

export const enabled = () => game.settings.get(ID, "enabled");
const changed = () => Hooks.callAll(`${ID}.status`);

function gmOnly() {
  if (!game.user.isGM) throw new Error("Это действие доступно только ГМу.");
}

function checkedChain(id, catalog) {
  const chain = buildChain(id, catalog);
  if (chain.some(s => s.mode === "foxy") && !game.settings.get(ID, "foxyEnabled")) throw new Error("Сначала включите Фокси.");
  return chain;
}

function send(message, recipients) {
  const remote = recipients.filter(id => id !== game.user.id);
  if (remote.length) game.socket.emit(CHANNEL, message, {recipients: remote});
  if (recipients.includes(game.user.id)) void receive(message, game.user.id);
}

function timeout(promise, ms, message) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  })]).finally(() => clearTimeout(timer));
}

async function resource(kind, path) {
  if (!path) return null;
  const key = `${kind}:${path}`;
  if (!resources.has(key)) {
    const loading = (async () => {
      if (kind === "image") {
        return timeout(loadMedia(path), 25000, "Не удалось загрузить изображение или видео.");
      }
      if (game.audio.locked) throw new Error("Нажмите в окне Foundry и повторите предзагрузку.");
      const sound = new foundry.audio.Sound(path, {context: game.audio.interface, forceBuffer: true});
      await timeout(sound.load(), 25000, `Звук не загрузился: ${path}`);
      if (!sound.loaded || sound.failed) throw new Error(`Не удалось загрузить звук: ${path}`);
      return sound;
    })();
    resources.set(key, loading);
    loading.catch(() => { if (resources.get(key) === loading) resources.delete(key); });
  }
  return resources.get(key);
}

async function loadChain(chain) {
  return Promise.all(chain.map(async scare => {
    const [image, sound, clip] = await Promise.all([
      resource("image", scare.image), resource("sound", scare.sound),
      scare.mode === "foxy" ? loadFoxy(scare.animation) : null
    ]);
    if (image?.kind === "video" && game.audio.locked) throw new Error("Нажмите в окне Foundry и повторите предзагрузку.");
    return {scare, image, sound, clip};
  }));
}

async function loadFoxy(animation) {
  if (!foxy.has(animation)) foxy.set(animation, prepareFoxy(animation));
  try { return await timeout(foxy.get(animation), 30000, "Кадры Фокси не успели загрузиться."); }
  catch (error) { foxy.delete(animation); throw error; }
}

export function statusFor(record, userId) {
  return record?.statuses.get(userId) ?? {state: "idle", detail: "Предзагрузка не выполнена"};
}

export function readyFor(id, chain, targetIds) {
  const record = reports.get(id);
  return !!targetIds.length && record?.signature === fingerprint(chain)
    && targetIds.every(userId => game.users.get(userId)?.active
      && ["ready", "disabled"].includes(statusFor(record, userId).state));
}

export function preload(id, catalog) {
  gmOnly();
  const chain = checkedChain(id, catalog);
  const previous = reports.get(id);
  clearTimeout(previous?.timer);
  const recipients = game.users.filter(u => u.active && (!u.isGM || u.id === game.user.id)).map(u => u.id);
  const record = {
    requestId: foundry.utils.randomID(), signature: fingerprint(chain),
    statuses: new Map(recipients.map(userId => [userId, {state: "loading", detail: "Загрузка…"}]))
  };
  reports.set(id, record);
  record.timer = setTimeout(() => {
    for (const [userId, status] of record.statuses) {
      if (status.state === "loading") record.statuses.set(userId, {state: "error", detail: "Нет ответа. Повторите предзагрузку."});
    }
    changed();
  }, 35000);
  send({type: "preload", requestId: record.requestId, chain}, recipients);
  changed();
  return record;
}

export function launch(id, catalog, targetIds) {
  gmOnly();
  const chain = checkedChain(id, catalog);
  const targets = [...new Set(targetIds)].filter(userId => game.users.get(userId)?.active && !game.users.get(userId).isGM);
  if (!readyFor(id, chain, targets)) throw new Error("Сначала дождитесь успешной предзагрузки у выбранных игроков.");
  const record = reports.get(id);
  const recipients = targets.filter(userId => statusFor(record, userId).state === "ready");
  if (!recipients.length) throw new Error("Все выбранные игроки отключили скримеры.");
  send({type: "play", requestId: record.requestId}, recipients);
  return recipients.length;
}

export async function preview(id, catalog) {
  gmOnly();
  if (!enabled()) throw new Error("Включите скримеры в личных настройках для предпросмотра.");
  const token = generation;
  const loaded = await loadChain(checkedChain(id, catalog));
  if (generation === token && enabled()) void playChain(loaded);
}

export function stopLocal() {
  generation++;
  closeCurrent?.();
  closeCurrent = undefined;
}

export function stopAll() {
  gmOnly();
  send({type: "stop"}, game.users.filter(u => u.active).map(u => u.id));
}

export function preferenceChanged() {
  stopLocal();
  prepared.clear();
  send({type: "preference"}, game.users.filter(u => u.active && u.isGM).map(u => u.id));
}

export function connectionChanged(user) {
  for (const record of reports.values()) record.statuses.delete(user.id);
  changed();
}

export function installSocket() {
  game.socket.on(CHANNEL, (message, senderId) => { void receive(message, senderId); });
}

export async function receive(message, senderId) {
  const sender = game.users.get(senderId);
  if (!sender?.active || !message || typeof message !== "object") return;
  if (message.type === "ack" && game.user.isGM) {
    const record = [...reports.values()].find(r => r.requestId === message.requestId);
    if (!record?.statuses.has(senderId) || !["ready", "disabled", "error"].includes(message.state)) return;
    record.statuses.set(senderId, {state: message.state, detail: String(message.detail ?? "").slice(0, 500)});
    if (![...record.statuses.values()].some(s => s.state === "loading")) clearTimeout(record.timer);
    changed();
    return;
  }
  if (message.type === "preference" && game.user.isGM) {
    connectionChanged(sender);
    return;
  }
  // Foundry 13 supplies senderId separately, authenticated by the server.
  if (!sender.isGM) return;
  if (message.type === "stop") { stopLocal(); return; }
  if (message.type === "preload") {
    if (typeof message.requestId !== "string" || !Array.isArray(message.chain)) return;
    const ack = (state, detail = "") => send({type: "ack", requestId: message.requestId, state, detail}, [senderId]);
    if (!enabled()) { ack("disabled", "Скримеры отключены игроком"); return; }
    try {
      const chain = buildChain(message.chain[0]?.id, message.chain);
      const loaded = await loadChain(chain);
      if (!enabled()) { ack("disabled", "Скримеры отключены игроком"); return; }
      for (const [key, item] of prepared) {
        if (item.owner === senderId && item.rootId === chain[0].id) prepared.delete(key);
      }
      prepared.set(message.requestId, {owner: senderId, rootId: chain[0].id, loaded});
      ack("ready", "Загружено");
    } catch (error) { ack("error", error.message); }
    return;
  }
  if (message.type === "play" && enabled()) {
    const item = prepared.get(message.requestId);
    if (item?.owner === senderId) void playChain(item.loaded);
    else send({type: "ack", requestId: message.requestId, state: "error", detail: "Ресурсы больше не подготовлены. Повторите предзагрузку."}, [senderId]);
  }
}

async function playChain(loaded) {
  stopLocal();
  const token = generation;
  try {
    for (const item of loaded) {
      if (token !== generation || !enabled()) break;
      await show(item);
    }
  } catch (error) {
    stopLocal();
    console.error(`${ID} |`, error);
    ui.notifications.error(`Скример: ${error.message}`);
  }
}

function show({scare, image, sound, clip}) {
  return new Promise((resolve, reject) => {
    const previousFocus = document.activeElement;
    let timer, soundTimer, view, overlay, animationStop, media;
    let done = false;
    const finish = error => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(soundTimer);
      animationStop?.();
      media?.dispose();
      const stopping = sound ? sound.stop() : Promise.resolve();
      if (sound) soundStops.set(sound, stopping);
      const closing = view?.rendered ? view.close() : Promise.resolve();
      overlay?.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      if (closeCurrent === finish) closeCurrent = undefined;
      void Promise.all([stopping, closing]).then(() => {
        if (error instanceof Error) reject(error);
        else resolve();
      }, reject);
    };
    closeCurrent = finish;
    const playSound = async () => {
      if (!sound) return;
      try {
        await soundStops.get(sound);
        if (done) return;
        await sound.play({volume: scare.volume});
        if (done) await sound.stop();
      } catch (error) { finish(error); }
    };
    const start = async () => {
      if (image) media = await displayMedia(image, scare);
      if (done) { media?.dispose(); return; }
      if (scare.mode === "image") {
        class ScareImage extends foundry.applications.api.ApplicationV2 {
          static DEFAULT_OPTIONS = {classes: ["ljs-media-window"], window: {resizable: true, icon: "fa-solid fa-image"}, position: {width: 640, height: 480}};
          async _renderHTML() { return media.element; }
          _replaceHTML(result, content) { content.replaceChildren(result); }
          async close(options) { await super.close(options); finish(); return this; }
        }
        view = new ScareImage({window: {title: scare.name}});
        void view.render({force: true}).then(() => {
          if (done) { void view.close(); return; }
          void media.play().catch(finish);
          void playSound();
          if (scare.advance === "timer") timer = setTimeout(finish, scare.duration * 1000);
        }).catch(finish);
      } else {
        overlay = document.createElement("dialog");
        overlay.className = `ljs-overlay ljs-${scare.mode}`;
        overlay.setAttribute("aria-label", scare.name);
        const close = document.createElement("button");
        close.type = "button";
        close.className = "ljs-close";
        close.textContent = "×";
        close.title = "Закрыть";
        close.setAttribute("aria-label", "Закрыть");
        close.addEventListener("click", finish);
        overlay.append(close);
        overlay.addEventListener("cancel", event => { event.preventDefault(); finish(); });
        if (clip) overlay.append(clip.canvas);
        else {
          const element = media.element;
          overlay.append(element);
          const shake = [
            {transform: "translate(0, 0) scale(1.12) rotate(0deg)", offset: 0.35},
            {transform: "translate(-1.5%, 1%) scale(1.14) rotate(-2deg)", offset: 0.5},
            {transform: "translate(1%, -1%) scale(1.12) rotate(2deg)", offset: 0.65},
            {transform: "translate(-1%, 0) scale(1.15) rotate(-1deg)", offset: 0.8},
            {transform: "translate(0, 0) scale(1.12) rotate(0deg)", offset: 1}
          ];
          const starts = {
            lunge: [{transform: "scale(0.2)", offset: 0}, {transform: "scale(1.2)", offset: 0.12}],
            door: [{transform: "translateX(-110%) rotate(-18deg) scale(0.85)", offset: 0}, {transform: "translateX(-10%) rotate(8deg) scale(1.05)", offset: 0.15}],
            close: [{transform: "scale(1.9) rotate(6deg)", offset: 0}, {transform: "scale(1.12) rotate(-3deg)", offset: 0.08}],
            dark: [{transform: "scale(0.5)", filter: "brightness(0)", offset: 0}, {transform: "scale(0.5)", filter: "brightness(0)", offset: 0.15}, {transform: "scale(1.2)", filter: "brightness(1)", offset: 0.28}]
          };
          const animation = element.animate([...(starts[scare.animation] ?? starts.lunge), ...shake], {duration: scare.duration * 1000, fill: "both"});
          animationStop = () => animation.cancel();
        }
        document.body.append(overlay);
        overlay.showModal();
        close.focus();
        if (clip) animationStop = clip.start();
        if (media) await media.play();
        if (done) return;
        soundTimer = setTimeout(() => void playSound(), scare.animation === "dark" ? scare.duration * 180 : 0);
        if (scare.advance === "timer") timer = setTimeout(finish, scare.duration * 1000);
      }
    };
    void start().catch(finish);
  });
}
