Tasks follow the inside-out TDD order from design.md D8: rules first with no
I/O, then persistence, then orchestration, then transport, then UI. Every task
in groups 3-7 means "write the failing tests, then make them pass."

## 1. Project Setup

- [x] 1.1 Move `effect` from `^3.22.1` to a pinned `4.0.0-beta.*` version; add `@effect/vitest`, `@effect/sql-sqlite-bun`, and `@effect/platform-bun` on matching beta tags
- [x] 1.2 Add TanStack Start, TanStack Router, Vite, React, Tailwind CSS, and configure shadcn/ui
- [x] 1.3 Apply the Effect-recommended strict `tsconfig.json` settings and verify `effect-language-service` patches cleanly
- [x] 1.4 Add `vitest.config.ts` with `tests/**/*.test.ts`, and `test` / `test:watch` / `typecheck` scripts
- [x] 1.5 Create the `src/{domain,rules,services,server,routes,ui}` and `tests/{rules,services,integration}` layout from design.md D2
- [x] 1.6 Add `.dockerignore` and confirm a bare `bun run dev` and `bun run test` both succeed

## 2. Domain Types

- [x] 2.1 Define `Chips` as a branded non-negative integer with a smart constructor, plus arithmetic helpers that preserve the brand (design.md D10)
- [x] 2.2 Define `PlayerName` as a branded lowercase single-word string with a normalizing constructor, and `HandId` / `TableId` brands
- [x] 2.3 Define `Card` (rank + suit), `Rank`, `Suit`, and a canonical 52-card enumeration with parsing and display
- [x] 2.4 Define `TableConfig` (name, id, minimum, mode, starting balance, admin name) as a Schema class
- [x] 2.5 Define the tagged error hierarchy for rejected intents: not-your-turn, illegal-action, insufficient-balance, stale-sequence, not-admin, duplicate-card, and friends
- [x] 2.6 Define the event union as Schema classes, one per event type, covering hand lifecycle, betting actions, card entry, credit, transfers, admin adjustment, and session finish
- [x] 2.7 Define `TableState`, `HandState`, `PlayerState`, and `Pot` as the in-memory fold targets

## 3. Rules: Hand Evaluation

- [x] 3.1 Test and implement `rank5`: classify any five cards into a comparable hand ranking with tiebreak ranks
- [x] 3.2 Test and implement hand comparison, including kickers, verifying that suits never break a tie
- [x] 3.3 Test and implement `best7`: select the strongest five-card combination from seven cards, including the board-plays case
- [x] 3.4 Validate the evaluator against exhaustive enumeration of known category boundaries rather than hand-picked examples (design.md risk)
- [x] 3.5 Test and implement human-readable hand names for the live ranking display

## 4. Rules: Pots and Settlement

- [x] 4.1 Test and implement `buildPots` from a contribution map plus the active set, slicing at each distinct all-in level (spec: pot-settlement, design.md D4)
- [x] 4.2 Cover the spec scenarios explicitly: no all-ins, one short all-in, folded contributions filling pots, multiple all-ins at different levels
- [x] 4.3 Test and implement uncalled-bet return, including its exclusion from recorded spend
- [x] 4.4 Test and implement pot awarding by eligibility, including the short-stack case and the all-opponents-folded case
- [x] 4.5 Test and implement split pots with the odd chip going closest clockwise of the button, asserting balances never become fractional
- [x] 4.6 Add property tests for the two invariants in design.md D4 over randomly generated all-in configurations: pot conservation, and zero net balance change per hand
- [x] 4.7 Test and implement manual per-pot winner declaration, including tie selection and rejection of ineligible players

## 5. Rules: Betting and Positions

- [x] 5.1 Test and implement position derivation: button, blinds, and action order for three or more players
- [x] 5.2 Test and implement heads-up inversion: button posts the small blind, acts first preflop and last thereafter
- [x] 5.3 Test and implement button rotation, including skipping players who have left or are not participating
- [x] 5.4 Test and implement blind posting, including the short-stack case that posts all-in
- [x] 5.5 Test and implement `legalActions` for a given state and player, covering check legality facing a bet
- [x] 5.6 Test and implement `applyAction` for check, call, fold, bet, raise, and all-in, with contribution and balance effects
- [x] 5.7 Test and implement the raise stepper: raises land on multiples of the table minimum, all-ins are exempt, and raises at or below the current bet are rejected
- [x] 5.8 Test and implement `isRoundClosed`, including that a raise reopens action for everyone not all-in
- [x] 5.9 Test and implement street advancement with per-round contribution reset and total retention
- [x] 5.10 Test and implement early termination: all but one folded, and skip-to-showdown when fewer than two active players still have chips
- [x] 5.11 Test and implement rejection of out-of-turn actions

## 6. Rules: Cards and Credit

- [x] 6.1 Test and implement duplicate card detection across board and all hole cards, including freeing a card on correction and resetting each hand
- [x] 6.2 Test and implement board card entry constraints: at most five, late entry accepted, correction recalculates rankings
- [x] 6.3 Test and implement hole card ownership rules: self-entry, admin entry on reveal, rejection of entry for another player
- [x] 6.4 Test and implement spend accounting per hand: blinds and bets included, returned chips excluded, winnings not offsetting, sit-outs recorded as zero, transfers excluded
- [x] 6.5 Test and implement burnout credit sizing: twice the last three hands' spend, floored at `5 × min`, capped at `20 × min`
- [x] 6.6 Test and implement burnout freezing at bust time and the three-hand cooldown, including that a gift during cooldown does not cancel the pending credit
- [x] 6.7 Test and implement credit claiming: balance increases, cumulative credit taken increases, pending cleared; and that no second credit is calculated while one is pending
- [x] 6.8 Test and implement loss bonus: fifteen percent of spend rounded down, only for non-winners, never without spend, independent of balance
- [x] 6.9 Test and implement `DISABLED` mode granting nothing
- [x] 6.10 Test and implement the leaderboard score formula and ranking, including negative scores, equal ranks, and that claiming credit leaves score unchanged

## 7. Rules: State Fold

- [x] 7.1 Test and implement the fold from an event list to `TableState`, one event type at a time
- [x] 7.2 Test that folding a full hand's events reproduces the same state the incremental application produced
- [x] 7.3 Test and implement the guards that make illegal transitions unrepresentable: starting with fewer than two eligible players, acting during settlement, transferring mid-hand

## 8. Persistence

- [x] 8.1 Define the `EventStore` service interface: append an event returning its `seq`, and read all events
- [x] 8.2 Implement the SQLite schema from design.md D3 (`events`, `players`, `table_meta`) with migration on startup
- [x] 8.3 Implement `EventStore` over `@effect/sql-sqlite-bun`, encoding and decoding payloads through Schema
- [x] 8.4 Implement an in-memory `EventStore` test layer with the same contract
- [x] 8.5 Test that events round-trip through Schema encoding without loss, and that unknown event types fail loudly rather than being skipped (design.md rollback story)
- [x] 8.6 Test player identity persistence: reclaim by name, no duplicate creation, history intact
- [x] 8.7 Test table id stability across restarts

## 9. Configuration

- [x] 9.1 Implement `Config` reading `TABLE_NAME`, `TABLE_MIN`, `TABLE_MODE`, `STARTING_BALANCE`, `ADMIN_NAME` into `TableConfig`
- [x] 9.2 Test defaults: random name, minimum `10`, mode `BURNOUT_CREDIT`, starting balance `70 × min`
- [x] 9.3 Test derived versus overridden starting balance
- [x] 9.4 Test that invalid values fail startup with a message naming the variable and its accepted values

## 10. Table Orchestration

- [x] 10.1 Implement the `Table` service holding current state, rebuilt by replaying the event log at startup
- [x] 10.2 Implement intent handling: validate against rules, append the resulting event, update state, return the outcome
- [x] 10.3 Implement stale-sequence rejection using `seq` as the state version (design.md D7), including at-most-once application of a retried action
- [x] 10.4 Implement admin authorization as a name check on start, declare winner, adjust balance, and finish session
- [x] 10.5 Implement per-recipient snapshot construction that omits other players' hole cards rather than sending them hidden (design.md D6)
- [x] 10.6 Implement join, ready, unready, and leave, including ready state clearing after each hand and deferred departure during a hand
- [x] 10.7 Implement the settlement pipeline: build pots, return uncalled bets, award, record spend, apply credit, rotate button
- [x] 10.8 Implement the waiting-for-players state and session finish
- [x] 10.9 Integration test: drive a full hand through `Table` against a real SQLite file in a scoped temp directory
- [x] 10.10 Integration test: restart mid-hand and assert the resumed state matches exactly, including pot, contributions, active players, street, and acting player

## 11. Server and Transport

- [x] 11.1 Build the application `Layer` and runtime once at startup, wiring `Config`, `EventStore`, `Table`, and `Broadcast`
- [x] 11.2 Implement the `Bun.serve` entry point on port 1818 with the `/ws` upgrade and TanStack Start handling everything else (design.md D5)
- [x] 11.3 Define the client-to-server intent and server-to-client message schemas, and decode every inbound frame through Schema
- [x] 11.4 Implement the `Broadcast` service tracking connected clients and fanning out per-recipient snapshots
- [x] 11.5 Send a full snapshot on connect, reconnect, and reload through one code path (design.md D6)
- [x] 11.6 Map every tagged domain error to a client message, and return a fresh snapshot on stale-sequence rejection
- [x] 11.7 Test that a disconnect leaves game state untouched: seat held, chips intact, not folded, still the acting player
- [x] 11.8 Test that hole cards never appear in another recipient's snapshot

## 12. Client

- [x] 12.1 Implement the WebSocket client with automatic reconnect and snapshot-driven rendering, holding no derived game state
- [x] 12.2 Implement the join screen with name normalization, validation messages, and the in-use warning with its consequence
- [x] 12.3 Implement the table view: seats, button, blinds, whose turn it is, balances, and the waiting-on indicator
- [x] 12.4 Implement the action bar with only legal actions enabled and a raise stepper in table-minimum increments
- [x] 12.5 Implement pot display: a single total normally, per-pot amounts with eligibility once a side pot exists
- [x] 12.6 Implement board card entry for the admin, including correction
- [x] 12.7 Implement hole card entry with censoring by default, five-second tap-to-reveal, and re-censoring on reload
- [x] 12.8 Implement the private live hand ranking display
- [x] 12.9 Implement the admin panel: start hand, declare winner per pot with eligibility filtering and tie multi-select, adjust balance, finish session
- [x] 12.10 Implement the transfer UI, available only between hands, with table-wide announcement
- [x] 12.11 Implement the credit UI: pending amount, hands remaining in cooldown, and the claim button
- [x] 12.12 Implement the leaderboard with balance, credit taken, and score, live during play and final on finish
- [x] 12.13 Verify the wake-from-lock path renders a playable table with no loading state and no re-entry of the player's name

## 13. Packaging

- [x] 13.1 Write the Dockerfile on a Bun base image, building the client and exposing port 1818
- [x] 13.2 Mount the SQLite file on a volume so balances survive container replacement
- [x] 13.3 Verify a cold `docker run` with no environment variables produces a playable table on defaults
- [x] 13.4 Verify balances and history survive `docker stop` and `docker run` against the same volume
- [x] 13.5 Test a full hand from at least three devices on a real LAN, including locking and unlocking a phone mid-hand

## 14. Documentation

- [x] 14.1 Update `README.md` to match the shipped behavior, including the credit cooldown, transfers, leaderboard scoring, and admin adjustment
- [x] 14.2 Document the environment variables, their defaults, and the `docker run` invocation
- [x] 14.3 Note in `DECISIONS.md` which house rules are tunable and where their values live
