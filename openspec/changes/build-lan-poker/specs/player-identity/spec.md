## Purpose

Lets friends join the table by typing a single name, with no accounts or passwords, and keeps that identity attached to their chips across page refreshes, phone changes, and future game nights.

## ADDED Requirements

### Requirement: Joining by name

The system SHALL allow a player to join by entering a single-word name and SHALL NOT require any credential.

#### Scenario: New player joins

- **WHEN** a person enters a name that no existing player holds
- **THEN** a new player SHALL be created with the configured starting balance
- **AND** they SHALL be placed at the table as a spectator until they mark themselves ready

#### Scenario: Name is normalized

- **WHEN** a person enters `"Enes"`, `"ENES"`, or `"  enes  "`
- **THEN** the name SHALL be stored and displayed as `enes`

#### Scenario: Name is rejected

- **WHEN** a person enters a name that is empty, contains whitespace or is not a single word, or exceeds the maximum supported length
- **THEN** the join SHALL be refused
- **AND** the reason SHALL be shown so they can correct it

### Requirement: Name is the identity

The system SHALL treat the normalized name as the player's identity. Locally stored identifiers SHALL be a convenience only and SHALL NOT be required to reclaim an identity.

#### Scenario: Player returns on a new device

- **WHEN** a player whose local storage has been cleared, or who is using a different device, enters their existing name
- **THEN** they SHALL reclaim the existing player
- **AND** their balance, credit history, and hand history SHALL be intact
- **AND** no duplicate player SHALL be created

#### Scenario: Player refreshes the page

- **WHEN** a player reloads the page
- **THEN** they SHALL be returned to the table as the same player without re-entering their name

#### Scenario: Two people choose the same name

- **WHEN** a second person enters a name that an already-connected player holds
- **THEN** the system SHALL warn that the name is in use and describe what will happen
- **AND** SHALL allow them to either take over that identity or choose a different name

### Requirement: Ready state

The system SHALL require players to opt in to each hand by marking themselves ready.

#### Scenario: Player marks ready

- **WHEN** a player marks themselves ready while no hand is in progress
- **THEN** their ready state SHALL be visible to everyone at the table
- **AND** they SHALL be dealt into the next hand that starts

#### Scenario: Player is not ready when a hand starts

- **WHEN** a hand starts and a player has not marked themselves ready
- **THEN** they SHALL NOT be dealt into that hand
- **AND** they SHALL observe the hand as a spectator with full visibility of public information

#### Scenario: Player withdraws ready

- **WHEN** a player un-marks ready before the hand starts
- **THEN** they SHALL NOT be dealt into the next hand

#### Scenario: Ready state after a hand

- **WHEN** a hand settles
- **THEN** each player's ready state SHALL be cleared
- **AND** players SHALL mark themselves ready again for the next hand

### Requirement: Broke players cannot be dealt in

The system SHALL prevent a player with a zero balance from being dealt into a hand.

#### Scenario: Player with zero balance attempts to ready

- **WHEN** a player whose balance is zero attempts to mark themselves ready
- **THEN** the system SHALL refuse
- **AND** SHALL explain how they can return to play under the table's current credit mode

### Requirement: Mid-hand joiners spectate

The system SHALL place anyone who joins while a hand is in progress into spectator mode for the remainder of that hand.

#### Scenario: Joining mid-hand

- **WHEN** a person joins while a hand is in progress
- **THEN** they SHALL observe the hand as a spectator
- **AND** they SHALL be able to mark themselves ready once the hand settles

### Requirement: Spectator visibility

The system SHALL show spectators all public table information and SHALL NOT reveal any player's hole cards to them.

#### Scenario: Spectator watches a hand

- **WHEN** a spectator observes a hand in progress
- **THEN** they SHALL see the board cards, pot totals, whose turn it is, and every betting action
- **AND** they SHALL NOT see any seated player's hole cards

### Requirement: Leaving the table

The system SHALL allow a player to leave and SHALL preserve everything about them.

#### Scenario: Player leaves between hands

- **WHEN** a player leaves while no hand is in progress
- **THEN** their seat SHALL be freed
- **AND** their balance SHALL be frozen and preserved
- **AND** they SHALL continue to appear on the leaderboard with their final score

#### Scenario: Player rejoins later

- **WHEN** a player who previously left enters their name again, whether later the same night or on a subsequent night
- **THEN** they SHALL rejoin with their preserved balance and history

#### Scenario: Player leaves during a hand

- **WHEN** a player attempts to leave while they are still active in a hand
- **THEN** their departure SHALL take effect only after that hand settles
- **AND** their chips already committed to the pot SHALL remain in play for that hand
