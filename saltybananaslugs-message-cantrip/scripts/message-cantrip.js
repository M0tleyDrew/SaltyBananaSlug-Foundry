/* SaltyBananaSlug's Message Cantrip
 * Private prompt-box messaging for Foundry VTT.
 * Usage: type /message in chat, or make a Script Macro with: MessageCantrip.openDialog();
 */

(() => {
  const MODULE_ID = "saltybananaslugs-message-cantrip";
  const MODULE_TITLE = "SaltyBananaSlug's Message Cantrip";
  const MODULE_ICON = `modules/${MODULE_ID}/assets/party-viewer.svg`;
  const FLAG_KEY = "payload";

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function nl2br(value) {
    return escapeHtml(value).replace(/\n/g, "<br>");
  }

  function uniqueIds(ids) {
    return Array.from(new Set(ids.filter(Boolean)));
  }

  function asElement(value) {
    if (!value) return null;
    if (value instanceof HTMLElement) return value;
    if (value[0] instanceof HTMLElement) return value[0];
    return null;
  }

  function decorateDialogTitleBar(app, html) {
    const htmlElement = asElement(html);
    const appElement = asElement(app?.element) || htmlElement?.closest?.(".window-app, .app");
    const windowElement = appElement?.closest?.(".window-app, .app") || appElement;
    const contentElement = htmlElement || appElement;

    if (!contentElement?.querySelector?.(".message-cantrip-form")) return;

    const titleElement = windowElement?.querySelector?.(".window-title");
    if (!titleElement || titleElement.dataset.messageCantripDecorated === "true") return;

    titleElement.dataset.messageCantripDecorated = "true";
    titleElement.classList.add("message-cantrip-title");
    titleElement.textContent = "";

    const icon = document.createElement("img");
    icon.className = "message-cantrip-title-icon";
    icon.src = MODULE_ICON;
    icon.alt = "";

    titleElement.append(icon, document.createTextNode(MODULE_TITLE));
  }

  function userLabel(user) {
    const role = user.isGM ? "GM/DM" : "Player";
    const status = user.active ? "online" : "offline";
    return `${user.name} (${role}, ${status})`;
  }

  function getSelectableUsers() {
    return game.users.contents
      .filter(u => !u.isSelf)
      .sort((a, b) => {
        if (a.isGM !== b.isGM) return a.isGM ? -1 : 1;
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  function renderRecipientCheckboxes() {
    const users = getSelectableUsers();

    if (!users.length) {
      return `<p class="mc-muted">No other users found. The void is currently not accepting cantrips.</p>`;
    }

    return users.map(u => `
      <label class="mc-recipient-row">
        <input type="checkbox" name="recipient" value="${u.id}">
        <span>${escapeHtml(userLabel(u))}</span>
      </label>
    `).join("");
  }

  async function createWhisperMessage({ recipientIds, text, replyTo = null }) {
    const recipients = recipientIds.map(id => game.users.get(id)).filter(Boolean);

    if (!recipients.length) {
      ui.notifications.warn("Pick at least one recipient.");
      return;
    }

    const sender = game.user;
    const whisperIds = uniqueIds([sender.id, ...recipients.map(u => u.id)]);

    const payload = {
      module: MODULE_ID,
      senderId: sender.id,
      senderName: sender.name,
      recipientIds: recipients.map(u => u.id),
      recipientNames: recipients.map(u => u.name),
      text,
      isReply: Boolean(replyTo),
      originalMessageId: replyTo?.messageId ?? null
    };

    const title = replyTo ? "Message Reply" : "Message";
    const content = `
      <div class="message-cantrip-card">
        <h3>${escapeHtml(title)}</h3>
        <p><strong>From:</strong> ${escapeHtml(sender.name)}</p>
        <p><strong>To:</strong> ${escapeHtml(recipients.map(u => u.name).join(", "))}</p>
        <hr>
        <p>${nl2br(text)}</p>
      </div>
    `;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ alias: sender.name }),
      content,
      whisper: whisperIds,
      flags: {
        [MODULE_ID]: {
          [FLAG_KEY]: payload
        }
      }
    });

    ui.notifications.info(`Message sent to ${recipients.map(u => u.name).join(", ")}.`);
  }

  async function openDialog() {
    const content = `
      <form class="message-cantrip-form">
        <div class="form-group">
          <label><strong>Recipients</strong></label>
          <div class="mc-recipient-box">
            ${renderRecipientCheckboxes()}
          </div>
        </div>

        <div class="form-group mc-message-field">
          <label><strong>Message</strong></label>
          <textarea name="messageText" placeholder="You point your finger and whisper the message..."></textarea>
        </div>

        <p class="mc-muted">
          Chat visibility: only you and selected recipients can see this. GM/DM users do not see it unless selected.
        </p>
      </form>
    `;

    const result = await new Promise(resolve => {
      let resolved = false;

      const done = value => {
        if (resolved) return;
        resolved = true;
        resolve(value);
      };

      new Dialog({
        title: MODULE_TITLE,
        content,
        buttons: {
          send: {
            icon: '<i class="fas fa-paper-plane"></i>',
            label: "Send Message",
            callback: html => {
              const form = html[0].querySelector("form");
              const recipientIds = Array.from(form.querySelectorAll("input[name='recipient']:checked")).map(i => i.value);
              const text = form.querySelector("[name='messageText']")?.value?.trim();
              done({ recipientIds, text });
            }
          },
          cancel: {
            icon: '<i class="fas fa-times"></i>',
            label: "Cancel",
            callback: () => done(null)
          }
        },
        default: "send",
        close: () => done(null)
      }).render(true);
    });

    if (!result) return;

    if (!result.recipientIds.length) {
      ui.notifications.warn("Pick at least one recipient. The void has terrible reception.");
      return;
    }

    if (!result.text) {
      ui.notifications.warn("Message cannot be empty. Even cantrips need syllables.");
      return;
    }

    await createWhisperMessage(result);
  }

  function openReplyDialog(message, payload) {
    const currentUserId = game.user.id;
    const senderUser = game.users.get(payload.senderId);
    const senderName = payload.senderName || senderUser?.name || "Unknown Sender";

    const visibleRecipients = (payload.recipientIds || [])
      .map(id => game.users.get(id))
      .filter(Boolean);

    const replyAllIds = uniqueIds([
      payload.senderId,
      ...(payload.recipientIds || [])
    ]).filter(id => id !== currentUserId);

    const content = `
      <form class="message-cantrip-form">
        <div class="mc-incoming-message">
          <p><strong>Message from ${escapeHtml(senderName)}:</strong></p>
          <blockquote>${nl2br(payload.text || "")}</blockquote>
          <p class="mc-muted"><strong>Original recipients:</strong> ${escapeHtml(visibleRecipients.map(u => u.name).join(", ") || "None")}</p>
        </div>

        <div class="form-group mc-message-field">
          <label><strong>Reply</strong></label>
          <textarea name="replyText" placeholder="Whisper back through the arcane customer-service tube..."></textarea>
        </div>
      </form>
    `;

    new Dialog({
      title: MODULE_TITLE,
      content,
      buttons: {
        replySender: {
          icon: '<i class="fas fa-reply"></i>',
          label: "Reply to Sender",
          callback: async html => {
            const text = html[0].querySelector("[name='replyText']")?.value?.trim();
            if (!text) return;
            await createWhisperMessage({
              recipientIds: [payload.senderId],
              text,
              replyTo: { messageId: message.id }
            });
          }
        },
        replyAll: {
          icon: '<i class="fas fa-reply-all"></i>',
          label: "Reply All",
          callback: async html => {
            const text = html[0].querySelector("[name='replyText']")?.value?.trim();
            if (!text) return;
            await createWhisperMessage({
              recipientIds: replyAllIds,
              text,
              replyTo: { messageId: message.id }
            });
          }
        },
        close: {
          icon: '<i class="fas fa-times"></i>',
          label: "No Response"
        }
      },
      default: "replySender"
    }).render(true);
  }

  function handleIncomingMessage(message) {
    try {
      const payload = message.getFlag(MODULE_ID, FLAG_KEY);
      if (!payload) return;

      const currentUserId = game.user.id;
      const isRecipient = payload.recipientIds?.includes(currentUserId);
      const isSender = payload.senderId === currentUserId;

      if (!isRecipient || isSender) return;

      // Prevent duplicate dialogs from the same message on this client.
      window.__messageCantripHandled ??= new Set();
      if (window.__messageCantripHandled.has(message.id)) return;
      window.__messageCantripHandled.add(message.id);

      openReplyDialog(message, payload);
    } catch (err) {
      console.error(`${MODULE_TITLE} | Incoming message popup failed`, err);
    }
  }

  Hooks.once("init", () => {
    window.MessageCantrip = {
      openDialog,
      send: createWhisperMessage
    };
    window.SaltyBananaSlugMessageCantrip = window.MessageCantrip;
  });

  Hooks.on("createChatMessage", handleIncomingMessage);

  Hooks.on("renderDialog", decorateDialogTitleBar);

  Hooks.on("chatMessage", (chatLog, messageText) => {
    const trimmed = String(messageText ?? "").trim().toLowerCase();
    if (!["/message", "/msgcantrip", "/mc"].includes(trimmed)) return true;
    openDialog();
    return false;
  });

  Hooks.once("ready", () => {
    const mod = game.modules.get(MODULE_ID);
    if (mod) {
      mod.api = {
        openDialog,
        send: createWhisperMessage
      };
    }
    console.log(`${MODULE_TITLE} | Ready. Use /message in chat or MessageCantrip.openDialog() in a macro.`);
  });
})();
