# Changelog

## 1.1.3
- War now deals from one shared deck with one dealer hand for the table.
- War and Baccarat lock all funded seats’ bets before revealing shared cards.
- War decisions lock before the second dealer card; shared cards appear centrally for players and observers.
- Closing unfinished rounds refunds pending Baccarat bets and additional War stakes.


## 1.1.2

- Added 48 Welch/Marl face-card illustrations: four distinct versions of each J/Q/K in each suit.
- Each custom version and the standard card face has an equal 20% chance per physical card when the deck is made. Deck contents, card values and rules are unchanged.
- Custom face cards retain clear J/Q/K and suit indices in both corners, plus a named-subject tooltip. Hearts and diamonds have red indices; spades and clubs have black indices.
- Matched Evol and Iron Maiden to established portraits; Mac uses his established red/gold, Always Sunny-inspired identity, and Gary is the humanoid rainbow god of carnage from both campaigns.
- Included an artwork gallery and preserved unused first-pass illustrations in a bonus folder, excluded from card selection.


## 1.1.1

- Tens now display as **10** on every card face, in card labels, and in table logs. Internal card IDs and numeric values remain compatible with existing tables.


## 1.1.0

- Added currency/fun modes, actor selection and bankrolls, exact coin updates, transaction receipts, pending-journal recovery, revision checks, and unfinished-wager refunds.
- Added Euchre, Baccarat, Casino War, Jacks or Better, and Slug Slots, with in-table rules and payout descriptions.
- Added GM hosting without a playing seat.
- Bundled supplied ace variants and jokers; synchronized random artwork per physical ace.
- Corrected poker reopening/action order/all-in edge cases, draw dealing after an all-in ante, and fractional blackjack payouts.
- Added engine, authority, wallet, recovery, privacy, and multi-client browser checks.


## 1.0.2
- Added the required top-level `"socket": true` manifest flag so SocketLib can register the module channel.
- Bumped the exposed module API version to 1.0.2.

## 1.0.1

- Removed the floating launcher button.
- Added `macros/launch-card-games.js`.
- Made SocketLib registration resilient to module load order and delayed API availability.
- Added differentiated errors for missing, disabled, and unavailable SocketLib states.

## 1.0.0

- Initial release.
