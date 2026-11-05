let seq = 0;
export function set(obj, path, value) {
  const keys = path.split("."),
    last = keys.pop();
  let p = obj;
  for (const k of keys) p = p[k] ??= {};
  p[last] = structuredClone(value);
}
export function merge(base, extra) {
  const result = structuredClone(base);
  for (const [k, v] of Object.entries(extra ?? {}))
    result[k] =
      v && typeof v === "object" && !Array.isArray(v)
        ? merge(result[k] ?? {}, v)
        : structuredClone(v);
  return result;
}
export class Collection extends Map {
  get contents() {
    return [...this.values()];
  }
  filter(fn) {
    return this.contents.filter(fn);
  }
  find(fn) {
    return this.contents.find(fn);
  }
  [Symbol.iterator]() {
    return this.values();
  }
}
export class Item {
  constructor(data, actor) {
    this.data = structuredClone(data);
    this.id = data._id ?? `i${++seq}`;
    this.data._id = this.id;
    this.parent = actor;
    this.documentName = "Item";
    this.flags = data.flags ?? {};
    this.read();
  }
  read() {
    Object.assign(this, {
      name: this.data.name,
      type: this.data.type,
      system: this.data.system,
      img: this.data.img,
    });
    this._source = structuredClone(this.data);
    this.uuid = `${this.parent.uuid}.Item.${this.id}`;
  }
  toObject() {
    return structuredClone(this.data);
  }
  getFlag(ns, key) {
    return this.flags[ns]?.[key];
  }
  async setFlag(ns, key, value) {
    (this.flags[ns] ??= {})[key] = value;
    this.data.flags = this.flags;
  }
  async update(patch) {
    for (const [p, v] of Object.entries(patch)) set(this.data, p, v);
    this.read();
    return this;
  }
}
export class Actor {
  constructor(id, owner) {
    this.id = id;
    this.uuid = `Actor.${id}`;
    this.name = id;
    this.owner = owner;
    this.documentName = "Actor";
    this.type = "character";
    this.flags = {};
    this.items = new Collection();
    this.system = { currency: { cp: 20, sp: 3, ep: 0, gp: 10, pp: 1 } };
    this.effects = { contents: [] };
  }
  testUserPermission(user) {
    return user?.id === this.owner || user?.isGM;
  }
  getFlag(ns, key) {
    return this.flags[ns]?.[key];
  }
  async createEmbeddedDocuments(type, data) {
    if (this.failCreate) {
      this.failCreate = false;
      throw new Error("Simulated create failure");
    }
    return data.map((d) => {
      const item = new Item(d, this);
      this.items.set(item.id, item);
      return item;
    });
  }
  async deleteEmbeddedDocuments(type, ids) {
    for (const id of ids) this.items.delete(id);
  }
  async update(patch) {
    if (this.failUpdate) {
      this.failUpdate = false;
      throw new Error("Simulated currency failure");
    }
    for (const [p, v] of Object.entries(patch)) set(this, p, v);
  }
  add(id, name, q = 1, type = "loot", extra = {}) {
    const item = new Item(
      { _id: id, name, type, system: { quantity: q, ...extra } },
      this,
    );
    this.items.set(id, item);
    return item;
  }
}
export function globals() {
  globalThis.foundry = {
    utils: {
      deepClone: (value) => structuredClone(value),
      randomID: () => `id${++seq}`,
      mergeObject: merge,
      getProperty: (o, p) => p.split(".").reduce((v, k) => v?.[k], o),
    },
  };
}
export function fixture() {
  globals();
  const users = new Collection();
  for (const id of ["alice", "bob", "outsider", "gm"])
    users.set(id, { id, name: id, active: true, isGM: id === "gm" });
  const actors = new Collection([
    ["a", new Actor("a", "alice")],
    ["b", new Actor("b", "bob")],
    ["v", new Actor("v", "gm")],
  ]);
  globalThis.game = {
    actors,
    users,
    user: users.get("gm"),
    scenes: new Collection(),
  };
  return {
    actors,
    users,
    a: actors.get("a"),
    b: actors.get("b"),
    gm: users.get("gm"),
    alice: users.get("alice"),
    bob: users.get("bob"),
  };
}
