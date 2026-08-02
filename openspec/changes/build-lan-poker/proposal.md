## Why

Friends want to play No Limit Texas Hold'em at home but often have no chips —
and playing for real money is not the point. Tracking bets on paper is
error-prone, side pots after an all-in reliably stop the game for a five-minute
argument, and nobody can agree who won a marginal showdown.

LAN Poker replaces exactly two things humans are bad at: **tracking chips** and
**reading hands**. Everything else — the deck, shuffling, dealing, burning,
revealing at showdown — stays physical, because that is the part that is fun.

The bar is a group of friends in one room on shared WiFi, set up by one person
in under five minutes, played on phones that lock and unlock constantly.

## What Changes

This is a greenfield application. Everything is new.

**Table & setup**

- Single table per deployment, configured entirely by environment variables
  (`TABLE_NAME`, `TABLE_MIN`, `TABLE_MODE`, `STARTING_BALANCE`, `ADMIN_NAME`).
  No setup UI.
- Served over LAN on port `1818`; players join by typing a single lowercase name.
- No authentication of any kind. The trust model is "friends in one room" — the
  physical showdown is the real anti-cheat.

**Gameplay**

- Full No Limit Texas Hold'em betting: blinds, preflop/flop/turn/river, and the
  check / call / raise / fold / all-in action set.
- Raises are multiples of `TABLE_MIN` (stepper-friendly on phones); all-ins are
  exempt from the stepper.
- Dealer button picked at random, then rotated clockwise each hand.
- Heads-up blind inversion handled properly (button posts the small blind, acts
  first preflop and last thereafter) — this is the natural end state of a night.
- **Full side pot support** with per-pot eligibility, uncalled-bet return, and
  even split with the odd chip going left of the dealer.

**Cards (optional input)**

- Admin may enter board cards; players may enter their own two hole cards.
- When enough cards exist, the app evaluates hands, shows each player their own
  live hand rank, and awards pots automatically.
- When they do not, the admin simply declares the winner and play continues.
  **Card entry must never block a live table.**
- Hole cards are censored on-screen with tap-to-reveal for 5 seconds.
- Duplicate card detection catches typos.

**Chip economy**

- Balances persist across nights; a session resumes where it left off.
- Three credit modes — `BURNOUT_CREDIT` (default), `LOSS_BONUS`, `DISABLED` —
  so nobody is eliminated for the night unless the group chooses that.
- Burnout credit is dynamically sized from recent spending, floored, capped, and
  **frozen at bust time**, then claimable after a 3-hand cooldown.
- Player-to-player transfers, replacing the real-life gesture of sliding a friend
  a few chips.
- Admin balance adjustment as the universal escape hatch for misclicks and bugs.

**Leaderboard**

- Live standings during play, scored as
  `balance − STARTING_BALANCE − totalCreditTaken`, so credit is a **loan** that
  permanently follows you and chips keep their weight.
- Admin ends the night whenever the group decides; a final leaderboard is shown
  and balances carry forward.

**Realtime & resilience**

- Server-authoritative state; clients send intents and render, with zero game
  logic on the client.
- WebSocket broadcast, with reconnect delivering a **full state snapshot** rather
  than a diff, so refresh, reconnect, and first load are one code path.
- Locking a phone never folds you, never frees your seat, never costs chips.
- Actions carry a sequence number so a stale screen cannot act on old state.
- Event-sourced persistence survives Docker restarts mid-hand.

## Capabilities

### New Capabilities

- `table-setup`: Environment-driven configuration of the single table, defaults,
  admin designation, and the "waiting for players" state.
- `player-identity`: Joining by lowercase name, identity reclaim across devices
  and nights, ready/spectator states, mid-hand joiners, and leaving the table.
- `hand-lifecycle`: The hand state machine — blinds, betting streets, the legal
  action set, betting-round closure, dealer rotation, heads-up rules, and
  skip-to-showdown when no betting remains possible.
- `pot-settlement`: Contribution tracking, side pot construction and eligibility,
  uncalled-bet return, tie splitting, and awarding — by evaluation or by admin
  declaration.
- `card-entry`: Optional board and hole card entry, 7-card hand evaluation, live
  hand rank display, duplicate detection, and on-screen censoring.
- `chip-economy`: Balances, the three credit modes, burnout freezing and cooldown,
  player transfers, and admin balance adjustment.
- `leaderboard`: Live and final standings, the score formula, and ending the night.
- `realtime-sync`: WebSocket transport, full-snapshot reconnection, sequence-guarded
  actions, event-sourced persistence, and cross-night continuity.

### Modified Capabilities

None — this is the first change in the project.

## Impact

- **New codebase.** TanStack Start (with TanStack Router) on Vite, React,
  Tailwind CSS, shadcn/ui, SQLite, and Effect. Packaged as a single Docker
  container exposing port `1818`.
- **New dependencies** beyond the current `effect` + `shadcn` + `typescript`
  baseline in `package.json`.
- **TDD throughout.** Pot construction, hand evaluation, credit formulas, and the
  betting state machine are pure functions with no I/O, and are specified by tests
  first — these are the parts that must stay correct as rules get tweaked later.
- **Docs**: `README.md` (product sketch) and `DECISIONS.md` (design decisions with
  rationale) are the source material for these specs. `POKER.md` holds the rules
  of poker itself and is treated as fixed.
- **No external network dependencies** — the app must work fully offline on a LAN.
