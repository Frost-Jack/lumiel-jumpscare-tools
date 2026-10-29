if (!game.user.isGM) return ui.notifications.warn("Панель скримеров доступна только ГМу.");
const api = game.modules.get("lumiel-jumpscare-tools")?.api;
if (!api) return ui.notifications.warn("Включите модуль Lumiel Jumpscare Tools.");
api.openPanel();
