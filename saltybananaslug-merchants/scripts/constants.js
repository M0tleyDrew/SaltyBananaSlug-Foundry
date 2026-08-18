export const MODULE_ID = "saltybananaslug-merchants";
export const MODULE_TITLE = "SaltyBananaSlug's Merchants";
export const SOCKET_NAME = `module.${MODULE_ID}`;
export const INVENTORY_FOLDER = "SBS Merchant Inventories";
export const SHELL_FOLDER = "SBS Merchant Shells";
export const JOURNAL_ROOT_FOLDER = "SBS Merchants";

export const COINS = ["cp","sp","ep","gp","pp"];
export const COIN_CP = {cp:1, sp:10, ep:50, gp:100, pp:1000};

export const SHOP_TYPES = {
  general:"General Goods", blacksmith:"Blacksmith", armorer:"Armorer", weaponsmith:"Weaponsmith",
  alchemist:"Alchemist", apothecary:"Apothecary", magic:"Magic Shop", jeweler:"Jeweler",
  books:"Bookseller", tailor:"Tailor", inn:"Innkeeper", stable:"Stable", artificer:"Artificer",
  temple:"Temple / Religious Goods", fence:"Fence", traveling:"Traveling Merchant", food:"Food Vendor",
  curio:"Curio Shop", pawn:"Pawn Shop", custom:"Custom"
};

export const SPECIES = {
  human:"Human", elf:"Elf", dwarf:"Dwarf", halfling:"Halfling", gnome:"Gnome", orc:"Orc",
  tiefling:"Tiefling", dragonborn:"Dragonborn", goblin:"Goblin", kobold:"Kobold", tabaxi:"Tabaxi",
  goliath:"Goliath", aasimar:"Aasimar", kenku:"Kenku", lizardfolk:"Lizardfolk", vampire:"Vampire", skeleton:"Skeleton", wraith:"Wraith", generic:"Generic Humanoid"
};

export const MERCHANT_STYLES = {
  trader:"Trader", blacksmith:"Blacksmith", alchemist:"Alchemist", arcane:"Arcane Merchant",
  innkeeper:"Innkeeper", priest:"Priest", shady:"Shady Dealer", traveler:"Traveling Merchant"
};

// These are visual sprite presentations, not character identity categories.
// A GM can choose whichever silhouette/build fits the NPC.
export const PRESENTATIONS = {
  androgynous:"Androgynous / Neutral",
  masculine:"Masculine",
  feminine:"Feminine",
  sturdy:"Sturdy / Broad",
  slender:"Slender / Elegant"
};

export const TOKEN_COLORS = {
  none:"Natural", red:"Red", orange:"Orange", gold:"Gold", green:"Green", teal:"Teal",
  blue:"Blue", purple:"Purple", pink:"Pink", gray:"Gray", white:"White"
};
export const TOKEN_TINTS = {
  none:null, red:"#d96b6b", orange:"#e59555", gold:"#e4c464", green:"#83b16f", teal:"#68b7aa",
  blue:"#77a6d8", purple:"#a386d8", pink:"#d98ab3", gray:"#a6a6a6", white:"#ffffff"
};

export function builtInMerchantImage(species="human", style="trader", presentation="androgynous") {
  const s = SPECIES[species] ? species : "generic";
  const st = MERCHANT_STYLES[style] ? style : "trader";
  const pr = PRESENTATIONS[presentation] ? presentation : "androgynous";
  return `modules/${MODULE_ID}/assets/merchants-v014/${s}-${st}-${pr}.svg`;
}

export const DEFAULT_FAVOR_LEVELS = [
  {id:"hated", name:"Hated", sellRate:150, buyRate:30},
  {id:"unfriendly", name:"Unfriendly", sellRate:120, buyRate:45},
  {id:"neutral", name:"Neutral", sellRate:100, buyRate:60},
  {id:"friendly", name:"Friendly", sellRate:90, buyRate:70},
  {id:"favored", name:"Favored", sellRate:80, buyRate:80},
  {id:"beloved", name:"Beloved", sellRate:70, buyRate:90}
];

export const DEFAULT_CONFIG = {
  isMerchant:true,
  merchantId:"",
  name:"Merchant",
  shopType:"general",
  customShopType:"",
  description:"",
  gmNotes:"",
  status:"open",
  tokenMode:"generated", // generated | linked
  linkedTokenUuid:"",
  species:"human",
  presentation:"androgynous",
  merchantStyle:"trader",
  tokenColor:"none",
  tokenImage:builtInMerchantImage("human","trader","androgynous"),
  customImage:"",
  saveCustomImage:false,
  interactionDistance:10,
  pricing:{sellRate:100,buyRate:60,rounding:"nearest"},
  favor:{levels:DEFAULT_FAVOR_LEVELS, defaultLevelId:"neutral", relations:{}},
  buyingRules:{
    acceptedTypes:[], // [] = all
    acceptMagic:true, acceptMundane:true, acceptUnidentified:true, acceptZeroValue:false, acceptEquipped:false,
    resellBoughtItems:"yes" // yes | hidden | no
  },
  treasury:{
    currency:{cp:0,sp:0,ep:0,gp:500,pp:0},
    unlimited:false,
    maxFundsCp:100000, // 1000 gp
    addCustomerPayments:true,
    capAtMaximum:true
  },
  restock:{mode:"manual", tableUuid:"", restoreTreasury:false},
  sound:{enabled:false,path:"",volume:0.8,audience:"players"},
  journal:{visibility:"gm",selectedUserIds:[]},
  inventory:[]
};
