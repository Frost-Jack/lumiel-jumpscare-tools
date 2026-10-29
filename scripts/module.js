import {ID, FOXY_ID, isFoxy, normalizeFoxyId, normalizeScare} from "./core.js";
import {ScarePanel} from "./panel.js";
import {installSocket, preferenceChanged, connectionChanged, preload, launch, stopAll, preview} from "./runtime.js";

let panel;
function openPanel() {
  if (!game.user.isGM) return ui.notifications.warn("Панель скримеров доступна только ГМу.");
  panel ??= new ScarePanel();
  if (!panel.rendered) {
    panel.catalog = foundry.utils.deepClone(game.settings.get(ID, "scares")).map(normalizeScare);
    panel.foxyTargets = foundry.utils.deepClone(game.settings.get(ID, "foxyTargets"));
    if (!isFoxy(panel.selected) && !panel.catalog.some(s => s.id === panel.selected)) panel.selected = panel.catalog[0]?.id ?? "builtin-foxy";
  }
  return panel.render({force: true});
}

Hooks.once("init", () => {
  game.settings.register(ID, "scares", {scope: "world", config: false, type: Array, default: []});
  game.settings.register(ID, "foxyTargets", {scope: "world", config: false, type: Object, default: {}});
  game.settings.register(ID, "foxyEnabled", {name: "Встроенные скримеры Фокси", scope: "world", config: true, type: Boolean, default: false});
  game.settings.register(ID, "enabled", {
    name: "Показывать мне скримеры", hint: "Показ и звук всех скримеров.",
    scope: "client", config: true, type: Boolean, default: true, onChange: preferenceChanged
  });
  game.settings.registerMenu(ID, "panel", {name: "Панель скримеров", label: "Открыть панель", icon: "fa-solid fa-ghost", type: ScarePanel, restricted: true});
  game.modules.get(ID).api = Object.freeze({
    openPanel,
    preload: id => preload(id, game.settings.get(ID, "scares")),
    launch: (id, targets) => launch(id, game.settings.get(ID, "scares"), targets),
    preview: id => preview(id, game.settings.get(ID, "scares")), stopAll
  });
});

Hooks.once("ready", async () => {
  installSocket();
  if (game.users.activeGM?.id !== game.user.id) return;
  const targets = game.settings.get(ID, "foxyTargets");
  const obsolete = Object.keys(targets).filter(id => normalizeFoxyId(id) !== id);
  if (obsolete.length) {
    const migrated = {...targets, [FOXY_ID]: [...new Set([...(targets[FOXY_ID] ?? []), ...obsolete.flatMap(id => targets[id])])]};
    for (const id of obsolete) delete migrated[id];
    await game.settings.set(ID, "foxyTargets", migrated);
  }
  const catalog = game.settings.get(ID, "scares");
  if (catalog.some(s => Object.hasOwn(s, "nextId"))) {
    await game.settings.set(ID, "scares", catalog.map(normalizeScare));
  }
  if (game.macros.some(m => m.getFlag(ID, "panelMacro"))) return;
  try {
    await Macro.create({
      name: "Lumiel · Скримеры", type: "script", img: "icons/svg/terror.svg",
      command: `if (!game.user.isGM) return ui.notifications.warn("Только для ГМа.");\ngame.modules.get("${ID}")?.api.openPanel();`,
      ownership: {default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE}, flags: {[ID]: {panelMacro: true}}
    });
  } catch (error) { ui.notifications.warn(`Не удалось создать макрос скримеров: ${error.message}. Панель доступна в настройках модуля.`); }
});

Hooks.on("userConnected", user => connectionChanged(user));
