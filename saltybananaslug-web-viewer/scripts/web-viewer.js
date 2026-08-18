const MODULE_ID = "saltybananaslug-web-viewer";
const SOCKET_NAME = `module.${MODULE_ID}`;
const APP_ID = "saltybananaslug-web-viewer-window";
const ICON_PATH = `modules/${MODULE_ID}/assets/banana-slug.svg`;

let viewerApp = null;
let youtubeApiPromise = null;

function loadYouTubeApi() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-${MODULE_ID}-youtube-api]`);
    const previousReady = window.onYouTubeIframeAPIReady;

    window.onYouTubeIframeAPIReady = () => {
      try {
        if (typeof previousReady === "function") previousReady();
      } finally {
        resolve(window.YT);
      }
    };

    if (existing) {
      const started = Date.now();
      const poll = window.setInterval(() => {
        if (window.YT?.Player) {
          window.clearInterval(poll);
          resolve(window.YT);
        } else if (Date.now() - started > 12000) {
          window.clearInterval(poll);
          reject(new Error("The YouTube player API did not load."));
        }
      }, 100);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.dataset[`${MODULE_ID.replace(/-/g, "_")}_youtube_api`] = "true";
    script.setAttribute(`data-${MODULE_ID}-youtube-api`, "true");
    script.onerror = () => reject(new Error("Firefox or an extension blocked the YouTube player API."));
    document.head.appendChild(script);
  });

  return youtubeApiPromise;
}

function escapeHTML(value = "") {
  return foundry.utils.escapeHTML(String(value ?? ""));
}

function safeText(value = "") {
  return String(value ?? "").trim();
}

function normalizeUrl(raw = "") {
  let value = safeText(raw);
  if (!value) return "";

  if (
    value.startsWith("/") ||
    value.startsWith("modules/") ||
    value.startsWith("systems/") ||
    value.startsWith("worlds/") ||
    value.startsWith("icons/") ||
    value.startsWith("assets/") ||
    value.startsWith("data:image/") ||
    value.startsWith("data:audio/")
  ) {
    return value;
  }

  if (!/^[a-z][a-z0-9+.-]*:/i.test(value)) value = `https://${value}`;
  return value;
}

function isAllowedUrl(url = "") {
  if (!url) return false;
  if (
    url.startsWith("/") ||
    url.startsWith("modules/") ||
    url.startsWith("systems/") ||
    url.startsWith("worlds/") ||
    url.startsWith("icons/") ||
    url.startsWith("assets/") ||
    url.startsWith("data:image/") ||
    url.startsWith("data:audio/")
  ) return true;

  try {
    const parsed = new URL(url, window.location.href);
    return ["http:", "https:"].includes(parsed.protocol);
  } catch (_error) {
    return false;
  }
}

function isImageUrl(url = "") {
  if (url.startsWith("data:image/")) return true;
  const clean = url.split(/[?#]/)[0].toLowerCase();
  return /\.(?:png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(clean);
}

function isAudioUrl(url = "") {
  if (url.startsWith("data:audio/")) return true;
  const clean = url.split(/[?#]/)[0].toLowerCase();
  return /\.(?:mp3|wav|ogg|oga|m4a|aac|flac|webm)$/i.test(clean);
}

function extractYouTubeData(raw = "") {
  const url = normalizeUrl(raw);
  if (!url || url.startsWith("data:")) return null;

  try {
    const parsed = new URL(url, window.location.href);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    let videoId = "";

    if (host === "youtu.be") {
      videoId = parsed.pathname.split("/").filter(Boolean)[0] || "";
    } else if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
      if (parsed.pathname === "/watch") videoId = parsed.searchParams.get("v") || "";
      else {
        const match = parsed.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/i);
        videoId = match?.[1] || "";
      }
    }

    videoId = videoId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32);
    if (!videoId) return null;

    const rawStart = parsed.searchParams.get("t") || parsed.searchParams.get("start") || "";
    let start = 0;
    if (/^\d+$/.test(rawStart)) start = Number(rawStart);
    else {
      const hours = Number(rawStart.match(/(\d+)h/i)?.[1] || 0);
      const minutes = Number(rawStart.match(/(\d+)m/i)?.[1] || 0);
      const seconds = Number(rawStart.match(/(\d+)s/i)?.[1] || 0);
      start = (hours * 3600) + (minutes * 60) + seconds;
    }

    return { videoId, start: Math.max(0, Math.floor(start || 0)) };
  } catch (_error) {
    return null;
  }
}

function detectMode(url = "", requestedMode = "auto") {
  if (["website", "image", "audio", "youtube-video", "youtube-compact"].includes(requestedMode)) return requestedMode;
  if (extractYouTubeData(url)) return "youtube-video";
  if (isImageUrl(url)) return "image";
  if (isAudioUrl(url)) return "audio";
  return "website";
}

function modeLabel(mode) {
  return {
    website: "Website",
    image: "Image",
    audio: "Audio",
    "youtube-video": "YouTube Video",
    "youtube-compact": "YouTube Compact"
  }[mode] || "Web Content";
}

function displayTitle(payload = {}) {
  return safeText(payload.title) || safeText(payload.url) || modeLabel(payload.mode);
}

function contentSummary(payload = {}) {
  return `<strong>${escapeHTML(modeLabel(payload.mode))}:</strong> ${escapeHTML(displayTitle(payload))}`;
}

function dataUrlBytes(dataUrl = "") {
  if (!dataUrl.startsWith("data:")) return 0;
  const base64 = dataUrl.split(",")[1] || "";
  return Math.floor((base64.length * 3) / 4);
}

function formatBytes(bytes = 0) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function getActiveUsers({ includeSelf = false } = {}) {
  return game.users
    .filter(user => user.active && (includeSelf || user.id !== game.user.id))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function getPartyUsers() {
  return getActiveUsers().filter(user => !user.isGM && Boolean(user.character));
}

function getPlayerUsers() {
  return getActiveUsers().filter(user => !user.isGM);
}

async function confirmIncomingShare(payload, sender) {
  return new Promise(resolve => {
    let resolved = false;
    const finish = value => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    new Dialog({
      title: "Incoming Web Viewer Share",
      content: `
        <div class="sbswv-share-request">
          <p><strong>${escapeHTML(sender?.name || "Another user")}</strong> wants to open something in your Web Viewer.</p>
          <p>${contentSummary(payload)}</p>
          <p class="notes">The content opens only if you accept.</p>
        </div>
      `,
      buttons: {
        accept: {
          icon: '<i class="fas fa-check"></i>',
          label: "Accept",
          callback: () => finish(true)
        },
        decline: {
          icon: '<i class="fas fa-times"></i>',
          label: "Decline",
          callback: () => finish(false)
        }
      },
      default: "accept",
      close: () => finish(false)
    }).render(true);
  });
}

async function chooseShareTargets() {
  const users = getActiveUsers();
  if (!users.length) {
    ui.notifications.warn("No other users are currently connected.");
    return null;
  }

  const partyCount = getPartyUsers().length;
  const playerCount = getPlayerUsers().length;
  const userRows = users.map(user => `
    <label class="sbswv-user-row">
      <input type="checkbox" name="selectedUsers" value="${user.id}">
      <span>${escapeHTML(user.name)}</span>
      <small>${user.isGM ? "GM" : (user.character ? escapeHTML(user.character.name) : "Player")}</small>
    </label>
  `).join("");

  return new Promise(resolve => {
    let resolved = false;
    const finish = value => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    new Dialog({
      title: "Share Web Viewer",
      content: `
        <form class="sbswv-share-form">
          <fieldset>
            <legend>Recipients</legend>
            <label>
              <input type="radio" name="scope" value="party" ${partyCount ? "checked" : ""} ${partyCount ? "" : "disabled"}>
              Party <small>(${partyCount} active players with assigned characters)</small>
            </label>
            <label>
              <input type="radio" name="scope" value="players" ${!partyCount && playerCount ? "checked" : ""} ${playerCount ? "" : "disabled"}>
              All Players <small>(${playerCount} active non-GM users)</small>
            </label>
            <label>
              <input type="radio" name="scope" value="selected" ${!partyCount && !playerCount ? "checked" : ""}>
              Selected Users
            </label>
          </fieldset>
          <div class="sbswv-user-list">${userRows}</div>
          <p class="notes">GM shares open immediately. Shares sent by players require each recipient to accept.</p>
        </form>
      `,
      buttons: {
        share: {
          icon: '<i class="fas fa-share"></i>',
          label: "Share",
          callback: html => {
            const scope = html.find('input[name="scope"]:checked').val();
            let targetIds = [];
            if (scope === "party") targetIds = getPartyUsers().map(user => user.id);
            else if (scope === "players") targetIds = getPlayerUsers().map(user => user.id);
            else targetIds = html.find('input[name="selectedUsers"]:checked').map((_i, el) => el.value).get();

            targetIds = [...new Set(targetIds)].filter(id => id && id !== game.user.id && game.users.get(id)?.active);
            if (!targetIds.length) {
              ui.notifications.warn("Choose at least one connected recipient.");
              finish(null);
              return;
            }
            finish(targetIds);
          }
        },
        cancel: {
          icon: '<i class="fas fa-times"></i>',
          label: "Cancel",
          callback: () => finish(null)
        }
      },
      default: "share",
      close: () => finish(null),
      render: html => {
        const syncSelectedState = () => {
          const selected = html.find('input[name="scope"]:checked').val() === "selected";
          html.find('.sbswv-user-list input').prop("disabled", !selected);
          html.find('.sbswv-user-list').toggleClass("disabled", !selected);
        };
        html.find('input[name="scope"]').on("change", syncSelectedState);
        html.find('.sbswv-user-row').on("click", () => {
          html.find('input[name="scope"][value="selected"]').prop("checked", true);
          syncSelectedState();
        });
        syncSelectedState();
      }
    }).render(true);
  });
}

async function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read ${file?.name || "that file"}.`));
    reader.readAsDataURL(file);
  });
}

async function imageFileToDataURL(file) {
  const type = String(file?.type || "").toLowerCase();
  if (!type.startsWith("image/")) throw new Error("That file is not an image.");

  if (type === "image/svg+xml" || type === "image/gif") {
    const raw = await readFileAsDataURL(file);
    return { dataUrl: raw, sizeText: formatBytes(dataUrlBytes(raw)) };
  }

  const raw = await readFileAsDataURL(file);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not process image ${file.name}.`));
    img.src = raw;
  });

  const maxDimension = 1920;
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height, 1));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, width, height);

  let dataUrl = canvas.toDataURL("image/webp", 0.88);
  if (!dataUrl.startsWith("data:image/")) dataUrl = raw;

  return { dataUrl, sizeText: formatBytes(dataUrlBytes(dataUrl)) };
}

async function audioFileToDataURL(file) {
  const type = String(file?.type || "").toLowerCase();
  if (!(type.startsWith("audio/") || /\.(mp3|wav|ogg|oga|m4a|aac|flac|webm)$/i.test(file?.name || ""))) {
    throw new Error("That file is not an audio file.");
  }
  const dataUrl = await readFileAsDataURL(file);
  return { dataUrl, sizeText: formatBytes(dataUrlBytes(dataUrl)) };
}

class SaltyWebViewer extends Application {
  constructor(options = {}) {
    super(options);
    this.current = {
      url: "",
      mode: "auto",
      title: "",
      autoplay: false,
      senderId: game.user.id,
      senderName: game.user.name
    };
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: APP_ID,
      title: "SaltyBananaSlug's Web Viewer",
      classes: ["saltybananaslug-web-viewer"],
      width: 980,
      height: 720,
      minWidth: 560,
      minHeight: 420,
      resizable: true,
      popOut: true
    });
  }

  async _renderInner() {
    const html = `
      <div class="sbswv-shell">
        <div class="sbswv-toolbar">
          <div class="sbswv-address-row">
            <input class="sbswv-url" type="text" placeholder="Paste a website, image, audio, or YouTube link..." spellcheck="false">
            <button type="button" class="sbswv-load" title="Load"><i class="fas fa-arrow-right"></i></button>
          </div>
          <div class="sbswv-control-row">
            <label>
              <span>Display</span>
              <select class="sbswv-mode">
                <option value="auto">Auto Detect</option>
                <option value="website">Website</option>
                <option value="image">Image</option>
                <option value="audio">Audio</option>
                <option value="youtube-video">YouTube Video</option>
                <option value="youtube-compact">YouTube Compact</option>
              </select>
            </label>
            <label class="sbswv-autoplay-label" title="Browsers may block autoplay until the recipient clicks inside Foundry.">
              <input class="sbswv-autoplay" type="checkbox">
              Autoplay
            </label>
            <button type="button" class="sbswv-upload-image"><i class="fas fa-image"></i> Upload Image</button>
            <button type="button" class="sbswv-upload-audio"><i class="fas fa-music"></i> Upload Audio</button>
            <button type="button" class="sbswv-refresh" title="Refresh"><i class="fas fa-rotate-right"></i> Refresh</button>
            <button type="button" class="sbswv-external" title="Open in your normal browser"><i class="fas fa-up-right-from-square"></i> External</button>
            <button type="button" class="sbswv-share"><i class="fas fa-share-nodes"></i> Share</button>
          </div>
          <input class="sbswv-image-file" type="file" accept="image/*" hidden>
          <input class="sbswv-audio-file" type="file" accept="audio/*,.mp3,.wav,.ogg,.oga,.m4a,.aac,.flac,.webm" hidden>
        </div>
        <div class="sbswv-status">
          <span class="sbswv-status-text">Ready. Paste a link, upload media, and inflict tasteful internet upon the party.</span>
        </div>
        <div class="sbswv-content">
          <div class="sbswv-empty">
            <img class="sbswv-empty-logo" src="${ICON_PATH}" alt="SaltyBananaSlug logo">
            <h2>Web Viewer</h2>
            <p>Display a website, direct image link, direct audio link, uploaded temporary image/audio, or a YouTube embed.</p>
            <p><strong>YouTube Compact</strong> is the small visible player version for when you mostly want audio without angering YouTube.</p>
            <p><strong>Uploaded media is temporary.</strong> It is shared to recipients without being saved into your world data folder.</p>
          </div>
        </div>
      </div>
    `;
    return $(html);
  }

  activateListeners(html) {
    super.activateListeners(html);

    const windowTitle = this.element.find('.window-title');
    if (windowTitle.length && !windowTitle.find('.sbswv-title-icon').length) {
      windowTitle.prepend(`<img class="sbswv-title-icon" src="${ICON_PATH}" alt="">`);
    }

    html.find('.sbswv-load').on('click', () => this.loadFromControls());
    html.find('.sbswv-url').on('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        this.loadFromControls();
      }
    });
    html.find('.sbswv-refresh').on('click', () => this.loadContent(this.current, { updateControls: true, announce: true }));
    html.find('.sbswv-external').on('click', () => this.openExternal());
    html.find('.sbswv-share').on('click', () => this.shareCurrent());
    html.find('.sbswv-upload-image').on('click', () => html.find('.sbswv-image-file').trigger('click'));
    html.find('.sbswv-upload-audio').on('click', () => html.find('.sbswv-audio-file').trigger('click'));
    html.find('.sbswv-image-file').on('change', event => this.handleImageUpload(event));
    html.find('.sbswv-audio-file').on('change', event => this.handleAudioUpload(event));

    if (this.current.url) this.loadContent(this.current, { updateControls: true });
  }

  setStatus(message, kind = "info") {
    const root = this.element;
    if (!root?.length) return;
    root.find('.sbswv-status')
      .removeClass('info warn error success')
      .addClass(kind);
    root.find('.sbswv-status-text').text(message);
  }

  getControlsPayload() {
    const root = this.element;
    return {
      url: normalizeUrl(root.find('.sbswv-url').val()),
      mode: root.find('.sbswv-mode').val() || "auto",
      title: this.current?.title || "",
      autoplay: root.find('.sbswv-autoplay').is(':checked'),
      senderId: game.user.id,
      senderName: game.user.name
    };
  }

  updateControls(payload) {
    const root = this.element;
    if (!root?.length) return;
    root.find('.sbswv-url').val(payload.url || "");
    root.find('.sbswv-mode').val(payload.mode || "auto");
    root.find('.sbswv-autoplay').prop('checked', Boolean(payload.autoplay));
  }

  loadFromControls() {
    const payload = this.getControlsPayload();
    payload.title = "";
    if (!payload.url) {
      ui.notifications.warn("Paste a link first. The void has terrible bandwidth.");
      return;
    }
    this.loadContent(payload, { updateControls: true, announce: true });
  }

  async handleImageUpload(event) {
    const input = event.currentTarget;
    const file = input?.files?.[0];
    input.value = "";
    if (!file) return;

    try {
      this.setStatus(`Processing image ${file.name}...`, "info");
      const { dataUrl, sizeText } = await imageFileToDataURL(file);
      const payload = {
        url: dataUrl,
        mode: "image",
        title: file.name,
        autoplay: false,
        senderId: game.user.id,
        senderName: game.user.name
      };
      this.loadContent(payload, { updateControls: true, announce: false });
      this.setStatus(`Loaded uploaded image ${file.name} (${sizeText}). Temporary only; not saved to world data.`, "success");
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to upload image`, error);
      ui.notifications.error(error.message || "Could not process that image.");
      this.setStatus(error.message || "Could not process that image.", "error");
    }
  }

  async handleAudioUpload(event) {
    const input = event.currentTarget;
    const file = input?.files?.[0];
    input.value = "";
    if (!file) return;

    try {
      this.setStatus(`Processing audio ${file.name}...`, "info");
      const { dataUrl, sizeText } = await audioFileToDataURL(file);
      const payload = {
        url: dataUrl,
        mode: "audio",
        title: file.name,
        autoplay: this.element.find('.sbswv-autoplay').is(':checked'),
        senderId: game.user.id,
        senderName: game.user.name
      };
      this.loadContent(payload, { updateControls: true, announce: false });
      this.setStatus(`Loaded uploaded audio ${file.name} (${sizeText}). Temporary only; not saved to world data.`, "success");
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to upload audio`, error);
      ui.notifications.error(error.message || "Could not process that audio file.");
      this.setStatus(error.message || "Could not process that audio file.", "error");
    }
  }

  buildYouTubeStage(payload, compact = false) {
    const title = compact ? "YouTube Compact" : "YouTube Video";
    const description = compact
      ? 'Small visible player for the "mostly audio" use case. YouTube still requires the player itself to remain visible.'
      : "The official YouTube embedded player will appear below.";

    return `
      <div class="${compact ? "sbswv-audio-stage" : "sbswv-youtube-stage"}">
        ${compact ? `
          <div class="sbswv-audio-heading">
            <i class="fas fa-headphones"></i>
            <div>
              <h2>${title}</h2>
              <p>${description}</p>
            </div>
          </div>
        ` : ""}
        <div class="sbswv-youtube-mount ${compact ? "compact" : "full"}"></div>
        <div class="sbswv-youtube-message" hidden></div>
        <div class="sbswv-youtube-actions">
          <button type="button" class="sbswv-youtube-retry-privacy"><i class="fas fa-shield-halved"></i> Retry Privacy Player</button>
          <button type="button" class="sbswv-youtube-retry-standard"><i class="fab fa-youtube"></i> Retry Standard Player</button>
          <button type="button" class="sbswv-youtube-open"><i class="fas fa-up-right-from-square"></i> Open on YouTube</button>
        </div>
      </div>
    `;
  }

  showYouTubeMessage(message, kind = "warn") {
    const box = this.element.find('.sbswv-youtube-message');
    if (!box.length) return;
    box.removeClass('info warn error success').addClass(kind).prop('hidden', false).html(message);
  }

  async mountYouTubePlayer(payload, compact = false, privacyHost = true) {
    const youtube = extractYouTubeData(payload.url);
    if (!youtube) throw new Error("That does not look like a valid YouTube video link.");

    try {
      this.youtubePlayer?.destroy?.();
    } catch (_error) {
      // The old iframe may already be gone. That is fine.
    }
    this.youtubePlayer = null;

    const mount = this.element.find('.sbswv-youtube-mount').get(0);
    if (!mount) return;
    mount.replaceChildren();

    const params = new URLSearchParams({
      autoplay: payload.autoplay ? "1" : "0",
      controls: "1",
      rel: "0",
      playsinline: "1",
      enablejsapi: "1",
      fs: compact ? "0" : "1"
    });
    if (youtube.start) params.set("start", String(youtube.start));
    if (window.location.origin && window.location.origin !== "null") {
      params.set("origin", window.location.origin);
      params.set("widget_referrer", window.location.origin);
    }

    const host = privacyHost ? "https://www.youtube-nocookie.com" : "https://www.youtube.com";
    const iframe = document.createElement("iframe");
    iframe.className = `sbswv-youtube ${compact ? "sbswv-youtube-compact-player" : "sbswv-youtube-full-player"}`;
    iframe.title = compact ? "YouTube compact player" : "YouTube video player";
    iframe.referrerPolicy = "origin";
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.src = `${host}/embed/${youtube.videoId}?${params.toString()}`;
    mount.appendChild(iframe);

    this.element.find('.sbswv-youtube-message').prop('hidden', true).empty();
    this.element.find('.sbswv-youtube-retry-privacy').off('click').on('click', () => this.mountYouTubePlayer(payload, compact, true));
    this.element.find('.sbswv-youtube-retry-standard').off('click').on('click', () => this.mountYouTubePlayer(payload, compact, false));
    this.element.find('.sbswv-youtube-open').off('click').on('click', () => window.open(payload.url, '_blank', 'noopener'));

    try {
      const YT = await loadYouTubeApi();
      if (!iframe.isConnected) return;
      this.youtubePlayer = new YT.Player(iframe, {
        events: {
          onReady: () => {
            this.setStatus(`YouTube player ready${privacyHost ? " using the privacy-enhanced host" : ""}.`, "success");
          },
          onError: event => {
            const code = Number(event?.data);
            const messages = {
              2: "YouTube rejected the video ID or another player parameter.",
              5: "YouTube could not play this video in its HTML5 player.",
              100: "This YouTube video is missing, private, or removed.",
              101: "The video's owner disabled playback in embedded players.",
              150: "The video's owner disabled playback in embedded players.",
              153: "YouTube did not receive the HTTP referrer or equivalent client identification. Firefox privacy settings or a blocking extension may be stripping it."
            };
            const message = messages[code] || `YouTube returned player error ${Number.isFinite(code) ? code : "unknown"}.`;
            this.showYouTubeMessage(`<strong>${escapeHTML(message)}</strong><br>Try the other player host, or open the video directly on YouTube.`, "error");
            this.setStatus(message, "error");
          },
          onAutoplayBlocked: () => {
            this.showYouTubeMessage("Firefox blocked autoplay. Click the play button inside the player once; manual playback should still work.", "warn");
            this.setStatus("Firefox blocked YouTube autoplay; manual playback is available.", "warn");
          }
        }
      });
    } catch (error) {
      console.warn(`${MODULE_ID} | YouTube API monitoring unavailable`, error);
      this.showYouTubeMessage(`${escapeHTML(error.message || error)} The embedded player may still work; otherwise try the alternate host or open YouTube directly.`, "warn");
      this.setStatus("YouTube player loaded, but error monitoring was blocked.", "warn");
    }
  }

  buildWebsiteCard(payload) {
    let host = "Website";
    try {
      host = new URL(payload.url, window.location.href).hostname || host;
    } catch (_error) {
      // Keep the generic label for unusual but allowed URLs.
    }

    return `
      <div class="sbswv-link-stage">
        <img class="sbswv-link-logo" src="${ICON_PATH}" alt="SaltyBananaSlug logo">
        <h2>Shared Website Link</h2>
        <p class="sbswv-link-host">${escapeHTML(host)}</p>
        <div class="sbswv-link-url">${escapeHTML(payload.url)}</div>
        <p>Most modern websites block being displayed inside Foundry. Open this link in a normal browser tab instead.</p>
        <div class="sbswv-link-actions">
          <button type="button" class="sbswv-inline-external"><i class="fas fa-up-right-from-square"></i> Open in New Tab</button>
          <button type="button" class="sbswv-copy-link"><i class="fas fa-copy"></i> Copy Link</button>
        </div>
      </div>
    `;
  }

  async copyCurrentLink() {
    if (!this.current?.url || this.current.url.startsWith("data:")) return;
    try {
      await navigator.clipboard.writeText(this.current.url);
      ui.notifications.info("Link copied.");
    } catch (_error) {
      const input = document.createElement("textarea");
      input.value = this.current.url;
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      ui.notifications.info("Link copied.");
    }
  }

  buildAudioStage(payload) {
    const title = displayTitle(payload);
    return `
      <div class="sbswv-audio-stage">
        <div class="sbswv-audio-heading">
          <img class="sbswv-audio-logo" src="${ICON_PATH}" alt="SaltyBananaSlug logo">
          <div>
            <h2>${escapeHTML(title)}</h2>
            <p>Temporary uploaded audio and direct audio links play here. No world-file saving, no nonsense.</p>
          </div>
        </div>
        <audio class="sbswv-audio-player" controls ${payload.autoplay ? "autoplay" : ""} src="${escapeHTML(payload.url)}"></audio>
      </div>
    `;
  }

  async loadContent(rawPayload, { updateControls = false, announce = true } = {}) {
    const payload = {
      url: normalizeUrl(rawPayload?.url),
      mode: rawPayload?.mode || "auto",
      title: safeText(rawPayload?.title).slice(0, 200),
      autoplay: Boolean(rawPayload?.autoplay),
      senderId: rawPayload?.senderId || game.user.id,
      senderName: rawPayload?.senderName || game.user.name
    };

    if (!payload.url || !isAllowedUrl(payload.url)) {
      ui.notifications.error("Only HTTP(S), Foundry asset paths, and direct image/audio data URLs are supported.");
      return;
    }

    payload.mode = detectMode(payload.url, payload.mode);
    this.current = payload;
    if (updateControls) this.updateControls(payload);

    const content = this.element.find('.sbswv-content');
    try {
      if (payload.mode === "image") {
        content.html(`
          <div class="sbswv-image-stage">
            <img src="${escapeHTML(payload.url)}" alt="Shared image" draggable="false">
          </div>
        `);
        if (announce) this.setStatus(`Showing image${payload.senderName && payload.senderId !== game.user.id ? ` shared by ${payload.senderName}` : ""}.`, "success");
      } else if (payload.mode === "audio") {
        content.html(this.buildAudioStage(payload));
        if (announce) this.setStatus(`Loaded audio${payload.autoplay ? " with autoplay requested" : ""}.`, "success");
      } else if (payload.mode === "youtube-video") {
        content.html(this.buildYouTubeStage(payload, false));
        if (announce) this.setStatus(`Loading YouTube video${payload.autoplay ? " with autoplay requested" : ""}...`, "info");
        await this.mountYouTubePlayer(payload, false, true);
      } else if (payload.mode === "youtube-compact") {
        content.html(this.buildYouTubeStage(payload, true));
        if (announce) this.setStatus(`Loading YouTube compact player${payload.autoplay ? " with autoplay requested" : ""}...`, "info");
        await this.mountYouTubePlayer(payload, true, true);
      } else {
        content.html(this.buildWebsiteCard(payload));
        content.find('.sbswv-inline-external').on('click', () => this.openExternal());
        content.find('.sbswv-copy-link').on('click', () => this.copyCurrentLink());
        if (announce) this.setStatus("Website link received. Open it in a new browser tab.", "success");
      }
    } catch (error) {
      console.error(`${MODULE_ID} | Failed to load content`, error);
      content.html(`
        <div class="sbswv-error-panel">
          <i class="fas fa-triangle-exclamation"></i>
          <h2>Could not load that content</h2>
          <p>${escapeHTML(error.message || error)}</p>
        </div>
      `);
      this.setStatus(error.message || "Could not load content.", "error");
    }
  }

  openExternal() {
    if (!this.current.url) {
      ui.notifications.warn("There is no current link to open.");
      return;
    }
    if (this.current.url.startsWith("data:")) {
      ui.notifications.warn("Temporary uploaded media does not open as a normal external page.");
      return;
    }
    window.open(this.current.url, '_blank', 'noopener');
  }

  async shareCurrent() {
    const payload = foundry.utils.deepClone(this.current || this.getControlsPayload());
    if (!payload.url) {
      ui.notifications.warn("Load or upload something before sharing it.");
      return;
    }
    if (!isAllowedUrl(payload.url)) {
      ui.notifications.error("That URL type cannot be shared.");
      return;
    }

    payload.mode = detectMode(payload.url, payload.mode);
    payload.requestId = foundry.utils.randomID();
    payload.sentAt = Date.now();

    const dataSize = payload.url.startsWith("data:") ? dataUrlBytes(payload.url) : 0;
    if (dataSize > 12 * 1024 * 1024) {
      const ok = await Dialog.confirm({
        title: "Large Temporary Upload",
        content: `<p>This temporary upload is about <strong>${escapeHTML(formatBytes(dataSize))}</strong>. Sending it may be slow for some players. Continue?</p>`,
        yes: () => true,
        no: () => false,
        defaultYes: false
      });
      if (!ok) return;
    }

    const targetIds = await chooseShareTargets();
    if (!targetIds) return;

    game.socket.emit(SOCKET_NAME, {
      action: "share",
      senderId: game.user.id,
      targetIds,
      payload
    });

    const behavior = game.user.isGM ? "opened immediately" : "sent for approval";
    ui.notifications.info(`Web Viewer share ${behavior} for ${targetIds.length} recipient${targetIds.length === 1 ? "" : "s"}.`);
  }
}

async function openViewer(payload = null) {
  if (!viewerApp) viewerApp = new SaltyWebViewer();
  if (payload) viewerApp.current = payload;

  if (!viewerApp.rendered) {
    await viewerApp.render(true);
    if (payload?.url) viewerApp.loadContent(payload, { updateControls: true, announce: true });
  } else {
    viewerApp.bringToTop();
    if (payload?.url) viewerApp.loadContent(payload, { updateControls: true, announce: true });
  }
  return viewerApp;
}

async function handleSocketMessage(message) {
  if (!message || message.action !== "share") return;
  if (!Array.isArray(message.targetIds) || !message.targetIds.includes(game.user.id)) return;

  const sender = game.users.get(message.senderId);
  if (!sender || !message.payload) return;

  const payload = {
    url: normalizeUrl(message.payload.url),
    mode: message.payload.mode || "auto",
    title: safeText(message.payload.title).slice(0, 200),
    autoplay: Boolean(message.payload.autoplay),
    senderId: sender.id,
    senderName: sender.name,
    requestId: String(message.payload.requestId || "").slice(0, 64),
    sentAt: Number(message.payload.sentAt || Date.now())
  };

  if (!payload.url || !isAllowedUrl(payload.url)) return;
  payload.mode = detectMode(payload.url, payload.mode);

  if (!sender.isGM) {
    const accepted = await confirmIncomingShare(payload, sender);
    if (!accepted) {
      ui.notifications.info(`Declined Web Viewer share from ${sender.name}.`);
      return;
    }
  }

  await openViewer(payload);
  if (sender.isGM) ui.notifications.info(`${sender.name} opened the Web Viewer.`);
}

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | Initializing`);
});

Hooks.once("ready", () => {
  game.socket.on(SOCKET_NAME, handleSocketMessage);

  const mod = game.modules.get(MODULE_ID);
  if (mod) {
    mod.api = {
      open: openViewer,
      load: async (url, options = {}) => {
        const payload = {
          url: normalizeUrl(url),
          mode: options.mode || "auto",
          title: options.title || "",
          autoplay: Boolean(options.autoplay),
          senderId: game.user.id,
          senderName: game.user.name
        };
        await openViewer(payload);
      },
      share: async (url, options = {}) => {
        const app = await openViewer({
          url: normalizeUrl(url),
          mode: options.mode || "auto",
          title: options.title || "",
          autoplay: Boolean(options.autoplay),
          senderId: game.user.id,
          senderName: game.user.name
        });
        await app.shareCurrent();
      }
    };
  }

  console.log(`${MODULE_ID} | Ready`);
});
