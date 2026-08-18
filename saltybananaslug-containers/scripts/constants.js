export const MODULE_ID = "saltybananaslug-containers";
export const MODULE_TITLE = "SaltyBananaSlug's Containers";
export const LNK_ID = "LocknKey";
export const LNK_CONTAINER_TYPE = "LTSBSContainer";
export const SOCKET_NAME = `module.${MODULE_ID}`;
export const INVENTORY_FOLDER = "SBS Container Inventories";
export const SHELL_FOLDER = "SBS Container Shells";
export const JOURNAL_ROOT_FOLDER = "SBS Containers";

export const TYPES = {
  chest: "Chest",
  strongbox: "Strongbox",
  crate: "Crate",
  box: "Box",
  barrel: "Barrel",
  cabinet: "Cabinet",
  cupboard: "Cupboard",
  wardrobe: "Wardrobe",
  drawer: "Drawer",
  desk: "Desk",
  bookshelf: "Bookshelf",
  "weapon-rack": "Weapon Rack",
  safe: "Safe",
  sack: "Sack",
  backpack: "Backpack",
  coffin: "Coffin",
  "display-case": "Display Case",
  locker: "Locker",
  other: "Other"
};

export function defaultImages(type="chest") {
  const t = TYPES[type] ? type : "other";
  return {
    closed: `modules/${MODULE_ID}/assets/icons/${t}-closed.png`,
    open: `modules/${MODULE_ID}/assets/icons/${t}-open.png`,
    locked: `modules/${MODULE_ID}/assets/icons/${t}-locked.png`
  };
}

export const DEFAULT_PERMISSIONS = {
  open: "all",
  close: "all",
  inspect: "open",
  deposit: "all",
  withdraw: "all",
  selectedUserIds: []
};

export const DEFAULT_CONFIG = {
  isContainer: true,
  name: "Wooden Chest",
  type: "chest",
  customType: "",
  description: "",
  state: "closed",
  images: defaultImages("chest"),
  permissions: {...DEFAULT_PERMISSIONS},
  distance: 5,
  lock: {
    enabled: false,
    startLocked: false,
    keyId: "",
    createKey: false,
    keyName: "",
    password: "",
    pickDC: 15,
    breakDC: 20,
    attempts: -1,
    requiredSuccesses: 1,
    specialLockpick: "",
    lockOnClose: false
  },
  journal: {
    visibility: "gm",
    selectedUserIds: [],
    originalSnapshot: true,
    transactionLog: true
  },
  capacity: {
    mode: "unlimited",
    maxItems: 0,
    maxWeight: 0,
    allowedTypes: []
  },
  emptyBehavior: "stay",
  currency: {cp:0, sp:0, ep:0, gp:0, pp:0}
};
