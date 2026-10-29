import {ID, FOXY_PRESETS, FOXY_ID, isFoxy, ANIMATIONS, buildChain, normalizeScare, escapeHTML as e} from "./core.js";
import {reports, statusFor, readyFor, preload, launch, preview, stopAll} from "./runtime.js";

const {ApplicationV2} = foundry.applications.api;
const labels = {idle: "Не загружен", loading: "Загрузка…", ready: "Готов", disabled: "Отключены", error: "Ошибка"};

export class ScarePanel extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    id: "lumiel-jumpscare-panel", classes: ["ljs-panel"],
    window: {title: "Lumiel · Скримеры", icon: "fa-solid fa-ghost", resizable: true},
    position: {width: 840, height: 760}
  };

  constructor(options = {}) {
    super(options);
    this.catalog = foundry.utils.deepClone(game.settings.get(ID, "scares")).map(normalizeScare);
    this.selected = this.catalog[0]?.id ?? FOXY_ID;
    this.foxyTargets = foundry.utils.deepClone(game.settings.get(ID, "foxyTargets"));
    this.listener = () => this.updateStatus();
  }

  _canRender() { return game.user.isGM; }
  get current() {
    const saved = this.catalog.find(s => s.id === this.selected);
    const preset = FOXY_PRESETS.find(s => s.id === this.selected);
    return preset ? {...preset, nextIds: saved?.nextIds ?? []} : saved;
  }
  get editable() {
    let item = this.catalog.find(s => s.id === this.selected);
    if (!item && isFoxy(this.selected)) {
      item = {id: this.selected, nextIds: []};
      this.catalog.push(item);
    }
    return item;
  }
  get targets() { return isFoxy(this.selected) ? this.foxyTargets[this.selected] ?? [] : this.current?.targetIds ?? []; }

  async _renderHTML() {
    const s = this.current;
    const fixed = isFoxy(s.id);
    const root = document.createElement("div");
    root.className = "ljs-layout";
    root.innerHTML = `
      <aside class="ljs-library">
        <button type="button" data-cmd="add"><i class="fa-solid fa-plus"></i> Новый скример</button>
        <nav aria-label="Скримеры">${[...this.catalog.filter(s => !isFoxy(s.id)), ...FOXY_PRESETS].map(item => `
          <button type="button" data-select="${e(item.id)}" class="${item.id === s.id ? "selected" : ""}">
            <i class="fa-solid ${isFoxy(item.id) ? "fa-film" : "fa-image"}"></i><span>${e(item.name)}</span>
          </button>`).join("")}</nav>
        <label class="ljs-check"><input type="checkbox" data-foxy ${game.settings.get(ID, "foxyEnabled") ? "checked" : ""}> Включить Фокси</label>
      </aside>
      <section class="ljs-editor">
        <div class="ljs-fields">
          ${fixed ? `<h3>${e(s.name)}</h3>` : `
            <label>Название<input type="text" data-field="name" value="${e(s.name)}" maxlength="100"></label>
            <label>Изображение / видео<div class="ljs-file"><input type="text" data-field="image" value="${e(s.image)}" placeholder="Путь к файлу"><button type="button" data-cmd="image"><i class="fa-solid fa-image"></i> Загрузить</button></div></label>
            <label>Звук<div class="ljs-file"><input type="text" data-field="sound" value="${e(s.sound)}" placeholder="Без звука"><button type="button" data-cmd="sound"><i class="fa-solid fa-volume-high"></i> Загрузить</button></div></label>
            <div class="ljs-pair"><label>Показ<select data-field="mode"><option value="image" ${s.mode === "image" ? "selected" : ""}>Окно</option><option value="popup" ${s.mode === "popup" ? "selected" : ""}>Скример</option></select></label>
              <label>Длительность, сек.<input type="number" data-field="duration" min="0.2" max="60" step="0.1" value="${s.duration}" ${s.mode === "image" && s.advance !== "timer" ? "disabled" : ""}></label></div>
            <div class="ljs-pair"><label>Анимация<select data-field="animation" ${s.mode === "image" ? "disabled" : ""}>${Object.entries(ANIMATIONS).map(([key, label]) => `<option value="${key}" ${(s.animation ?? "lunge") === key ? "selected" : ""}>${label}</option>`).join("")}</select></label><label>Громкость, %<input type="number" data-field="volume" min="0" max="100" step="1" value="${Math.round(s.volume * 100)}"></label></div>
            <label>Завершение<select data-field="advance"><option value="close" ${s.advance === "close" ? "selected" : ""}>По крестику</option><option value="timer" ${s.advance === "timer" ? "selected" : ""}>По таймеру или крестику</option></select></label>
            `}
          <fieldset class="ljs-sequence"><legend>Следом по очереди</legend>
            ${s.nextIds.map((id, index) => `<div class="ljs-sequence-row">
              <select data-next="${index}" aria-label="Следующий скример ${index + 1}"><option value="">Выберите скример</option>${[...this.catalog.filter(item => !isFoxy(item.id)), ...FOXY_PRESETS].filter(item => item.id !== s.id).map(item => `<option value="${e(item.id)}" ${id === item.id ? "selected" : ""}>${e(item.name)}</option>`).join("")}</select>
              <button type="button" data-cmd="up:${index}" title="Выше" aria-label="Выше" ${index === 0 ? "disabled" : ""}><i class="fa-solid fa-chevron-up"></i></button>
              <button type="button" data-cmd="down:${index}" title="Ниже" aria-label="Ниже" ${index === s.nextIds.length - 1 ? "disabled" : ""}><i class="fa-solid fa-chevron-down"></i></button>
              <button type="button" data-cmd="remove:${index}" title="Убрать" aria-label="Убрать">×</button>
            </div>`).join("")}
            <button type="button" data-cmd="append"><i class="fa-solid fa-plus"></i> Добавить следующий</button>
          </fieldset>
          <fieldset class="ljs-players"><legend>Кому показать</legend>
            <div class="ljs-player-actions"><button type="button" data-cmd="all">Все онлайн</button><button type="button" data-cmd="none">Никому</button></div>
            ${game.users.filter(u => !u.isGM).map(u => `<label class="ljs-user"><input type="checkbox" data-user="${e(u.id)}" ${this.targets.includes(u.id) ? "checked" : ""} ${u.active ? "" : "disabled"}><span>${e(u.name)}${u.active ? "" : " (не в сети)"}</span><span class="ljs-status" data-status="${e(u.id)}"></span></label>`).join("") || `<p class="hint">В мире пока нет игроков.</p>`}
          </fieldset>
          <p class="ljs-feedback" role="status"></p>
        </div>
        <footer class="ljs-actions">
          <button type="button" data-cmd="save"><i class="fa-solid fa-floppy-disk"></i> Сохранить</button>
          <button type="button" data-cmd="delete" ${fixed ? "disabled" : ""} title="Удалить скример"><i class="fa-solid fa-trash"></i></button>
          <button type="button" data-cmd="preview"><i class="fa-solid fa-eye"></i> Только мне</button>
          <button type="button" data-cmd="preload" title="Загрузить цепочку всем игрокам"><i class="fa-solid fa-download"></i> Предзагрузка</button>
          <button type="button" data-cmd="launch" class="ljs-launch"><i class="fa-solid fa-play"></i> Запустить</button>
          <button type="button" data-cmd="stop" class="ljs-stop"><i class="fa-solid fa-stop"></i> Остановить у всех</button>
        </footer>
      </section>`;
    root.addEventListener("input", event => this.onInput(event));
    root.addEventListener("change", event => this.onChange(event));
    root.addEventListener("click", event => {
      const select = event.target.closest("[data-select]");
      if (select) { this.selected = select.dataset.select; void this.render({force: true}); return; }
      const button = event.target.closest("[data-cmd]");
      if (button && !button.disabled) void this.command(button.dataset.cmd);
    });
    return root;
  }

  _replaceHTML(result, content) { content.replaceChildren(result); }
  _onRender() { this.updateStatus(); }
  _onFirstRender() { Hooks.on(`${ID}.status`, this.listener); }
  async close(options) { Hooks.off(`${ID}.status`, this.listener); return super.close(options); }

  onInput(event) {
    const field = event.target.dataset.field;
    if (!field || isFoxy(this.selected)) return;
    let value = event.target.value;
    if (["duration", "volume"].includes(field)) value = Number(value) / (field === "volume" ? 100 : 1);
    this.current[field] = value;
    if (field === "name") {
      const label = this.element.querySelector(`[data-select="${this.selected}"] span`);
      if (label) label.textContent = value;
    }
    if (field === "mode" || field === "advance") {
      this.element.querySelector('[data-field="duration"]').disabled = this.current.mode === "image" && this.current.advance !== "timer";
      this.element.querySelector('[data-field="animation"]').disabled = this.current.mode === "image";
    }
    this.updateStatus();
  }

  onChange(event) {
    if (event.target.hasAttribute("data-next")) {
      this.editable.nextIds[Number(event.target.dataset.next)] = event.target.value;
      this.updateStatus();
    }
    if (event.target.hasAttribute("data-field")) this.onInput(event);
    if (event.target.dataset.user) {
      const selected = [...this.element.querySelectorAll("[data-user]:checked")].map(el => el.dataset.user);
      if (isFoxy(this.selected)) this.foxyTargets[this.selected] = selected;
      else this.current.targetIds = selected;
      this.updateStatus();
    }
    if (event.target.hasAttribute("data-foxy")) {
      void game.settings.set(ID, "foxyEnabled", event.target.checked).then(() => this.render({force: true}));
    }
  }

  async save() {
    if (!game.user.isGM) throw new Error("Панель доступна только ГМу.");
    await game.settings.set(ID, "scares", this.catalog);
    await game.settings.set(ID, "foxyTargets", this.foxyTargets);
  }

  updateStatus() {
    if (!this.element) return;
    const record = reports.get(this.selected);
    for (const label of this.element.querySelectorAll("[data-status]")) {
      const status = statusFor(record, label.dataset.status);
      label.textContent = labels[status.state];
      label.dataset.state = status.state;
      label.title = status.detail;
      const user = game.users.get(label.dataset.status);
      const checkbox = this.element.querySelector(`[data-user="${label.dataset.status}"]`);
      checkbox.disabled = !user?.active;
    }
    let chain, error;
    try {
      chain = buildChain(this.selected, this.catalog);
      if (chain.some(s => isFoxy(s.id)) && !game.settings.get(ID, "foxyEnabled")) error = "Включите Фокси для его запуска.";
    } catch (err) { error = err.message; }
    const targets = this.targets.filter(id => game.users.get(id)?.active);
    const ready = !error && readyFor(this.selected, chain, targets);
    const allDisabled = targets.length && targets.every(id => statusFor(record, id).state === "disabled");
    const button = this.element.querySelector('[data-cmd="launch"]');
    if (button) button.disabled = !ready || !!allDisabled;
    for (const cmd of ["preview", "preload"]) {
      const control = this.element.querySelector(`[data-cmd="${cmd}"]`);
      if (control) control.disabled = !!error;
    }
    const feedback = this.element.querySelector(".ljs-feedback");
    if (feedback) feedback.textContent = error || (!targets.length ? "Выберите игроков." : allDisabled ? "Скримеры отключены." : ready ? "Готово к запуску." : "Выполните предзагрузку.");
  }

  async command(cmd) {
    if (!game.user.isGM) return;
    try {
      if (cmd === "add") {
        const item = {id: foundry.utils.randomID(), name: `Скример ${this.catalog.filter(s => !isFoxy(s.id)).length + 1}`, image: "", sound: "", mode: "popup", animation: "lunge", duration: 2, volume: 0.8, advance: "timer", nextIds: [], targetIds: game.users.filter(u => !u.isGM && u.active).map(u => u.id)};
        this.catalog.push(item);
        this.selected = item.id;
        await this.render({force: true});
      } else if (cmd === "delete" && !isFoxy(this.selected)) {
        if (!await foundry.applications.api.DialogV2.confirm({window: {title: "Удалить скример"}, content: `<p>Удалить «${e(this.current.name)}»?</p>`})) return;
        const id = this.selected;
        this.catalog = this.catalog.filter(s => s.id !== id);
        for (const item of this.catalog) item.nextIds = item.nextIds.filter(next => next !== id);
        this.selected = this.catalog[0]?.id ?? FOXY_ID;
        await this.save();
        await this.render({force: true});
      } else if (cmd === "append" || /^(up|down|remove):\d+$/.test(cmd)) {
        const scrollTop = this.element.querySelector(".ljs-fields").scrollTop;
        const queue = this.editable.nextIds;
        if (cmd === "append") queue.push("");
        else {
          const [action, value] = cmd.split(":");
          const index = Number(value);
          if (action === "remove") queue.splice(index, 1);
          else {
            const to = index + (action === "up" ? -1 : 1);
            [queue[index], queue[to]] = [queue[to], queue[index]];
          }
        }
        await this.render({force: true});
        this.element.querySelector(".ljs-fields").scrollTop = scrollTop;
      } else if (["image", "sound"].includes(cmd) && !isFoxy(this.selected)) {
        const id = this.selected;
        new foundry.applications.apps.FilePicker.implementation({type: cmd === "image" ? "imagevideo" : "audio", current: this.current[cmd], callback: path => {
          const item = this.catalog.find(s => s.id === id);
          if (!item) return;
          item[cmd] = path;
          if (this.selected === id) {
            this.element.querySelector(`[data-field="${cmd}"]`).value = path;
            this.updateStatus();
          }
        }}).render({force: true});
      } else if (cmd === "all" || cmd === "none") {
        const targets = cmd === "all" ? game.users.filter(u => !u.isGM && u.active).map(u => u.id) : [];
        if (isFoxy(this.selected)) this.foxyTargets[this.selected] = targets;
        else this.current.targetIds = targets;
        for (const checkbox of this.element.querySelectorAll("[data-user]")) checkbox.checked = targets.includes(checkbox.dataset.user);
        this.updateStatus();
      } else if (cmd === "stop") stopAll();
      else if (cmd === "save") { await this.save(); ui.notifications.info("Скримеры сохранены."); }
      else if (["preload", "launch", "preview"].includes(cmd)) {
        const chain = buildChain(this.selected, this.catalog);
        if (chain.some(s => isFoxy(s.id)) && !game.settings.get(ID, "foxyEnabled")) throw new Error("Сначала включите Фокси.");
        await this.save();
        if (cmd === "preload") preload(this.selected, this.catalog);
        if (cmd === "preview") await preview(this.selected, this.catalog);
        if (cmd === "launch") ui.notifications.info(`Скример отправлен. Игроков: ${launch(this.selected, this.catalog, this.targets)}.`);
      }
    } catch (error) { ui.notifications.error(error.message); }
  }
}
