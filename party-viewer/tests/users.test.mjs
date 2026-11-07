import test from "node:test";
import assert from "node:assert/strict";
import {fixture} from "./helpers.mjs";
const hooks = new Map();
globalThis.Hooks = {once() {}, on(name, fn) { (hooks.get(name) ?? hooks.set(name, []).get(name)).push(fn); }};
globalThis.Application = class {
  static get defaultOptions() { return {}; }
  render() { return this; }
};
const {PartyViewerApp} = await import("../scripts/party-viewer.js");
function setup() {
  const f = fixture();
  game.settings = {get: () => ({})};
  const notices = [];
  globalThis.ui = {notifications: {warn: m => notices.push(m), error: m => notices.push(m)}};
  const opened = [];
  foundry.applications = {sheets: {UserConfig: class {
    constructor(options) {this.options = options;}
    render(force) {opened.push({user: this.options.document, force}); return this;}
  }}};
  f.alice.character = f.a;
  f.bob.active = false;
  return {...f, opened, notices};
}
function event(id) {
  const button = {dataset: {action: "open-user-settings", userId: id}, disabled: false, closest: () => null};
  return {button, currentTarget: button, preventDefault() {}};
}
test("GM Users tab lists offline users and their current character without exposing User documents", async () => {
  const f = setup();
  const app = new PartyViewerApp();
  app.activeTab = "users";
  const data = await app.getData();
  assert.equal(data.users.length, 4);
  assert.equal(data.users.find(u => u.id === "alice").characterName, "a");
  assert.equal(data.users.find(u => u.id === "bob").active, false);
  assert.equal(data.users.find(u => u.id === "bob").characterName, "None");
  assert.equal(data.users.some(u => "password" in u || "flags" in u), false);
  game.user = f.alice;
  const playerData = await app.getData();
  assert.deepEqual(playerData.users, []);
  assert.equal(playerData.activeTab, "dashboard");
});
test("GM launches the selected user's native settings, including offline users", async () => {
  const f = setup(), app = new PartyViewerApp(), ev = event("bob");
  await app._onAction(ev);
  assert.deepEqual(f.opened, [{user: f.bob, force: true}]);
  assert.equal(ev.button.disabled, false);
});
test("player-triggered actions and deleted users cannot open native settings", async () => {
  const f = setup(), app = new PartyViewerApp();
  game.user = f.alice;
  await app._onAction(event("bob"));
  assert.equal(f.opened.length, 0);
  game.user = f.gm;
  await app._onAction(event("deleted"));
  assert.equal(f.opened.length, 0);
  assert.equal(f.notices.length, 2);
});
test("native window errors are reported and the button is enabled again", async () => {
  const f = setup(), ev = event("alice");
  foundry.applications.sheets.UserConfig = class {render() {throw new Error("Window failed");}};
  await new PartyViewerApp()._onAction(ev);
  assert.equal(ev.button.disabled, false);
  assert.deepEqual(f.notices, ["Window failed"]);
});
test("user edits and connections request a dashboard refresh", () => {
  const original = PartyViewerApp.refreshOpen;
  let count = 0;
  PartyViewerApp.refreshOpen = () => count++;
  try {
    for (const name of ["createUser", "updateUser", "deleteUser", "userConnected"])
      for (const fn of hooks.get(name) ?? []) fn();
    assert.equal(count, 4);
  } finally {PartyViewerApp.refreshOpen = original;}
});
