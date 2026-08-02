## Purpose

Keeps every phone at the table showing the same truth in real time, and makes locking a phone, reloading a page, or restarting the server a non-event rather than something that disrupts the game.

## ADDED Requirements

### Requirement: Server authority

The system SHALL hold all game state on the server. Clients SHALL send intents and render state, and SHALL NOT compute game outcomes.

#### Scenario: Client sends an intent

- **WHEN** a player performs an action
- **THEN** the client SHALL send it to the server as a request
- **AND** the resulting state SHALL be determined solely by the server

#### Scenario: Client cannot fabricate state

- **WHEN** a client sends a malformed or unauthorized request
- **THEN** the server SHALL reject it and its state SHALL be unchanged
- **AND** the client SHALL be brought back into agreement with the server

### Requirement: Real-time broadcast

The system SHALL push state changes to all connected clients as they happen.

#### Scenario: Action broadcast to the table

- **WHEN** any action changes table state
- **THEN** every connected client SHALL receive the update without polling or manual refresh

#### Scenario: Private information stays private

- **WHEN** state is broadcast
- **THEN** each client SHALL receive only the hole cards belonging to their own player
- **AND** SHALL NOT receive any other player's hole cards while the hand is in progress

### Requirement: Full snapshot on connect

The system SHALL deliver a complete state snapshot whenever a client connects, rather than attempting to replay missed changes.

#### Scenario: First load

- **WHEN** a client connects for the first time
- **THEN** it SHALL receive a snapshot sufficient to render the entire table

#### Scenario: Reconnection after disconnect

- **WHEN** a client reconnects after any period of disconnection
- **THEN** it SHALL receive a full snapshot
- **AND** SHALL NOT depend on any change it missed while disconnected

#### Scenario: Page reload

- **WHEN** a player reloads the page
- **THEN** the table SHALL be rendered from a fresh snapshot in the same way as any other connection

### Requirement: Disconnection does not affect the game

The system SHALL treat client connectivity as irrelevant to game state.

#### Scenario: Phone locks during a hand

- **WHEN** a player's device locks, backgrounds, or loses network while they are in a hand
- **THEN** they SHALL remain in the hand
- **AND** their chips, seat, contributions, and recorded cards SHALL be unaffected
- **AND** they SHALL NOT be folded

#### Scenario: Player disconnects on their turn

- **WHEN** the acting player is disconnected
- **THEN** the hand SHALL wait for them
- **AND** no automatic action SHALL be taken on their behalf

#### Scenario: Waiting is visible

- **WHEN** the table is waiting on a player to act
- **THEN** every client SHALL see which player is being waited on

#### Scenario: Return to play is immediate

- **WHEN** a player's device is unlocked after a period of inactivity
- **THEN** the client SHALL restore the current table state and be ready to act without requiring the player to re-enter their name or navigate back

### Requirement: No turn timer

The system SHALL NOT impose any time limit on a player's turn and SHALL NOT act on a player's behalf.

#### Scenario: Long delay before acting

- **WHEN** a player takes an arbitrarily long time to act
- **THEN** the hand SHALL remain waiting indefinitely
- **AND** no automatic fold or check SHALL occur

### Requirement: Stale action rejection

The system SHALL prevent a client acting on out-of-date state from changing the game.

#### Scenario: Action from a stale view

- **WHEN** a client submits an action referencing a state version older than the server's current version
- **THEN** the action SHALL be rejected
- **AND** the client SHALL be refreshed with current state

#### Scenario: Action from current state

- **WHEN** a client submits an action referencing the server's current state version and the action is otherwise legal
- **THEN** it SHALL be applied

#### Scenario: Duplicate submission

- **WHEN** the same action is submitted twice, for example because a client retried after a reconnect
- **THEN** it SHALL take effect at most once

### Requirement: Durable state

The system SHALL persist every action so that state survives process restarts.

#### Scenario: Restart mid-hand

- **WHEN** the application process is restarted while a hand is in progress
- **THEN** on restart the table SHALL be in exactly the state it was in before
- **AND** connected clients SHALL be restored to that state on reconnection

#### Scenario: Actions are durable before acknowledgement

- **WHEN** an action is accepted
- **THEN** it SHALL be persisted before being broadcast as applied

#### Scenario: History is retained

- **WHEN** any hand completes
- **THEN** its actions and outcome SHALL be retained
- **AND** SHALL remain available to the calculations that depend on hand history

#### Scenario: Continuing on a later night

- **WHEN** the application is started again on a subsequent day with the same data
- **THEN** players, balances, credit totals, and hand history SHALL all be intact
