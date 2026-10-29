import {FOXY_CLIPS} from "./foxy-data.js";

export const ID = "lumiel-jumpscare-tools";
export const ROOT = `modules/${ID}`;
export const FOXY_ID = "builtin-foxy";
export const FOXY_PRESETS = Object.freeze([
  {id: "builtin-foxy-1", name: "Foxy · FNAF 1", animation: "fnaf1", sound: "fnaf1-xscream.wav"},
  {id: FOXY_ID, name: "Withered Foxy · FNAF 2", animation: "fnaf2", sound: "fnaf2-xscream.ogg"},
  {id: "builtin-foxy-4", name: "Nightmare Foxy · FNAF 4", animation: "fnaf4", sound: "fnaf4-xscream.ogg"},
  {id: "builtin-foxy-sl", name: "Funtime Foxy · Sister Location", animation: "sister-location", sound: "fnafsl-scream.ogg"},
  {id: "builtin-foxy-6", name: "Rockstar Foxy · FNAF 6", animation: "fnaf6", sound: "fnaf6-scream.mp3"}
].map(preset => Object.freeze({...preset, mode: "foxy", image: "", sound: `${ROOT}/assets/${preset.sound}`,
  duration: FOXY_CLIPS[preset.animation].durations.reduce((sum, ms) => sum + ms, 0) / 1000, volume: 0.8, advance: "timer", nextIds: Object.freeze([])})));
export const normalizeFoxyId = id => ["builtin-foxy-lunge", "builtin-foxy-close", "builtin-foxy-dark"].includes(id) ? FOXY_ID : id;
export const isFoxy = id => FOXY_PRESETS.some(s => s.id === id);
export const ANIMATIONS = {lunge: "Рывок к камере", door: "Сбоку у двери", close: "Резкий крупный план", dark: "Из темноты"};

export function normalizeScare(entry) {
  const {nextId, ...scare} = entry;
  return {...scare, nextIds: (entry.nextIds ?? (nextId ? [nextId] : [])).map(normalizeFoxyId),
    advance: entry.advance ?? (entry.mode === "image" ? "close" : "timer")};
}

export function mediaPath(value) {
  if (!value) return "";
  const path = String(value).trim();
  if (/^(?:https?:\/\/|\/(?!\/)|[^:/?#]+(?:\/|$))/i.test(path) && !/^(?:javascript|data|file|blob):/i.test(path)) return path;
  throw new Error("Укажите путь к ресурсу Foundry или HTTP(S)-адрес.");
}

export function buildChain(id, catalog) {
  const chain = [];
  const active = new Set();
  const visit = id => {
    if (!id) throw new Error("Выберите следующий скример или уберите строку.");
    id = normalizeFoxyId(id);
    if (active.has(id)) throw new Error("В очереди есть цикл.");
    active.add(id);
    const saved = catalog.find(s => s.id === id);
    const preset = FOXY_PRESETS.find(s => s.id === id);
    const entry = preset ? {...preset, nextIds: normalizeScare(saved ?? preset).nextIds} : saved;
    if (!entry) throw new Error("Следующий скример удалён или не найден.");
    if (!["image", "popup", "foxy"].includes(entry.mode)) throw new Error("Неизвестный режим скримера.");
    const scare = {...normalizeScare(entry), animation: entry.animation ?? "lunge", image: mediaPath(entry.image), sound: mediaPath(entry.sound)};
    if (!["close", "timer"].includes(scare.advance)) throw new Error("Неизвестный способ завершения.");
    if (!Object.hasOwn(scare.mode === "foxy" ? FOXY_CLIPS : ANIMATIONS, scare.animation)) throw new Error("Неизвестная анимация скримера.");
    if (scare.mode !== "foxy" && !scare.image) throw new Error(`«${scare.name}»: выберите файл.`);
    if (!Number.isFinite(scare.duration) || scare.duration < 0.2 || scare.duration > 60) throw new Error("Длительность должна быть от 0,2 до 60 секунд.");
    if (!Number.isFinite(scare.volume) || scare.volume < 0 || scare.volume > 1) throw new Error("Громкость должна быть от 0 до 100%.");
    chain.push(scare);
    for (const nextId of scare.nextIds) visit(nextId);
    active.delete(id);
  };
  if (id) visit(id);
  if (!chain.length) throw new Error("Выберите скример.");
  return chain;
}

export function fingerprint(chain) {
  return JSON.stringify(chain.map(({id, name, mode, animation, image, sound, duration, volume, advance, nextIds}) =>
    ({id, name, mode, animation, image, sound, duration, volume, advance, nextIds})));
}

export function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
}
