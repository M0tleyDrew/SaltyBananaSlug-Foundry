const MODULE_ID = "saltybananaslugs-environment";
const MODULE_TITLE = "SaltyBananaSlug's Environment";
const REPO_OWNER = "M0tleyDrew";
const REPO_NAME = "SaltyBananaSlug-Foundry";
const REPO_FULL = `${REPO_OWNER}/${REPO_NAME}`;
const MAIN_BRANCH = "main";
const CATALOG_BRANCH = "environment-catalog";
const REPO_URL = `https://github.com/${REPO_FULL}`;
const GITHUB_API = `https://api.github.com/repos/${REPO_FULL}`;
const RAW_MAIN = `https://raw.githubusercontent.com/${REPO_FULL}/${MAIN_BRANCH}`;
const RAW_CATALOG = `https://raw.githubusercontent.com/${REPO_FULL}/${CATALOG_BRANCH}`;
const CATALOG_URL = `${RAW_CATALOG}/catalog.json`;
const CATALOG_BRANCH_URL = `https://github.com/${REPO_FULL}/tree/${CATALOG_BRANCH}`;
const LOGO = `modules/${MODULE_ID}/assets/sbs-logo.svg`;
const CATALOG_SCHEMA = 1;

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const AppBase = HandlebarsApplicationMixin(ApplicationV2);
const clone = value => foundry.utils.deepClone(value);
const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;","\"":"&quot;"}[c]));

function isSbsModule(module) {
  const id = String(module?.id || "").toLowerCase();
  const title = String(module?.title || "").toLowerCase();
  return id.includes("saltybananaslug") || title.includes("saltybananaslug") || ["party-viewer", "message-cantrip", "saltybananaslugs-message-cantrip"].includes(id);
}

function canonicalPackageKey(value) {
  let s = String(value ?? "").trim().toLowerCase().replace(/[’']/g, "");
  s = s.replace(/^salty[\s_-]*banana[\s_-]*slugs?[\s_-]*/, "");
  s = s.replace(/^sbs[\s_-]*/, "");
  return s.replace(/[^a-z0-9]+/g, "");
}

function findLocalModule(item) {
  if (!item) return null;
  const exact = game.modules.get(item.id);
  if (exact) return exact;
  const wantedId = canonicalPackageKey(item.id);
  const wantedTitle = canonicalPackageKey(item.title);
  for (const local of game.modules.values()) {
    const localId = canonicalPackageKey(local.id);
    const localTitle = canonicalPackageKey(local.title);
    if ((wantedId && localId === wantedId) || (wantedTitle && localTitle === wantedTitle)) return local;
  }
  return null;
}

function newer(remote, local) {
  if (!remote || !local || remote === local) return false;
  try { return foundry.utils.isNewerVersion(remote, local); }
  catch (_err) {
    const p = v => String(v).split(/[.-]/).map(x => /^\d+$/.test(x) ? Number(x) : x);
    const a = p(remote), b = p(local);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] ?? 0, y = b[i] ?? 0;
      if (x === y) continue;
      if (typeof x === "number" && typeof y === "number") return x > y;
      return String(x) > String(y);
    }
    return false;
  }
}

async function copyText(text) {
  try { await navigator.clipboard.writeText(String(text)); return true; }
  catch (_err) {
    const ta = document.createElement("textarea");
    ta.value = String(text);
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

function decodeGithubContent(value) {
  const clean = String(value || "").replace(/\s+/g, "");
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodePathPart(value) {
  return encodeURIComponent(String(value || "")).replace(/%2F/gi, "/");
}

class CatalogService {
  static catalog = null;
  static lastChecked = null;
  static lastError = "";
  static note = "";
  static source = "local";

  static _loadCache() {
    try {
      const raw = String(game.settings.get(MODULE_ID, "catalogCache") || "").trim();
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.provider !== "github" || Number(parsed?.catalogSchema || 0) < CATALOG_SCHEMA) return null;
      return parsed?.ok && Array.isArray(parsed.modules) ? parsed : null;
    } catch (_err) { return null; }
  }

  static async _saveCache(catalog) {
    try { await game.settings.set(MODULE_ID, "catalogCache", JSON.stringify(catalog)); }
    catch (err) { console.warn(`${MODULE_TITLE} | could not cache GitHub catalog`, err); }
  }

  static _localFallback() {
    const modules = [...game.modules.values()]
      .filter(m => isSbsModule(m))
      .map(m => ({
        type: "module",
        id: m.id,
        title: m.title,
        description: m.description || "",
        version: m.version || "",
        folderUrl: "",
        manifestUrl: "",
        downloadUrl: "",
        distributionReady: false,
        localOnly: true
      }))
      .sort((a, b) => String(a.title).localeCompare(String(b.title)));
    return {
      ok: true,
      provider: "local",
      catalogSchema: CATALOG_SCHEMA,
      generatedAt: null,
      repositoryUrl: REPO_URL,
      modules,
      macros: [],
      fallback: true
    };
  }

  static current() {
    if (this.catalog) return clone(this.catalog);
    const cached = this._loadCache();
    if (cached) {
      this.catalog = cached;
      this.source = "cache";
      if (cached.generatedAt) {
        const d = new Date(cached.generatedAt);
        if (!Number.isNaN(d.getTime())) this.lastChecked = d;
      }
      return clone(this.catalog);
    }
    this.catalog = this._localFallback();
    this.source = "local";
    return clone(this.catalog);
  }

  static async get({ force = false } = {}) {
    if (force) return this.refresh();
    if (this.catalog && this.source !== "local") return clone(this.catalog);
    const cached = this._loadCache();
    if (cached) {
      this.catalog = cached;
      this.source = "cache";
      return clone(this.catalog);
    }
    return this.refresh();
  }

  static async _fetchJson(url) {
    const separator = url.includes("?") ? "&" : "?";
    const response = await fetch(`${url}${separator}_sbs=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: { "Accept": "application/vnd.github+json, application/json" }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    return response.json();
  }

  static async _fetchText(url) {
    const separator = url.includes("?") ? "&" : "?";
    const response = await fetch(`${url}${separator}_sbs=${Date.now()}`, { method: "GET", cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    return response.text();
  }

  static _normalizeCatalog(catalog, { distributionReady = false } = {}) {
    if (!catalog?.ok) throw new Error(catalog?.error || "GitHub catalog returned an error.");
    if (!Array.isArray(catalog.modules)) throw new Error("GitHub catalog did not contain a modules list.");
    const normalized = clone(catalog);
    normalized.provider = "github";
    normalized.catalogSchema = Number(normalized.catalogSchema || CATALOG_SCHEMA);
    normalized.repositoryUrl ||= REPO_URL;
    normalized.modules = (normalized.modules || []).map(item => ({
      ...item,
      type: "module",
      distributionReady: item.distributionReady ?? distributionReady,
      folderUrl: item.folderUrl || (item.folderName ? `${REPO_URL}/tree/${MAIN_BRANCH}/${encodePathPart(item.folderName)}` : ""),
      manifestUrl: item.manifestUrl || "",
      downloadUrl: item.downloadUrl || ""
    }));
    normalized.macros = (normalized.macros || []).map(item => ({ ...item, type: "macro" }));
    return normalized;
  }

  static async _fetchPublishedCatalog() {
    const catalog = await this._fetchJson(CATALOG_URL);
    return this._normalizeCatalog(catalog, { distributionReady: true });
  }

  static async _scanRepository() {
    const root = await this._fetchJson(`${GITHUB_API}/contents/?ref=${encodeURIComponent(MAIN_BRANCH)}`);
    if (!Array.isArray(root)) throw new Error("GitHub repository root response was not a file list.");

    const directories = root.filter(item => item?.type === "dir" && !String(item.name || "").startsWith("."));
    const manifestResults = await Promise.all(directories.map(async dir => {
      const path = `${encodePathPart(dir.name)}/module.json`;
      try {
        const meta = await this._fetchJson(`${GITHUB_API}/contents/${path}?ref=${encodeURIComponent(MAIN_BRANCH)}`);
        if (!meta?.content) return null;
        const manifest = JSON.parse(decodeGithubContent(meta.content));
        if (!manifest?.id) return null;
        const id = String(manifest.id);
        const version = String(manifest.version || "0.0.0");
        return {
          type: "module",
          id,
          title: String(manifest.title || id),
          description: String(manifest.description || ""),
          version,
          folderName: dir.name,
          folderUrl: dir.html_url || `${REPO_URL}/tree/${MAIN_BRANCH}/${encodePathPart(dir.name)}`,
          sourceManifestUrl: meta.download_url || `${RAW_MAIN}/${encodePathPart(dir.name)}/module.json`,
          manifestUrl: `${RAW_CATALOG}/manifests/${encodePathPart(id)}.json`,
          downloadUrl: `${RAW_CATALOG}/packages/${encodePathPart(id)}-v${encodePathPart(version)}.zip`,
          compatibility: manifest.compatibility || {},
          relationships: manifest.relationships || {},
          distributionReady: false
        };
      } catch (err) {
        if (/HTTP 404\b/.test(String(err?.message || err))) return null;
        console.warn(`${MODULE_TITLE} | could not inspect ${dir.name}/module.json`, err);
        return null;
      }
    }));

    const macroFiles = root.filter(item => item?.type === "file" && /\.json$/i.test(String(item.name || "")) && item.name !== "catalog.json");
    const macros = (await Promise.all(macroFiles.map(async file => {
      try {
        const text = await this._fetchText(file.download_url || `${RAW_MAIN}/${encodePathPart(file.name)}`);
        const raw = JSON.parse(text);
        if (!raw || typeof raw !== "object" || !String(raw.command || "").trim()) return null;
        const macroData = {
          name: String(raw.name || String(file.name || "").replace(/\.json$/i, "")),
          type: ["script", "chat"].includes(raw.type) ? raw.type : "script",
          scope: ["global", "actors", "token"].includes(raw.scope) ? raw.scope : "global",
          command: String(raw.command || ""),
          img: String(raw.img || "icons/svg/dice-target.svg")
        };
        const bytes = new TextEncoder().encode(text);
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
        return {
          type: "macro",
          id: file.path || file.name,
          title: macroData.name,
          fileName: file.name,
          sourcePath: file.path || file.name,
          fileUrl: file.html_url || `${REPO_URL}/blob/${MAIN_BRANCH}/${encodePathPart(file.name)}`,
          rawUrl: file.download_url || `${RAW_MAIN}/${encodePathPart(file.name)}`,
          hash,
          macroData
        };
      } catch (err) {
        console.warn(`${MODULE_TITLE} | skipped root JSON ${file.name}`, err);
        return null;
      }
    }))).filter(Boolean);

    return this._normalizeCatalog({
      ok: true,
      provider: "github",
      catalogSchema: CATALOG_SCHEMA,
      catalogMode: "scan",
      generatedAt: new Date().toISOString(),
      repositoryUrl: REPO_URL,
      modules: manifestResults.filter(Boolean).sort((a, b) => String(a.title).localeCompare(String(b.title))),
      macros: macros.sort((a, b) => String(a.title).localeCompare(String(b.title)))
    });
  }

  static async refresh() {
    this.lastError = "";
    this.note = "";
    this.lastChecked = new Date();

    try {
      const published = await this._fetchPublishedCatalog();
      this.catalog = published;
      this.source = "published";
      await this._saveCache(published);
      return clone(this.catalog);
    } catch (publishedError) {
      console.warn(`${MODULE_TITLE} | published catalog unavailable, scanning main`, publishedError);
      try {
        const scanned = await this._scanRepository();
        this.catalog = scanned;
        this.source = "scan";
        this.note = "The generated package catalog is not available yet, so Environment is scanning the GitHub repository directly. Discovery works, but install/update manifest links may not be ready until the catalog workflow finishes.";
        await this._saveCache(scanned);
        return clone(this.catalog);
      } catch (scanError) {
        console.error(`${MODULE_TITLE} | GitHub catalog refresh failed`, scanError);
        this.lastError = `Published catalog: ${publishedError?.message || publishedError}. Repository scan: ${scanError?.message || scanError}.`;
        const cached = this._loadCache();
        if (cached) {
          this.catalog = cached;
          this.source = "cache";
          this.note = "GitHub could not be reached; showing the last successful cached catalog.";
        } else {
          this.catalog = this._localFallback();
          this.source = "local";
          this.note = "GitHub could not be reached and there is no saved catalog yet; showing locally installed SBS modules only.";
        }
        return clone(this.catalog);
      }
    }
  }
}

function moduleRows(catalog) {
  const rows = [];
  const matchedLocalIds = new Set();

  for (const item of catalog.modules || []) {
    const local = findLocalModule(item);
    if (local?.id) matchedLocalIds.add(local.id);
    const localVersion = String(local?.version || "");
    const remoteVersion = String(item.version || "");
    const updateAvailable = !!local && !!remoteVersion && newer(remoteVersion, localVersion);
    const missing = !local;
    const identityMismatch = !!local && local.id !== item.id;
    const canPackage = !!item.distributionReady && !!item.manifestUrl && !!item.downloadUrl && !identityMismatch;
    rows.push({
      ...item,
      localVersion: localVersion || "—",
      remoteVersion: remoteVersion || "—",
      installed: !!local,
      active: !!local?.active,
      missing,
      updateAvailable,
      identityMismatch,
      current: !!local && !updateAvailable,
      statusClass: missing ? "missing" : updateAvailable ? "update" : local?.active ? "active" : "inactive",
      statusLabel: missing ? "Missing" : updateAvailable ? "Update Available" : local?.active ? "Active" : "Installed / Inactive",
      canPackage,
      packagePending: !canPackage && !item.localOnly
    });
  }

  for (const local of game.modules.values()) {
    if (!isSbsModule(local) || matchedLocalIds.has(local.id)) continue;
    rows.push({
      type: "module",
      id: local.id,
      title: local.title,
      version: "",
      localVersion: local.version || "—",
      remoteVersion: "Not in catalog",
      installed: true,
      active: !!local.active,
      missing: false,
      updateAvailable: false,
      current: false,
      statusClass: "uncatalogued",
      statusLabel: "Installed / Not in GitHub catalog",
      folderUrl: "",
      manifestUrl: "",
      downloadUrl: "",
      canPackage: false,
      uncatalogued: true
    });
  }

  return rows.sort((a, b) => String(a.title).localeCompare(String(b.title)));
}

function macroRows(catalog) {
  return (catalog.macros || []).map(item => {
    const sourceKey = item.sourcePath || item.fileName || item.id;
    const installed = game.macros.find(m => m.getFlag?.(MODULE_ID, "sourcePath") === sourceKey) || game.macros.find(m => m.name === item.title);
    const localHash = installed?.getFlag?.(MODULE_ID, "sourceHash") || "";
    const updateAvailable = !!installed && !!item.hash && localHash !== item.hash;
    return {
      ...item,
      installed: !!installed,
      macroId: installed?.id || "",
      updateAvailable,
      statusClass: !installed ? "missing" : updateAvailable ? "update" : "active",
      statusLabel: !installed ? "Not Added" : updateAvailable ? "Update Available" : "Added",
      canInstall: !!item.macroData
    };
  }).sort((a, b) => String(a.title).localeCompare(String(b.title)));
}

class EnvironmentManager extends AppBase {
  static DEFAULT_OPTIONS = {
    id: "sbs-environment-manager",
    classes: ["sbsenv-manager"],
    position: {
      width: Math.min(1180, Math.max(820, window.innerWidth - 180)),
      height: Math.min(820, Math.max(600, window.innerHeight - 90))
    },
    window: {
      title: "SaltyBananaSlug's Environment",
      icon: "fa-brands fa-github",
      resizable: true
    }
  };

  static PARTS = {
    main: { template: `modules/${MODULE_ID}/templates/environment-manager.hbs` }
  };

  async _prepareContext(_options) {
    const catalog = await CatalogService.get();
    const modules = moduleRows(catalog);
    const macros = macroRows(catalog);
    const installedCount = modules.filter(m => m.installed).length;
    const activeCount = modules.filter(m => m.active).length;
    const missingCount = modules.filter(m => m.missing).length;
    const updatesCount = modules.filter(m => m.updateAvailable).length + macros.filter(m => m.updateAvailable).length;
    const distributionCount = modules.filter(m => m.canPackage).length;

    const labels = {
      published: "Live GitHub package catalog",
      scan: "Live GitHub repository scan",
      cache: "Cached GitHub catalog",
      local: "Local SBS modules only"
    };

    return {
      logo: LOGO,
      repoUrl: catalog.repositoryUrl || REPO_URL,
      catalogBranchUrl: CATALOG_BRANCH_URL,
      sourceLabel: labels[CatalogService.source] || "GitHub catalog",
      sourceClass: ["published", "scan"].includes(CatalogService.source) ? "live" : "fallback",
      error: CatalogService.lastError,
      note: CatalogService.note,
      generatedAt: catalog.generatedAt ? new Date(catalog.generatedAt).toLocaleString() : "—",
      lastChecked: CatalogService.lastChecked ? CatalogService.lastChecked.toLocaleString() : "—",
      modules,
      macros,
      hasMacros: macros.length > 0,
      stats: {
        installedCount,
        activeCount,
        missingCount,
        updatesCount,
        catalogCount: (catalog.modules || []).length,
        distributionCount
      },
      autoOpen: game.settings.get(MODULE_ID, "openOnReady"),
      autoCheck: game.settings.get(MODULE_ID, "checkOnReady")
    };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const root = this.element;

    root.querySelector("[data-action='refresh']")?.addEventListener("click", async event => {
      event.preventDefault();
      ui.notifications.info("SBS Environment is refreshing the GitHub catalog…");
      try {
        await CatalogService.refresh();
        await this.render({ force: true });
        ui.notifications.info(CatalogService.source === "published" ? "SBS Environment GitHub catalog refreshed." : "SBS Environment refreshed from the GitHub repository scan.");
      } catch (err) {
        console.error(`${MODULE_TITLE} | catalog refresh failed`, err);
        ui.notifications.error(`GitHub catalog refresh failed: ${err?.message || err}`);
      }
    });

    root.querySelector("[data-action='open-repo']")?.addEventListener("click", () => window.open(REPO_URL, "_blank", "noopener"));
    root.querySelector("[data-action='open-catalog-branch']")?.addEventListener("click", () => window.open(CATALOG_BRANCH_URL, "_blank", "noopener"));

    root.querySelector("[name='openOnReady']")?.addEventListener("change", async ev => {
      await game.settings.set(MODULE_ID, "openOnReady", !!ev.target.checked);
      ui.notifications.info(`Open on GM login ${ev.target.checked ? "enabled" : "disabled"}.`);
    });

    root.querySelector("[name='checkOnReady']")?.addEventListener("change", async ev => {
      await game.settings.set(MODULE_ID, "checkOnReady", !!ev.target.checked);
      ui.notifications.info(`GitHub update check on GM login ${ev.target.checked ? "enabled" : "disabled"}.`);
    });

    root.querySelector("[data-action='filter']")?.addEventListener("input", ev => {
      const q = String(ev.target.value || "").trim().toLowerCase();
      root.querySelectorAll("[data-search]").forEach(row => {
        row.classList.toggle("hidden", !!q && !String(row.dataset.search || "").toLowerCase().includes(q));
      });
    });

    root.querySelectorAll("[data-action='open-folder']").forEach(btn => btn.addEventListener("click", () => {
      const url = btn.dataset.url;
      if (url) window.open(url, "_blank", "noopener");
    }));

    root.querySelectorAll("[data-action='package']").forEach(btn => btn.addEventListener("click", () => this._packageDialog(btn.dataset.moduleId)));
    root.querySelectorAll("[data-action='macro-install']").forEach(btn => btn.addEventListener("click", () => this._installMacro(btn.dataset.sourcePath)));
  }

  async _packageDialog(moduleId) {
    const catalog = CatalogService.current();
    const item = (catalog.modules || []).find(m => m.id === moduleId);
    if (!item) return ui.notifications.error("Catalog module not found.");
    if (!item.distributionReady || !item.manifestUrl || !item.downloadUrl) {
      return ui.notifications.warn("This module was discovered on GitHub, but the generated Environment package catalog has not published its install manifest/ZIP yet. Refresh again after the GitHub catalog workflow finishes.");
    }

    const local = findLocalModule(item);
    if (local && local.id !== item.id) {
      return ui.notifications.warn(`This GitHub entry matches installed module ${local.id}, but its module.json id is ${item.id}. Fix the ID before installing/updating so Foundry does not create a duplicate.`);
    }

    const verb = !local ? "Install" : newer(item.version, local.version) ? "Update" : "Reinstall";
    const content = `<div class="sbsenv-package-dialog">
      <p><strong>${escapeHtml(item.title)}</strong></p>
      <p>Local: <code>${escapeHtml(local?.version || "not installed")}</code> &nbsp; GitHub: <code>${escapeHtml(item.version || "unknown")}</code></p>
      <p>Foundry Core installs packages from the <strong>Setup → Add-on Modules</strong> screen. Environment has the generated GitHub manifest and release ZIP ready.</p>
      <label>Manifest URL<input type="text" readonly value="${escapeHtml(item.manifestUrl)}"></label>
      <p class="hint">Copy the manifest, return to Foundry Setup, choose <strong>Install Module</strong>, paste it into Manifest URL, and install. Restart/reload Foundry afterward.</p>
    </div>`;

    new Dialog({
      title: `${verb} — ${item.title}`,
      content,
      buttons: {
        close: { label: "Close" },
        github: { label: "Open GitHub Folder", callback: () => item.folderUrl && window.open(item.folderUrl, "_blank", "noopener") },
        download: { label: "Download ZIP", callback: () => item.downloadUrl && window.open(item.downloadUrl, "_blank", "noopener") },
        copy: { label: "Copy Manifest", callback: async () => { await copyText(item.manifestUrl); ui.notifications.info("Manifest URL copied."); } }
      },
      default: "copy"
    }, { width: 690, resizable: true }).render(true);
  }

  async _installMacro(sourcePath) {
    const catalog = CatalogService.current();
    const item = (catalog.macros || []).find(m => (m.sourcePath || m.fileName || m.id) === sourcePath);
    if (!item?.macroData) return ui.notifications.warn("This GitHub macro does not contain importable macro data.");

    const sourceKey = item.sourcePath || item.fileName || item.id;
    let macro = game.macros.find(m => m.getFlag?.(MODULE_ID, "sourcePath") === sourceKey) || game.macros.find(m => m.name === item.title);
    const data = {
      ...item.macroData,
      flags: {
        [MODULE_ID]: {
          sourcePath: sourceKey,
          sourceHash: item.hash || "",
          sourceUrl: item.fileUrl || item.rawUrl || ""
        }
      }
    };

    if (macro) {
      await macro.update(data);
      ui.notifications.info(`${item.title} macro updated.`);
    } else {
      macro = await Macro.create(data);
      ui.notifications.info(`${item.title} macro added.`);
    }
    await this.render({ force: true });
  }
}

async function ensureLauncherMacro() {
  if (!game.user.isGM) return;
  const name = "SaltyBananaSlug's Environment Manager";
  let macro = game.macros.find(m => m.getFlag?.(MODULE_ID, "launcher") === true) || game.macros.find(m => m.name === name);
  const data = {
    name,
    type: "script",
    scope: "global",
    img: LOGO,
    command: "if (!game.sbsEnvironment?.open) ui.notifications.error(\"SaltyBananaSlug's Environment API is not ready. Reload the world.\"); else game.sbsEnvironment.open();",
    flags: { [MODULE_ID]: { launcher: true } }
  };

  if (!macro) {
    try { await Macro.create(data); }
    catch (err) { console.warn(`${MODULE_TITLE} | could not create launcher macro`, err); }
  } else {
    const needsUpdate = macro.name !== data.name || macro.img !== data.img || macro.command !== data.command;
    if (needsUpdate) {
      try { await macro.update(data); }
      catch (err) { console.warn(`${MODULE_TITLE} | could not refresh launcher macro`, err); }
    }
  }
}

async function checkForAttention() {
  if (!game.user.isGM || !game.settings.get(MODULE_ID, "checkOnReady")) return;
  const catalog = await CatalogService.get({ force: true });
  const modules = moduleRows(catalog);
  const macros = macroRows(catalog);
  const missing = modules.filter(m => m.missing).length;
  const updates = modules.filter(m => m.updateAvailable).length + macros.filter(m => m.updateAvailable).length;
  if (updates || missing) {
    ui.notifications.info(`SBS Environment: ${updates} update${updates === 1 ? "" : "s"}, ${missing} missing module${missing === 1 ? "" : "s"}.`);
  }
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "catalogCache", {
    name: "GitHub Catalog Cache",
    hint: "Internal cache of the last successful SaltyBananaSlug GitHub catalog refresh.",
    scope: "world",
    config: false,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, "checkOnReady", {
    name: "Check SBS GitHub catalog when GM logs in",
    hint: "Check the public SaltyBananaSlug GitHub catalog when the GM logs in and notify when modules are missing or updates are available.",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.register(MODULE_ID, "openOnReady", {
    name: "Open SaltyBananaSlug's Environment when GM logs in",
    hint: "Automatically open the Environment dashboard after the world finishes loading.",
    scope: "client",
    config: true,
    type: Boolean,
    default: false
  });

  game.settings.registerMenu(MODULE_ID, "manager", {
    name: "SaltyBananaSlug's Environment Manager",
    label: "Open Environment Manager",
    hint: "View SBS modules from GitHub, compare installed versions, find updates, and install SBS macros.",
    icon: "fa-brands fa-github",
    type: EnvironmentManager,
    restricted: true
  });
});

let manager = null;

async function openEnvironment() {
  if (!game.user.isGM) {
    ui.notifications.warn("SaltyBananaSlug's Environment is GM-only.");
    return null;
  }
  try {
    manager ??= new EnvironmentManager();
    await manager.render({ force: true });
    return manager;
  } catch (err) {
    console.error(`${MODULE_TITLE} | manager failed to open`, err);
    ui.notifications.error(`SaltyBananaSlug's Environment could not open: ${err?.message || err}`);
    return null;
  }
}

Hooks.once("ready", async () => {
  game.sbsEnvironment = {
    version: game.modules.get(MODULE_ID)?.version,
    open: openEnvironment,
    refresh: () => CatalogService.refresh(),
    getCatalog: options => CatalogService.get(options),
    get source() { return CatalogService.source; },
    repositoryUrl: REPO_URL,
    catalogUrl: CATALOG_URL
  };

  const mod = game.modules.get(MODULE_ID);
  if (mod) mod.api = game.sbsEnvironment;

  if (!game.user.isGM) return;
  await ensureLauncherMacro();
  if (game.settings.get(MODULE_ID, "openOnReady")) await openEnvironment();
  if (game.settings.get(MODULE_ID, "checkOnReady")) void checkForAttention();
});
