// Selected Token -> Monster Manual-style text stat block
// Foundry VTT v13 / D&D5e v5.2.x. Create a Script macro and paste this file.
return (async () => {
  if (game.system.id !== "dnd5e") {
    ui.notifications.error("This macro requires the D&D 5e game system.");
    return;
  }

  const selected = canvas.tokens?.controlled ?? [];
  if (selected.length > 1) {
    ui.notifications.warn("Select only one token.");
    return;
  }
  const targets = Array.from(game.user.targets ?? []);
  const token = selected[0] ?? (targets.length === 1 ? targets[0] : null);
  if (!token?.actor) {
    ui.notifications.warn("Select a token, or target exactly one token.");
    return;
  }

  const actor = token.actor; // Synthetic actor preserves unlinked-token changes.
  if (!game.user.isGM && !actor.testUserPermission(game.user, "OBSERVER")) {
    ui.notifications.warn("You need Observer permission for this actor to read its stat block.");
    return;
  }

  // Convert the D&D5e system's actual stat block HTML to copyable plain text.
  // Mounting temporarily off-screen lets innerText retain block/table line breaks.
  function htmlToText(html) {
    const node = document.createElement("div");
    node.innerHTML = String(html ?? "");
    node.querySelectorAll("script, style, button, svg, figcaption, .document-embed-actions")
      .forEach(element => element.remove());
    node.style.cssText = "position:fixed;left:-100000px;top:0;width:700px;opacity:0;pointer-events:none";
    if (!game.user.isGM && !actor.isOwner) {
      node.querySelectorAll(".secret:not(.revealed)").forEach(element => element.remove());
    }
    document.body.append(node);
    try {
      return node.innerText
        .replace(/\u00a0/g, " ")
        .replace(/\r/g, "")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    } finally {
      node.remove();
    }
  }

  const sign = n => Number(n) >= 0 ? `+${n}` : String(n);
  const label = value => typeof value === "string" ? value : (value?.label ?? value?.value ?? "");

  // NPCs use D&D5e's official embedded stat-block renderer. Characters get a
  // basic readable conversion instead, since the NPC renderer is NPC-specific.
  function characterText() {
    const s = actor.system;
    const a = s.attributes ?? {};
    const d = s.details ?? {};
    const t = s.traits ?? {};
    const size = game.i18n.localize(CONFIG.DND5E.actorSizes?.[t.size]?.label ?? CONFIG.DND5E.actorSizes?.[t.size] ?? t.size ?? "Medium");
    const kind = label(d.race) || label(d.type) || "Humanoid";
    const lines = [actor.name, [size, kind, label(d.alignment)].filter(Boolean).join(" ")];
    lines.push(`Armor Class ${a.ac?.value ?? "—"}`);
    lines.push(`Hit Points ${a.hp?.max ?? "—"}`);
    const m = a.movement ?? {};
    const unit = m.units ?? "ft";
    const speeds = ["walk", "burrow", "climb", "fly", "swim"]
      .filter(k => Number(m[k]) > 0)
      .map(k => `${k === "walk" ? "" : `${k} `}${m[k]} ${unit}.`);
    lines.push(`Speed ${speeds.join(", ") || "—"}`);
    lines.push("");

    const abilityKeys = ["str", "dex", "con", "int", "wis", "cha"];
    lines.push(abilityKeys.map(k => {
      const ability = s.abilities?.[k] ?? {};
      return `${k.toUpperCase()} ${ability.value ?? "—"} (${sign(ability.mod ?? 0)})`;
    }).join("   "));
    lines.push("");

    const saves = abilityKeys.filter(k => Number(s.abilities?.[k]?.proficient) > 0)
      .map(k => `${k.toUpperCase()} ${sign(s.abilities[k].save?.value ?? 0)}`);
    if (saves.length) lines.push(`Saving Throws ${saves.join(", ")}`);
    const skills = Object.entries(s.skills ?? {})
      .filter(([, v]) => Number(v.value) > 0)
      .map(([k, v]) => `${game.i18n.localize(CONFIG.DND5E.skills?.[k]?.label ?? k)} ${sign(v.total ?? v.mod ?? 0)}`);
    if (skills.length) lines.push(`Skills ${skills.join(", ")}`);

    const traitText = key => {
      const v = t[key];
      const values = Array.from(v?.value ?? []);
      const names = values.map(k => game.i18n.localize(CONFIG.DND5E.damageTypes?.[k]?.label
        ?? CONFIG.DND5E.conditionTypes?.[k]?.label ?? k));
      if (v?.custom) names.push(v.custom);
      return names.join(", ");
    };
    for (const [key, title] of [
      ["dv", "Damage Vulnerabilities"], ["dr", "Damage Resistances"],
      ["di", "Damage Immunities"], ["ci", "Condition Immunities"]
    ]) {
      const value = traitText(key);
      if (value) lines.push(`${title} ${value}`);
    }
    const passive = s.skills?.prc?.passive;
    if (passive != null) lines.push(`Senses passive Perception ${passive}`);
    const languages = Array.from(t.languages?.value ?? [])
      .map(k => game.i18n.localize(CONFIG.DND5E.languages?.[k]?.label ?? k));
    if (t.languages?.custom) languages.push(t.languages.custom);
    if (languages.length) lines.push(`Languages ${languages.join(", ")}`);
    if (a.prof != null) lines.push(`Proficiency Bonus ${sign(a.prof)}`);

    const groups = { Traits: [], Actions: [], "Bonus Actions": [], Reactions: [], "Legendary Actions": [] };
    const category = { bonus: "Bonus Actions", reaction: "Reactions", react: "Reactions",
      legendary: "Legendary Actions", action: "Actions" };
    for (const item of actor.items) {
      if (!['feat', 'weapon'].includes(item.type)) continue;
      const activities = item.system.activities?.contents ?? Object.values(item.system.activities ?? {});
      const kinds = activities.map(activity => activity.activation?.type ?? activity.system?.activation?.type)
        .filter(Boolean);
      const section = kinds.length ? (category[kinds[0]] ?? "Actions")
        : (item.type === "weapon" ? "Actions" : "Traits");
      const description = htmlToText(item.system.description?.value ?? "");
      groups[section].push(`${item.name}.${description ? ` ${description}` : ""}`);
    }
    const spells = actor.items.filter(item => item.type === "spell").map(item => item.name);
    if (spells.length) groups.Traits.push(`Spells Known. ${spells.join(", ")}.`);
    for (const [heading, entries] of Object.entries(groups)) {
      if (!entries.length) continue;
      lines.push("", heading.toUpperCase(), "", entries.join("\n\n"));
    }
    return lines.join("\n");
  }

  let text;
  if (actor.type === "npc") {
    try {
      const editor = foundry.applications.ux.TextEditor.implementation;
      const embed = `@Embed[${actor.uuid} statblock caption=false cite=false]`;
      const html = await editor.enrichHTML(embed, { embeds: true, relativeTo: actor, secrets: game.user.isGM || actor.isOwner });
      if (!html || html.includes("@Embed[")) throw new Error("Stat block embed was not resolved");
      text = htmlToText(html);
      if (!text) throw new Error("Stat block rendered empty");
    } catch (error) {
      console.warn("Stat block embed failed; using basic fallback", error);
      ui.notifications.warn("Full NPC renderer unavailable; showing a basic stat block.");
      text = characterText();
    }
  } else {
    text = characterText();
  }

  await new foundry.applications.api.DialogV2({
    window: { title: `${actor.name} — Text Stat Block`, resizable: true },
    position: { width: 750, height: 650 },
    content: `<p>Copyable text for <strong>${foundry.utils.escapeHTML(actor.name)}</strong>.</p>
      <textarea name="statblock" readonly spellcheck="false"
        style="width:100%;height:480px;box-sizing:border-box;resize:vertical;white-space:pre-wrap;font-family:monospace">${foundry.utils.escapeHTML(text)}</textarea>`,
    buttons: [
      {
        action: "copy", label: "Copy Text", icon: "fa-solid fa-copy", default: true,
        callback: async () => {
          await game.clipboard.copyPlainText(text);
          ui.notifications.info("Stat block copied to clipboard.");
        }
      },
      { action: "close", label: "Close" }
    ]
  }).render({ force: true });
})().catch(error => {
  console.error("Selected Token Statblock", error);
  ui.notifications.error(`Statblock failed: ${error.message ?? error}`);
});

