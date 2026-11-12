# SaltyBananaSlug's Card Games — 1.1.3

Foundry v13 multiplayer tables with GM-authoritative dealing, private hands, and macro launchers.

## Games

| Game | Seats | Stakes and rules |
| --- | --- | --- |
| Texas Hold'em | 2–10 | No-limit, blinds, four streets, best five of seven, side pots and odd chips |
| Five-Card Draw | 2–8 | Ante, two betting rounds, one configurable draw |
| Blackjack | 1–7 | Single deck, dealer peek, 3:2 naturals, splits, doubles, insurance, late surrender |
| Euchre | Exactly 4 | Seats 1 & 3 vs 2 & 4; 24 cards, bowers, follow suit, loners, first team to 10 |
| Baccarat | 1–7 | Shared eight-deck punto banco coup; bets lock before reveal; standard third-card tableau |
| Casino War | 1–7 | Shared dealer and single deck per round; bets lock before the deal; ace high; surrender or war on a tie |
| Jacks or Better | 1–7 | Independent 9/6 video poker; select cards to **KEEP**, then draw once |
| Slug Slots | 1–7 | Three independent reels, fixed weights, visible paytable |

Every table has **Rules & Payouts**. This describes the actual implemented variant, returns, and optional house rules. A GM can host/deal without taking a seat, which allows four players to play Euchre while the GM manages the table. The dealer-only GM sees public cards and table status, not private hands. Hosts or GMs advance rounds and end tables.

## Launch and install

Requires Foundry VTT v13 and an enabled SocketLib module. Character currency mode requires D&D-style `actor.system.currency` with cp/sp/ep/gp/pp.

Extract the module folder into `Data/modules`, enable it, then reload **every connected client**. Keep all clients on the same version. There is no permanent on-screen launcher.

Use the included `macros/launch-card-games.js`, import `macros/fvtt-Macro-saltybananaslug-card-games-launcher.json`, or create a Script macro:

```js
const module = game.modules.get("saltybananaslug-card-games");
if (!module?.active) return ui.notifications.error("Enable Card Games first.");
await module.api.launch();
```

`/cards` also opens the launcher. Choose a game, invite connected users, choose betting mode and rules, then select your seat. Invitees explicitly accept the mode and choose their own wagering character. For fun tables, GMs may choose multiple NPC seats or host without playing.

## Fun chips or actual character coins

**Fun mode** defaults to 500 free chips. It never changes character currency. The host/GM can add free chips.

**Character currency** uses **1 chip = 1 gp**. Each participant chooses an owned actor and a whole-gold table bankroll up to the launcher's starting-chip limit. The actor must be able to cover that bankroll initially. The bankroll is a spending limit, not an up-front buy-in: bets reduce the actor's real coins as they are committed; payouts add real coins as they settle. Starting the table never grants free gold. Wins can increase the available table stack. A character's additional funds outside the chosen bankroll are not added to the stack automatically.

CP/SP/EP/GP/PP are converted at standard D&D rates. Automatic change can rearrange the coin denominations. Half-chip blackjack payouts and 5% Baccarat commission are preserved exactly in smaller coins. Real tables reject overdrafts and disable free-chip top-ups. One actor can fund only one active currency table. A GM's optional **The DM — house seat** uses a virtual house bankroll without an actor wallet; NPC/PC-backed seats use their actual coins. The house is an unlimited game bank, not a linked NPC treasury.

For poker and blackjack, wagers and payouts update during the hand. Instant casino outcomes apply their net result atomically. Euchre charges a fixed stake from every seat once per **match**, keeps it through successive hands, then returns twice that stake to each winning partner when their team reaches 10.

**End Table** refunds unresolved poker/blackjack wagers, unresolved video/War stakes, or an unfinished Euchre match. Already completed casino outcomes and completed hands remain applied. End a currency table through this control to release its actor locks. Hiding or closing the window does not end a table; reopen with `module.api.reopen()`.

## Currency authority and recovery

One active dealer GM serializes actions. Actions carry table revisions, so stale or repeated controls cannot spend twice. The requester is checked against SocketLib's caller context, and only a seat owner can play that seat. Outsiders cannot request a table view.

Before actor updates, a pending transaction journal is saved in the dealer GM's browser. Every actor update writes currency and its transaction receipt together. After a partial failure or a reload, the next request retries unfinished updates and skips receipts that were already applied. Insufficient funds reject the wager before table state is committed. A recovery error blocks further actions until it can finish.

Active tables and pending transactions are stored in **that GM browser for that world**. Continue with the same GM account/browser and keep its site data. Active currency tables do not migrate to a different GM/browser, and deleting the cache can lose recovery state and leave actor locks. Finish tables before changing dealer/browser or clearing browser data. Other modules or manual edits can also spend currency outside this table; available funds are checked again on each wager.

## Card artwork

Includes all ten supplied images unchanged: two visual variants for each ace and the red/black jokers. Each physical ace chooses one variant when the GM builds the deck; its ID, suit and value do not change. Artwork is synchronized and stable through redraws, with exactly one ace per suit in a standard deck.

Jokers are not inserted into poker, blackjack, Baccarat, War, or Jacks or Better. Both joker images appear in slots. Euchre offers an explicitly optional **25-card highest-trump joker** variant; ordinary 24-card Euchre is the default. If the optional joker is the upcard, it is placed under the kitty and the next suited card is exposed. This is a documented house convention. No defender loners or Canadian partner-order-up restrictions are implemented. Stick the Dealer is a separate optional setting.

## Welch/Marl face cards

Each of the twelve face-card identities has **four different custom illustrations**, plus the existing standard face. Every one of the five choices has **20% probability**, independently selected for each physical card when the dealer constructs its deck. This means 48 custom illustrations total, not extra playable cards. The standard deck remains 52 cards. Choices are carried with the card and stay consistent for all viewers throughout that deck's use. Previously created decks keep their current artwork until a new deck is built.

Custom cards always display **J, Q or K and the correct suit in both corners**, on opaque parchment index tabs. Hearts/diamonds are red; spades/clubs black. Artwork color does not change a card's suit. Hover for its subject name. The existing ace variants and jokers remain available as before.

| Suit | Jack | Queen | King |
| --- | --- | --- | --- |
| Spades | Ren, captain of the Wandering Wayfarer | Blighted vampire | Captain of the Filth |
| Hearts | Iron Maiden, warforged priest of the Slurry | Golgothan | Evol, god of second chances |
| Diamonds | Marl road zombie | Wandering Wayfarer turtle tavern | Mac, god of light and farming |
| Clubs | Paladin of the Filth | Blighted vampire road encounter | Gary, rainbow unicorn god of carnage |

Evol and Iron Maiden were matched to the existing character portraits. Mac uses the established Mac-from-*It's Always Sunny* likeness and red/gold robes. Gary uses his established **humanoid** white-unicorn head, rainbow mane, psychedelic robes, jewelry and gleeful murderous personality, rather than a four-legged horse. Gary is shared between the AI and Welch campaigns.

Open `card-gallery.html` from this module folder to see all four custom versions and the standard face for every J/Q/K, with readable rank/suit labels. Full prompt descriptions are retained in `assets/cards/faces/catalog.json`. Generated artwork is optimized as WebP for table use. First-pass unused art is preserved separately in `assets/bonus-illustrations`; it is never rolled as a card face and is not labelled as a canonical character.

## Payouts

Returns below include the original stake; zero means the stake is lost.

- Baccarat: Player 2×; Banker 1.95× after commission; Tie 9×. A tie pushes Player/Banker bets.
- War: initial win 2×. After matching the original stake for war, a win returns 3× the original stake, a second tie 4×, loss zero. Surrender returns half of the original stake. No tie side bet.
- Video poker: Jacks-or-better pair 1×, two pair 2×, trips 3×, straight 4×, flush 6×, full house 9×, quads 25×, straight flush 50×, royal 800×. Royal always pays 800×; there is no max-coin bonus requirement.

Slug Slots has 20 equally likely stops on each reel. Only three identical symbols pay:

| Symbol | Stops per reel | Total return | Probability per spin |
| --- | ---: | ---: | ---: |
| Cherry | 8 | 8× | 512/8000 |
| Lemon | 5 | 12× | 125/8000 |
| Bell | 3 | 25× | 27/8000 |
| Banana | 2 | 50× | 8/8000 |
| Joker | 1 | 100× | 1/8000 |
| Seven | 1 | 500× | 1/8000 |

This is an original SBS machine with a theoretical return of **90.8875%**. Spins are independent; odds never change based on past outcomes. Joker art alternation is cosmetic.

## Rules audit and validation

The 1.1.0 audit fixed short-all-in reopening, cumulative short-raise reopening, action cycling past players who already completed their turn, short-blind all-in runouts, and Five-Card Draw dealing to players all-in from the ante. Blackjack now preserves fractional natural and surrender payouts. The original split test fixture was made deterministic so a random initial blackjack payout cannot alter its starting balance.

Rules were checked against these references; the settings and variations above define this module's exact behavior:

- [Bicycle: Hold'em](https://bicyclecards.com/how-to-play/texas-holdem-poker), [Blackjack](https://bicyclecards.com/how-to-play/blackjack/), [Euchre](https://bicyclecards.com/how-to-play/euchre).
- [Poker TDA: no-limit reopening rules](https://www.pokertda.com/view-poker-tda-rules/).
- [OLG PlaySmart: Baccarat](https://www.playsmart.ca/table-games/baccarat/how-to-play).
- [MGM National Harbor: War](https://assets.contentstack.io/v3/assets/bltc6ce635bc4868eb2/bltbbcdcebd2d511664/mgm-national-harbor-casino-table-games-war.pdf).

Run `node --test saltybananaslug-card-games/tests/*.mjs` for engine, rules, privacy, currency, revision, and failure-recovery checks. The Playwright browser test (`tests/browser.cjs`) exercises actual launcher controls, real-wallet settlement, five-client Euchre, GM spectator hosting, all game views, and image loading in a simulated Foundry/SocketLib environment. It requires Playwright; `PARTY_VIEWER_CHROMIUM` may point to a Chromium executable. These checks do not replace testing in a live Foundry world.

### Shared table rounds (1.1.3)
War and Baccarat wait for every funded seat to bet, then reveal one shared table deal. War uses the same dealer card for everyone; tied seats lock their decisions before a shared second dealer card is drawn. Video poker and slots remain individual hands/spins. End and recreate any War or Baccarat table left open from an older version.
