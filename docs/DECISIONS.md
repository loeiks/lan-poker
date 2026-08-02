# Design Decisions

Running log of decisions made while shaping LAN Poker. Every entry is
changeable — say the word and we revise it.

`POKER.md` = the rules of poker (hard set).
`README.md` = product sketch (evolving).
This file = the decisions that fill the gaps between them.

---

## 0. Design Principles

These justify most of what follows.

1. **The app replaces chips and hand-reading. Nothing else.** Cards are
   physical. Shuffling, dealing, burning, showdown reveals — all analog.
2. **Trust the players.** They are friends in one room. The physical
   showdown is the real anti-cheat. The app guards against typos and
   stale taps, not adversaries.
3. **Nobody busts out for the night.** Chip scarcity creates tension
   _within_ a hand, not across the evening. Credit modes exist so nobody
   sits out bored.
4. **Never block the table.** No data-entry requirement may freeze a live
   game. Admin can always declare a result and move on.
5. **Setup is 1-5 minutes, by one person, via env vars.** Non-technical
   players should never think about the app.
6. **LAN-local.** Effectively zero latency. Do not over-engineer for
   network conditions that do not exist here.

---

## 1. Table & Identity

| Decision              | Value                                                                     |
| --------------------- | ------------------------------------------------------------------------- |
| Tables per deployment | Exactly one, configured by env vars                                       |
| Config                | `TABLE_NAME`, `TABLE_MIN`, `TABLE_MODE`, `STARTING_BALANCE`, `ADMIN_NAME` |
| Defaults              | min `10`, mode `BURNOUT_CREDIT`, starting balance `70 × TABLE_MIN`        |
| Port                  | `1818`                                                                    |
| Auth                  | None. No passwords, no PIN.                                               |
| Player name           | Single word, lowercased on entry                                          |
| Identity              | **Lowercase name is the identity.** localStorage id is convenience only.  |
| Admin                 | Whoever joins as `ADMIN_NAME`. May play or spectate.                      |

**Rationale (identity):** cleared browser / new phone / incognito must not
create a second broke player. Typing your name back in reclaims your seat
and your balance. Two real friends named `ali` sort it out socially by
typing `ali2` — a social problem, not a software one.

**Changed from README:** default mode is now `BURNOUT_CREDIT`, not
`LOSS_BONUS`. Burnout has better game feel — you actually feel the bust,
then get rescued.

---

## 2. Credit Modes

Fire **only between hands**, never mid-hand. A player who busts finishes
the current hand as-is and is topped up before the next deal.

**Credit is claimed, not automatic.** A button appears: "You're broke —
take the credit." Automatic top-ups make chips feel weightless; pressing
the button preserves the sting and makes it a table moment. It also stops
a spectating player from silently accumulating.

### Definitions

- **spend(hand)** = total chips a player put into the pot during that hand,
  including blinds. Not net loss. Money returned as an uncalled bet
  (§3) does not count as spend.
- Hands the player sat out count as `spend = 0`.
- History crosses nights. There is no "session" concept — only "your last
  N hands." No Saturday-morning reset exploit.

### `BURNOUT_CREDIT` (default)

Triggers when a player's balance is `0` after a hand settles.

```
credit = clamp( 2 × Σ spend(last 3 hands),
                lower = 5  × TABLE_MIN,
                upper = 20 × TABLE_MIN )
```

- **Floor** exists so the player who folded three hands then busted on a
  blind isn't stranded with $0 — the exact failure the mode prevents.
- **Ceiling** stops the runaway case: three straight all-ins rescuing
  someone with a table-distorting stack.
- Ceiling (`20 × min`) is well below a fresh stack (`70 × min`) on
  purpose. Being rescued should not be as good as starting the night.

#### The 3-hand cooldown

Credit is not paid out immediately. On busting, the player sits out the
next **3 hands**, then may claim.

```
  hand 12  ── busts ──▶ credit computed and FROZEN at $140
  hand 13  ── sitting out, $140 pending (visible)
  hand 14  ── sitting out, $140 pending
  hand 15  ── sitting out, $140 pending
  hand 16  ── [ Claim $140 ]
```

**The amount is computed at bust time and frozen**, not recomputed at
claim time. This is essential: sitting out three hands would zero the very
spend history the formula reads, so every burnout would silently pay out
the floor and the dynamic sizing would be dead code.

Showing the pending amount during the wait turns the penalty into a
countdown rather than a void.

**A gift during the cooldown does not cancel the credit.** If a friend
transfers chips to a waiting player, they may play immediately _and_ still
claim the frozen credit when the 3 hands elapse. This looks generous, but
it self-corrects: credit is a loan that permanently hits their score
(§3b), so a rescued player is still behind on the leaderboard.

### `LOSS_BONUS`

Fires after every hand the player loses, regardless of balance.

```
bonus = floor( 0.15 × spend(this hand) )
```

Kept as documented. Note it is a constant slow drip rather than a
lifeline — it will rarely save anyone and it inflates every stack
slightly. That's the mode's character; friends choosing it know what
they picked.

### `DISABLED`

No credit. Broke players are out. Pair with a custom `STARTING_BALANCE`
if the group wants a game that actually ends.

---

## 3. Pots & All-Ins

**Full side pot support.** Chosen because side pots are the single
hardest thing to do with physical chips — the exact moment a real table
stops and argues. An app that can't do them hasn't replaced the hard part.

### Core rule

You can only win from each opponent as much as you put in yourself.
Do not track "the pot." Track each player's total contribution to the
hand, then slice horizontally at every distinct all-in level.

```
  contributions     enes $30   ali $80   zeynep $80   deniz $80 (folded)

     $80 ─┤         ░░░░░░░    ███████   ███████      ▓▓▓▓▓▓▓
          │         ░░░░░░░    ███████   ███████      ▓▓▓▓▓▓▓   SIDE POT
     $30 ─┤         ███████    ███████   ███████      ▓▓▓▓▓▓▓   ─────────
          │         ███████    ███████   ███████      ▓▓▓▓▓▓▓   MAIN POT
      $0 ─┘

  MAIN  $30 × 4 = $120   eligible: enes, ali, zeynep
  SIDE  $50 × 3 = $150   eligible: ali, zeynep
```

**Contribution and eligibility are separate facts.** Folded players' chips
still fill the pots; folded players are eligible for nothing.

Pot construction is a pure function of the hand's contribution map.
Awarding is the same function whether the app evaluated the cards or the
admin tapped a name.

### Decided sub-rules

**Uncalled bet return — YES.** If a player bets more than anyone can
match, the unmatched excess is returned to them before showdown and never
becomes a pot. It also does not count toward `spend`. Prevents "winning"
your own money back and inflating your burnout credit.

**All players all-in → skip to showdown.** When no further betting is
possible, the app stops requesting actions. Remaining board cards are
reveals, not streets. Admin enters them whenever convenient, or just
declares the winner.

**Ties — even split, odd chip left of the dealer.** Standard rule, and it
keeps every balance a whole number forever. No fractional chips, ever.

**Live pot visibility — total by default, breakdown once split.** A single
`POT $270` is actively misleading to an all-in player who can only win
$120 of it. So: show one number normally, and the moment an all-in
creates a second pot, show the layers.

**Manual declaration with side pots — one tap per pot**, eligible names
filtered per pot, multi-select for ties. Only appears when side pots
exist; the common case stays a single tap.

---

## 3b. Leaderboard & Ending the Night

**Credit is a loan, not a gift.** Every chip taken from the credit system
is permanently subtracted from your standing. This is what keeps chips
meaningful while still guaranteeing nobody sits out bored.

```
score = balance − STARTING_BALANCE − totalCreditTaken
```

Subtracting the starting balance means everyone begins at exactly `0` and
the number reads directly as "how much am I up or down tonight."
Negative scores are correct and expected — that's the player who has been
rescued twice.

```
  ┌────────────────────────────────────────────────┐
  │  #   player    balance    credit      score    │
  ├────────────────────────────────────────────────┤
  │  1   zeynep      $980       $0       +$280     │
  │  2   ali         $840       $0       +$140     │
  │  3   enes        $760      $140       −$80     │
  │  4   deniz       $310      $200      −$590     │
  └────────────────────────────────────────────────┘
             STARTING_BALANCE = $700 (70 × $10)
```

- **Live leaderboard** is visible during play, using the same formula.
  Everyone always knows who is actually winning.
- **Admin taps "Finish"** whenever the group decides to stop. Final
  leaderboard, session archived. There is no fixed end condition — the
  night ends when friends say it ends.
- Finishing does not wipe balances. Play resumes tomorrow from here.

---

## 3c. Player-to-Player Transfers

Any player may send chips to any other player. Primary uses: settling
real-life side bets, and hand-gifting a broke friend when the table mode
is `DISABLED`.

| Decision           | Value                                                  |
| ------------------ | ------------------------------------------------------ |
| When               | **Only while no hand is in progress.** Never mid-hand. |
| Approval           | None — instant, one-way. Trust model.                  |
| Visibility         | Broadcast to everyone and written to the event log     |
| Counts as `spend`? | No. Transfers are not betting.                         |
| Effect on score    | Natural — sender's score drops, receiver's rises       |

**Mid-hand transfers are forbidden** because they would let a player
top up mid-betting-round, which breaks all-in and side pot math at its
root (contribution ceilings must be fixed once a hand starts).

Transfers exist to replace the real-life gesture of sliding a friend a few
chips. That is why there is no approval step — an approval flow would be
more ceremony than the physical act it replaces.

The give-it-away-then-claim-credit exploit is handled by the credit
cooldown in §2, which applies to every bust uniformly rather than
singling out transfers.

---

## 4. Cards

**Fully optional input.** The app never requires card data to proceed.

```
   admin enters board (0-5 cards, whenever)
   players enter their own 2 hole cards (whenever, or never)
              │
              ├─ enough data ──▶ app evaluates, shows each player their
              │                   own live hand rank, auto-awards pots
              │
              └─ not enough  ──▶ admin taps the winner, app moves on
```

- Hole cards are censored on the player's own screen by default; single
  tap reveals for 5 seconds. This protects against shoulder-surfing, not
  against a hostile client — and that is the correct threat model.
- **Duplicate card detection** is the one real validation: all entered
  cards across board + all hands must be distinct. A collision is almost
  always a typo. Surface it, don't punish it.
- A player who folded never needs to enter cards.

---

## 5. Turn Handling & Device Lifecycle

**No turn clock. No auto-fold. No admin acting for players.** Everyone is
in the same room and can see whose turn it is — social pressure is a
better timeout than code. The table simply waits, showing
`waiting on enes`.

Phones lock, unlock, and background constantly. This is a first-class
case, not an edge case:

```
   join ──▶ [ id in localStorage ]
                    │
                    ▼
          ┌──────────────────┐
          │   CONNECTED      │◀────────┐
          └────────┬─────────┘         │ reconnect →
                   │ lock / background │ full state snapshot
                   ▼                   │
          ┌──────────────────┐         │
          │  DISCONNECTED    │─────────┘
          │  seat held       │
          │  chips safe      │
          │  still in hand   │
          └──────────────────┘
```

- **Disconnection is invisible to the game.** Locking your phone never
  folds you, never forfeits chips, never frees your seat.
- **Reconnect sends a full state snapshot, never a diff.** Refresh,
  reconnect, and first load are one code path. Idempotent.
- **Unlock-to-playable must be instant.** No spinners, no multi-step
  rehydration. The snapshot is small; render it directly. This is a LAN —
  do not build latency compensation, optimistic UI, or reconciliation
  logic for a problem that doesn't exist here.
- **Every player action carries the last-known sequence number.** A phone
  waking up on a stale screen and tapping "call" is rejected if the
  sequence moved on. This is the main defense against honest mistakes.

---

## 6. State & Persistence

**Server is authoritative.** Clients send intents and render state. Zero
game logic on the client.

**Event-sourced.** Every action is an immutable row; current state is a
fold over the event log. Chosen because:

- Docker restarts and laptop sleeps mid-hand must not lose the table
- Credit formulas need per-hand spend history anyway
- "Wait, how much did I bet?" is answerable, ending arguments
- Admin corrections become compensating events rather than destructive edits

Persisted across nights: player identities, balances, and full hand
history. Ephemeral, re-derived each session: seating, positions, dealer
button.

Transport: **WebSocket**. Traffic is mostly server→client broadcast, with
player intents going the other way over the same socket.

---

## 7. Hand State Machine

```
              ┌──────────┐
     ┌───────▶│  LOBBY   │  players join, mark ready
     │        └────┬─────┘
     │             │ admin: START (≥2 ready)
     │             ▼
     │        ┌──────────┐
     │        │  BLINDS  │  SB/BB auto-posted and deducted,
     │        └────┬─────┘  both players explicitly notified
     │             ▼
     │   ┌─────────┐ ┌──────┐ ┌──────┐ ┌───────┐
     │   │ PREFLOP │▶│ FLOP │▶│ TURN │▶│ RIVER │
     │   └────┬────┘ └───┬──┘ └───┬──┘ └───┬───┘
     │        └──────────┴────────┴────────┘
     │                   │
     │   all but one fold┤ or river betting closes
     │   or all all-in ──┤
     │                   ▼
     │             ┌──────────┐
     │             │ SHOWDOWN │  evaluate, or admin declares
     │             └────┬─────┘
     │                  ▼
     │             ┌──────────┐
     └─────────────│  SETTLE  │  build pots, award, apply credits,
        rotate btn └──────────┘  rotate button clockwise
```

Betting round closes when every active player has acted **and** all
contributions are equal (or the player is all-in).

**Mid-hand joiners spectate** until the hand settles, then may ready up.

**Initial dealer is picked by admin** before each hand from the admin panel,
taking priority over the automatic rotation. If no dealer is explicitly chosen,
the app auto-detects from seat order.

### Heads-up (exactly 2 players)

Blind rules invert, per standard poker. POKER.md documents the 3+ player
case only; this is an addition, not a contradiction.

```
   3+ players            heads-up (2 players)
   ──────────            ────────────────────
   BTN, then SB, BB      BTN *is* the SB
   UTG acts first        BTN acts FIRST preflop
   BTN acts last         BTN acts LAST on flop/turn/river
```

Worth handling properly rather than treating as an edge case: heads-up is
the natural end state of any night as people drift off to bed.

### Table can't start

If fewer than 2 players have a non-zero balance and are ready, show an
explicit **"waiting for players"** state rather than a dead Start button.

**Raise stepper:** raises are multiples of `TABLE_MIN` (per README) rather
than the casino "at least the previous raise" rule — simpler, and it maps
to a `+`/`−` stepper on a phone. All-ins are exempt from the stepper.

---

## 7b. Mistakes, Leaving, and Escape Hatches

**Admin balance adjustment is in v1.** A plain "set enes to $340", logged
and broadcast to everyone. Rationale: someone will tap Fold instead of
Call on a phone, in a room, late at night — and we will ship bugs. This is
the single escape hatch that covers every category of mistake we haven't
imagined. It is cheap, and its absence is unrecoverable.

Real undo (compensating events, replaying a hand) stays deferred.

**Leaving the table.** A player who goes home:

```
  ─ seat is freed
  ─ balance frozen and preserved
  ─ still appears on the leaderboard with their final score
  ─ rejoins any time by typing their name again
```

---

## 8. Scope

Everything discussed above is **in v1**, including card entry and hand
evaluation. Deliberately deferred: hand history browser, stats/graphs,
multiple tables, undo/corrections, sound, animations, chat.

---

## Open

_(None — all design questions resolved.)_

---

## Tunable Values

These house rules are configurable. All live in environment variables (see `README.md` for the full table).

| Value                    | Env Var            | Default               | Location                    |
| ------------------------ | ------------------ | --------------------- | --------------------------- |
| Table minimum bet        | `TABLE_MIN`        | `10`                  | `src/services/AppConfig.ts` |
| Credit mode              | `TABLE_MODE`       | `BURNOUT_CREDIT`      | `src/services/AppConfig.ts` |
| Starting balance         | `STARTING_BALANCE` | `70 × TABLE_MIN`      | `src/services/AppConfig.ts` |
| Admin name               | `ADMIN_NAME`       | _(none)_              | `src/services/AppConfig.ts` |
| DB file path             | `DB_FILENAME`      | `./data/table.sqlite` | `src/server/main.ts`        |
| Server port              | _(hardcoded)_      | `1818`                | `src/server/main.ts`        |
| Credit cooldown hands    | _(hardcoded)_      | `3`                   | `src/rules/credit.ts`       |
| Burnout multiplier       | _(hardcoded)_      | `2`                   | `src/rules/credit.ts`       |
| Burnout floor            | _(hardcoded)_      | `5 × TABLE_MIN`       | `src/rules/credit.ts`       |
| Burnout ceiling          | _(hardcoded)_      | `20 × TABLE_MIN`      | `src/rules/credit.ts`       |
| Loss bonus rate          | _(hardcoded)_      | `15%`                 | `src/rules/credit.ts`       |
| Raise step               | _(hardcoded)_      | `TABLE_MIN`           | `src/rules/betting.ts`      |
| Minimum players per hand | _(hardcoded)_      | `2`                   | `src/state/fold.ts`         |

The hardcoded values can be extracted to env vars if the table group wants custom rules; the locations above are the single source for each.
</content>
</invoke>
