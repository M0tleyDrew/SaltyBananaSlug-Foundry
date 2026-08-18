# SaltyBananaSlug's Card Games

A multiplayer Foundry VTT v13 module for:

- Texas Hold'em
- Five-Card Draw
- Blackjack

The module uses the supplied banana-slug artwork as its logo and card back.

## Requirements

- Foundry Virtual Tabletop v13
- [SocketLib](https://foundryvtt.com/packages/socketlib), enabled in the same world
- At least one connected Gamemaster while a game is being played

SocketLib is declared as a required dependency in `module.json`. It is used to send each hand only to the client that owns it rather than broadcasting every private card to every connected user.

## Installation

1. Extract the `saltybananaslug-card-games` folder into Foundry's `Data/modules/` folder.
2. Install and enable SocketLib if Foundry does not install it automatically.
3. Enable **SaltyBananaSlug's Card Games** in **Manage Modules**.
4. Reload the world.

There is no permanent on-screen launcher. Import `macros/fvtt-Macro-saltybananaslug-card-games-launcher.json` through the Foundry Macro Directory, or create a **Script** macro and paste in the contents of `macros/launch-card-games.js` (players need permission to use the imported macro). You can also use this code:

```js
const cardGames = game.modules.get("saltybananaslug-card-games");
if (!cardGames?.active) return ui.notifications.error("SaltyBananaSlug's Card Games is not enabled.");
await cardGames.api.launch();
```

The optional `/cards` chat command also opens the launcher.

## Lobby Flow

1. The launching user chooses Texas Hold'em, Five-Card Draw, or Blackjack.
2. They choose connected users to invite.
3. They choose the table stakes and house rules.
4. Invitations appear as private prompts.
5. If the GM is invited—or launches the game—the GM may select no NPCs and play as **The DM**, select one NPC, or select several NPCs and control one seat for each.
6. The game begins automatically when everyone accepts.
7. If anyone declines, the host is shown who declined and may cancel or begin with the users who accepted.

## Rules Implemented

### Texas Hold'em

- No-limit betting
- Rotating dealer button
- Correct heads-up blind and action order
- Small and big blinds
- Pre-flop, flop, turn, and river betting rounds
- Checks, calls, bets, raises, folds, and all-ins
- Automatic hand evaluation from the best five of seven cards
- Split pots and side pots
- Odd-chip distribution beginning left of the dealer
- Automatic showdown and payouts

### Five-Card Draw

- Antes
- No-limit opening and final betting rounds
- One draw phase
- Configurable maximum discard count, default 3
- Stand pat
- Discard-pile reshuffle when the remaining deck is exhausted
- Split pots, side pots, showdown, and automatic payouts

### Blackjack

- Single shuffled deck each round
- Configurable minimum and maximum bets
- Dealer hole card and peek for blackjack
- Blackjack pays 3:2
- Dealer hit/stand on soft 17 setting
- Hit, stand, double down, split, insurance, and late surrender
- Up to four hands after splits
- Split aces receive one card each and stand
- A 21 after a split is paid as a normal win rather than a natural blackjack
- Automated dealer play and settlement

## Privacy and Authority

The connected GM acts as the authoritative dealer. Each user receives a sanitized table view containing only their own private cards, plus cards that the rules require to be public at showdown.

Active tables are cached in the authoritative GM's browser and can resume after that GM refreshes on the same browser. Moving the game to a different GM browser does not transfer an active table.

## Host and GM Controls

The host or any connected GM may:

- Begin the next hand or round
- Add chips to a seat
- End the table

Players may hide and reopen their table window without leaving the game.

## Macro API

The module includes `macros/launch-card-games.js` and exposes:

```js
game.modules.get("saltybananaslug-card-games").api.launch();
```

This opens the game-creation flow.


## Version 1.0.1 Fixes

- Removed the permanent floating on-screen launcher.
- Added a ready-to-copy Foundry Script Macro.
- Fixed a SocketLib initialization race that could incorrectly report SocketLib as unavailable even while it was enabled.
- Added `socketStatus()` to the module API for troubleshooting.


### SocketLib note

This module declares `"socket": true` in `module.json`, which is required for SocketLib to register its private module channel.
