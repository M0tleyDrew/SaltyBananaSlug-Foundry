import {DEFAULT_CONFIG, MODULE_ID, TYPES, defaultImages} from "../constants.js";
import {createContainer, dropDataFromEvent, previewJournalImport, resolveDropDocument, stageJournalForCreation, updateContainer} from "../container-service.js";
import {getContainerData, mergeConfig, notifyError, quantityOf} from "../utils.js";
import {chooseContainerPlacement} from "../placement.js";
import {requestGM} from "../socket.js";
import {isLocked} from "../lock.js";

const AppBase = foundry.appv1.api.Application;
const COINS = ["cp","sp","ep","gp","pp"];

export class ContainerWizard extends AppBase {
  constructor(tokenDoc=null, options={}) {
    super(options);
    this.tokenDoc = tokenDoc;
    this.isEdit = Boolean(tokenDoc);
    const existing = tokenDoc ? getContainerData(tokenDoc) : null;
    this.config = mergeConfig(DEFAULT_CONFIG, existing ?? {});
    this.config.name = tokenDoc?.name ?? this.config.name;
    if (tokenDoc && game.user.isGM) {
      const inventoryActor = game.actors.get(existing?.inventoryActorId);
      const savedLock = inventoryActor?.getFlag(MODULE_ID, "private")?.lockConfig;
      this.config.lock = mergeConfig(DEFAULT_CONFIG.lock, savedLock ?? existing?.lock ?? {});
    }
    if (tokenDoc) this.config.state = isLocked(tokenDoc) ? "locked" : (existing?.state === "open" ? "open" : "closed");
    this.config.images = {...defaultImages(this.config.type), ...(this.config.images ?? {})};
    this.config.initialItems ??= [];
    this.activeStep = 0;
    this.steps = game.user.isGM
      ? ["basics","appearance","access","lock","inventory","journal","advanced","summary"]
      : ["basics","appearance","access","inventory","journal","summary"];
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "sbs-container-wizard",
      title: "Container Maker",
      template: `modules/${MODULE_ID}/templates/wizard.html`,
      width: Math.max(420, Math.min(900, window.innerWidth - 60)),
      height: Math.max(420, Math.min(760, window.innerHeight - 80)),
      resizable: true,
      minimizable: true,
      classes: ["sbs-containers","sbs-wizard"],
      scrollY: [".sbs-wizard-scroll"]
    });
  }

  getData() {
    const users = game.users.filter(u => !u.isGM).map(u => ({id:u.id,name:u.name, selected:(this.config.journal?.selectedUserIds??[]).includes(u.id)}));
    const typeOptions = Object.entries(TYPES).map(([id,label]) => ({id,label}));
    const initialItems = (this.config.initialItems ?? []).map((i,idx) => {
      const identified=foundry.utils.getProperty(i,"system.identified");
      return {idx,name:i.name,img:i.img,quantity:Number(foundry.utils.getProperty(i,"system.quantity") ?? 1),identifiable:typeof identified === "boolean",identified:identified !== false};
    });
    return {
      config: this.config,
      users,
      typeOptions,
      initialItems,
      isGM: game.user.isGM,
      isEdit: this.isEdit,
      steps: this.steps.map((id,idx) => ({id, idx, label: stepLabel(id), active:idx===this.activeStep})),
      activeStep: this.steps[this.activeStep],
      logo:`modules/${MODULE_ID}/assets/logo.svg`
    };
  }

  activateListeners(html) {
    super.activateListeners(html);
    const root = html[0] ?? html;
    this._applyCurrentValues(root);
    this._showStep(root);

    root.querySelectorAll("[data-step]").forEach(el => el.addEventListener("click", ev => {
      this._capture(root);
      this.activeStep = Number(ev.currentTarget.dataset.step);
      this._showStep(root);
    }));
    root.querySelector("[data-action='next']")?.addEventListener("click", () => { this._capture(root); this.activeStep=Math.min(this.steps.length-1,this.activeStep+1); this._showStep(root); });
    root.querySelector("[data-action='back']")?.addEventListener("click", () => { this._capture(root); this.activeStep=Math.max(0,this.activeStep-1); this._showStep(root); });
    root.querySelector("[data-action='cancel']")?.addEventListener("click", () => this.close());
    root.querySelector("[data-action='create']")?.addEventListener("click", () => this._submit(root));

    root.querySelector("select[name='type']")?.addEventListener("change", ev => {
      const oldType = this.config.type;
      const oldDefaults = defaultImages(oldType);
      const nextType = ev.target.value;
      this.config.type = nextType;
      const nextDefaults = defaultImages(nextType);
      for (const state of ["closed","open","locked"]) {
        const input = root.querySelector(`[name='image_${state}']`);
        if (!input) continue;
        if (!input.value || input.value === oldDefaults[state] || input.value.includes(`/assets/icons/${oldType}-`)) input.value = nextDefaults[state];
      }
      this._updatePreview(root);
      root.querySelector(".sbs-custom-type")?.classList.toggle("hidden", nextType !== "other");
    });

    root.querySelectorAll("[data-image-state]").forEach(btn => btn.addEventListener("click", ev => this._pickImage(root, ev.currentTarget.dataset.imageState)));
    root.querySelectorAll("input[name^='image_']").forEach(input => input.addEventListener("change", () => this._updatePreview(root)));
    root.querySelectorAll("[data-preview]").forEach(btn => btn.addEventListener("click", ev => this._updatePreview(root, ev.currentTarget.dataset.preview)));

    const drop = root.querySelector(".sbs-wizard-dropzone");
    if (drop) {
      drop.addEventListener("dragover", e => {e.preventDefault(); drop.classList.add("dragover");});
      drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));
      drop.addEventListener("drop", e => this._onItemDrop(e, root));
    }
    root.querySelectorAll("[data-initial-identify]").forEach(btn => btn.addEventListener("click", ev => {
      this._capture(root);
      const idx=Number(ev.currentTarget.dataset.initialIdentify);
      const item=this.config.initialItems?.[idx];
      if(item) foundry.utils.setProperty(item,"system.identified",ev.currentTarget.dataset.identified === "true");
      this.render(true);
    }));
    root.querySelectorAll("[data-remove-initial]").forEach(btn => btn.addEventListener("click", ev => {
      this._capture(root);
      this.config.initialItems.splice(Number(ev.currentTarget.dataset.removeInitial),1);
      this.render(true);
    }));
  }

  _applyCurrentValues(root) {
    const c = this.config;
    set(root,"name",c.name); set(root,"type",c.type); set(root,"customType",c.customType); set(root,"description",c.description);
    set(root,"image_closed",c.images.closed); set(root,"image_open",c.images.open); set(root,"image_locked",c.images.locked);
    set(root,"state",c.state); set(root,"distance",c.distance);
    set(root,"perm_open",c.permissions.open); set(root,"perm_close",c.permissions.close); set(root,"perm_inspect",c.permissions.inspect); set(root,"perm_deposit",c.permissions.deposit); set(root,"perm_withdraw",c.permissions.withdraw);
    check(root,"lock_enabled",c.lock.enabled); check(root,"lock_createKey",c.lock.createKey); check(root,"lock_lockOnClose",c.lock.lockOnClose);
    set(root,"lock_keyId",c.lock.keyId); set(root,"lock_keyName",c.lock.keyName); set(root,"lock_password",c.lock.password); set(root,"lock_pickDC",c.lock.pickDC); set(root,"lock_breakDC",c.lock.breakDC); set(root,"lock_attempts",c.lock.attempts); set(root,"lock_successes",c.lock.requiredSuccesses); set(root,"lock_special",c.lock.specialLockpick);
    for (const coin of ["cp","sp","ep","gp","pp"]) set(root,`currency_${coin}`,c.currency?.[coin]??0);
    set(root,"journal_visibility",c.journal.visibility); check(root,"journal_snapshot",c.journal.originalSnapshot); check(root,"journal_log",c.journal.transactionLog);
    set(root,"capacity_mode",c.capacity.mode); set(root,"capacity_items",c.capacity.maxItems); set(root,"capacity_weight",c.capacity.maxWeight); set(root,"emptyBehavior",c.emptyBehavior);
    root.querySelector(".sbs-custom-type")?.classList.toggle("hidden", c.type !== "other");
    this._updatePreview(root,"closed");
  }

  _capture(root) {
    const val = n => root.querySelector(`[name='${n}']`)?.value;
    const bool = n => Boolean(root.querySelector(`[name='${n}']`)?.checked);
    this.config.name = (val("name") || "Container").trim();
    this.config.type = val("type") || "chest";
    this.config.customType = val("customType") || "";
    this.config.description = val("description") || "";
    this.config.images = {closed:val("image_closed")||defaultImages(this.config.type).closed, open:val("image_open")||defaultImages(this.config.type).open, locked:val("image_locked")||defaultImages(this.config.type).locked};
    this.config.state = val("state") || "closed";
    this.config.distance = Math.max(0, Number(val("distance"))||0);
    this.config.permissions = {...this.config.permissions, open:val("perm_open")||"all", close:val("perm_close")||"all", inspect:val("perm_inspect")||"open", deposit:val("perm_deposit")||"all", withdraw:val("perm_withdraw")||"all"};
    this.config.lock = {...this.config.lock, enabled:bool("lock_enabled") || this.config.state === "locked", startLocked:this.config.state === "locked", createKey:bool("lock_createKey"), lockOnClose:bool("lock_lockOnClose"), keyId:val("lock_keyId")||"", keyName:val("lock_keyName")||"", password:val("lock_password")||"", pickDC:Number(val("lock_pickDC"))||15, breakDC:Number(val("lock_breakDC"))||20, attempts:Number(val("lock_attempts")??-1), requiredSuccesses:Math.max(1,Number(val("lock_successes"))||1), specialLockpick:val("lock_special")||""};
    this.config.currency ??= {};
    for (const coin of ["cp","sp","ep","gp","pp"]) this.config.currency[coin] = Math.max(0,Number(val(`currency_${coin}`))||0);
    this.config.journal = {...this.config.journal, visibility:val("journal_visibility")||"gm", originalSnapshot:bool("journal_snapshot"), transactionLog:bool("journal_log"), selectedUserIds:[...root.querySelectorAll("[name='journal_users']:checked")].map(x=>x.value)};
    this.config.permissions.selectedUserIds = [...this.config.journal.selectedUserIds];
    this.config.capacity = {...this.config.capacity, mode:val("capacity_mode")||"unlimited", maxItems:Math.max(0,Number(val("capacity_items"))||0), maxWeight:Math.max(0,Number(val("capacity_weight"))||0)};
    this.config.emptyBehavior = val("emptyBehavior")||"stay";
  }

  _showStep(root) {
    root.querySelectorAll(".sbs-step-panel").forEach(p => p.classList.toggle("active", p.dataset.panel === this.steps[this.activeStep]));
    root.querySelectorAll(".sbs-step-tab").forEach(t => t.classList.toggle("active", Number(t.dataset.step)===this.activeStep));
    const back = root.querySelector("[data-action='back']"); const next = root.querySelector("[data-action='next']"); const create = root.querySelector("[data-action='create']");
    if (back) back.disabled = this.activeStep===0;
    if (next) next.classList.toggle("hidden", this.activeStep===this.steps.length-1);
    if (create) create.classList.toggle("hidden", this.activeStep!==this.steps.length-1);
    root.querySelector(".sbs-wizard-scroll")?.scrollTo({top:0});
    this._refreshSummary(root);
  }

  _refreshSummary(root) {
    const box = root.querySelector(".sbs-summary-live"); if (!box) return;
    const c=this.config; const scene=canvas.scene?.name ?? "No Scene";
    box.innerHTML = `<h3>${foundry.utils.escapeHTML(c.name)}</h3><p><strong>Scene:</strong> ${foundry.utils.escapeHTML(scene)}<br><strong>Type:</strong> ${foundry.utils.escapeHTML(c.type==="other"?(c.customType||"Other"):TYPES[c.type])}<br><strong>Starting state:</strong> ${c.state}<br><strong>Items staged:</strong> ${(c.initialItems??[]).length}<br><strong>Journal:</strong> ${c.journal.visibility === "gm" ? "GM only" : c.journal.visibility}<br><strong>Lock & Key:</strong> ${c.lock.enabled ? "Enabled" : "Not lockable"}</p><p><strong>Placement:</strong> after you finish the wizard, move the container preview over the scene and click where you want it placed. Esc or right-click cancels without creating anything.</p>`;
  }

  _updatePreview(root,state="closed") {
    const img = root.querySelector(".sbs-art-preview img"); if (!img) return;
    const input = root.querySelector(`[name='image_${state}']`);
    img.src = input?.value || defaultImages(this.config.type)[state];
    root.querySelector(".sbs-art-preview-label").textContent = state[0].toUpperCase()+state.slice(1);
  }

  async _pickImage(root,state) {
    const input = root.querySelector(`[name='image_${state}']`); if (!input) return;
    const Picker = globalThis.FilePicker ?? foundry.applications.apps.FilePicker;
    try {
      const picker = new Picker({type:"image", current:input.value, callback:path=>{input.value=path; this._updatePreview(root,state);}});
      if (picker.browse) await picker.browse();
      else picker.render?.({force:true});
    } catch (err) { notifyError(err,"Could not open image picker"); }
  }

  async _onItemDrop(event, root) {
    event.preventDefault(); event.stopPropagation(); event.currentTarget.classList.remove("dragover");
    this._capture(root);
    try {
      const data = dropDataFromEvent(event);
      if (!data) throw new Error("Foundry did not provide readable drag data for that drop.");
      const doc = await resolveDropDocument(data);
      if (!doc) throw new Error("Could not resolve that Foundry document.");

      if (["JournalEntry","JournalEntryPage"].includes(doc.documentName)) {
        if (!game.user.isGM) throw new Error("Only the GM can stage a Journal's loot during container creation.");
        await this._confirmJournalStage(doc);
        return;
      }

      if (doc.documentName !== "Item") throw new Error("Drop a Foundry Item, Journal Entry, or Journal Page here.");
      const item = doc;
      if (!game.user.isGM && item.parent && item.parent.documentName === "Actor" && !item.parent.testUserPermission(game.user, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER)) throw new Error("You can only stage items from an Actor you own.");
      const clone = item.toObject(); delete clone._id;
      this.config.initialItems.push(clone);
      this.render(true);
    } catch (err) { notifyError(err,"Could not add dropped loot"); }
  }

  async _confirmJournalStage(journalDoc) {
    const plan = await previewJournalImport(journalDoc, game.user);
    const hasItems = Boolean(plan.items?.length);
    const hasCurrency = Object.values(plan.currency ?? {}).some(v => Number(v) > 0);
    if (!hasItems && !hasCurrency) throw new Error("No importable linked Items or currency were found in that Journal.");

    const itemRows = (plan.items ?? []).map(i =>
      `<tr><td><img src="${foundry.utils.escapeHTML(i.img ?? "icons/svg/item-bag.svg")}" width="28" height="28"></td><td>${foundry.utils.escapeHTML(i.name)}</td><td>× ${Number(i.quantity) || 1}</td></tr>`
    ).join("") || `<tr><td colspan="3"><em>No linked Items found.</em></td></tr>`;
    const money = COINS.filter(c => Number(plan.currency?.[c]) > 0)
      .map(c => `${Number(plan.currency[c])} ${c}`).join(", ") || "None";
    const skipped = (plan.skipped ?? []).length
      ? `<details><summary>Skipped links (${plan.skipped.length})</summary><ul>${plan.skipped.map(x => `<li>${foundry.utils.escapeHTML(x.name || x.uuid || "Unknown")}: ${foundry.utils.escapeHTML(x.reason || "Could not import")}</li>`).join("")}</ul></details>`
      : "";
    const pageText = plan.pageName ? ` / ${foundry.utils.escapeHTML(plan.pageName)}` : "";

    const content = `<div class="sbs-dialog-scroll sbs-journal-import-dialog">
      <p>Add the loot represented by <strong>${foundry.utils.escapeHTML(plan.journalName)}${pageText}</strong> to this container's <strong>starting inventory</strong>?</p>
      <table><thead><tr><th></th><th>Item</th><th>Qty</th></tr></thead><tbody>${itemRows}</tbody></table>
      <p><strong>Currency found:</strong> ${foundry.utils.escapeHTML(money)}</p>
      ${skipped}
      <p><small>The source Journal is not changed or deleted. Nothing is created in the world until you later place the container.</small></p>
    </div>`;

    new Dialog({
      title:"Stage Journal Loot",
      content,
      buttons:{
        cancel:{icon:'<i class="fas fa-times"></i>',label:"Cancel"},
        stage:{icon:'<i class="fas fa-book-arrow-right"></i>',label:"Add to Starting Inventory",callback:()=>this._executeJournalStage(journalDoc)}
      },
      default:"stage"
    }, {
      width:Math.max(500,Math.min(720,window.innerWidth-80)),
      height:"auto",
      resizable:true,
      classes:["sbs-containers","sbs-dialog"]
    }).render(true);
  }

  async _executeJournalStage(journalDoc) {
    try {
      const staged = await stageJournalForCreation(journalDoc, game.user);
      this.config.initialItems ??= [];
      this.config.initialItems.push(...staged.items);
      this.config.currency ??= {cp:0,sp:0,ep:0,gp:0,pp:0};
      for (const coin of COINS) {
        this.config.currency[coin] = Math.max(0, Number(this.config.currency[coin] ?? 0)) + Math.max(0, Number(staged.currency?.[coin] ?? 0));
      }
      const itemQty = staged.items.reduce((sum,item)=>sum + Math.max(1, Number(foundry.utils.getProperty(item,"system.quantity") ?? 1)), 0);
      const coinText = COINS.filter(c=>Number(staged.currency?.[c])>0).map(c=>`${staged.currency[c]} ${c}`).join(", ");
      ui.notifications.info(`Staged ${[itemQty ? `${itemQty} item${itemQty===1?"":"s"}` : "", coinText].filter(Boolean).join(" and ")} from ${staged.journalName}.`);
      this.render(true);
    } catch (err) { notifyError(err,"Could not stage Journal loot"); }
  }

  async _submit(root) {
    this._capture(root);
    if (!this.config.name.trim()) return ui.notifications.warn("Give the container a name.");
    if (game.user.isGM && this.config.lock?.createKey && !String(this.config.lock?.keyName ?? "").trim()) return ui.notifications.warn("Enter the exact Key Item Name before creating a matching key.");
    try {
      if (this.isEdit) {
        await updateContainer(this.tokenDoc, this.config);
        ui.notifications.info("Container updated.");
        await this.close();
        return;
      }

      const placementConfig = foundry.utils.deepClone(this.config);
      await this.close();
      const placement = await chooseContainerPlacement({
        name: placementConfig.name,
        image: placementConfig.state === "open" ? placementConfig.images.open : (placementConfig.state === "locked" ? placementConfig.images.locked : placementConfig.images.closed)
      });
      if (!placement) return;

      if (game.user.isGM) {
        const scene = game.scenes.get(placement.sceneId);
        await createContainer(placementConfig, {scene, x:placement.x, y:placement.y});
      } else {
        await requestGM("create", {sceneId:placement.sceneId, x:placement.x, y:placement.y, config:placementConfig});
      }
      ui.notifications.info(`${placementConfig.name} created.`);
    } catch (err) { notifyError(err, this.isEdit ? "Could not update container" : "Could not create container"); }
  }
}

function stepLabel(id) { return ({basics:"Basics",appearance:"Appearance",access:"Access",lock:"Lock & Key",inventory:"Inventory",journal:"Journal",advanced:"Advanced",summary:"Create"})[id] ?? id; }
function set(root,name,value){const e=root.querySelector(`[name='${name}']`);if(e)e.value=value??"";}
function check(root,name,value){const e=root.querySelector(`[name='${name}']`);if(e)e.checked=Boolean(value);}
