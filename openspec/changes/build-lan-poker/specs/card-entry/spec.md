## Purpose

Lets the admin and players optionally tell the app which physical cards are in play, so it can rank hands and settle showdowns automatically, while guaranteeing that a table which never enters a card can still play a full night.

## ADDED Requirements

### Requirement: Card entry is optional

The system SHALL treat all card data as optional and SHALL never block the progress of a hand on its absence.

#### Scenario: Hand played with no cards entered

- **WHEN** a hand is played from blinds to showdown without any card being entered
- **THEN** every betting action SHALL have been permitted normally
- **AND** the hand SHALL settle on the admin's declaration of the winner

#### Scenario: Betting continues while cards are missing

- **WHEN** board cards for the current street have not been entered
- **THEN** players SHALL still be able to check, call, raise, fold, and go all-in

### Requirement: Board card entry

The system SHALL allow the admin to record the community cards.

#### Scenario: Admin enters board cards

- **WHEN** the admin records a community card
- **THEN** it SHALL become visible to every player and spectator immediately

#### Scenario: Board cards entered late

- **WHEN** the admin records board cards after the street in which they were physically dealt
- **THEN** they SHALL be accepted without affecting any betting that already occurred

#### Scenario: Board limited to five cards

- **WHEN** five community cards have been recorded and the admin attempts to record a sixth
- **THEN** the entry SHALL be rejected

#### Scenario: Correcting a board card

- **WHEN** the admin changes or clears a previously recorded board card
- **THEN** the change SHALL be accepted and broadcast
- **AND** any displayed hand rankings SHALL be recalculated

### Requirement: Hole card entry

The system SHALL allow each player to record their own two hole cards, and SHALL allow the admin to record hole cards on a player's behalf once cards are revealed.

#### Scenario: Player enters their own cards

- **WHEN** a player records their two hole cards
- **THEN** those cards SHALL be stored against that player for the hand
- **AND** they SHALL NOT be revealed to any other player or spectator while the hand is in progress

#### Scenario: Player cannot enter another player's cards

- **WHEN** a player attempts to record hole cards for a different player
- **THEN** the attempt SHALL be rejected

#### Scenario: Admin records revealed cards

- **WHEN** the admin records hole cards for a player after those cards have been physically revealed
- **THEN** the entry SHALL be accepted

#### Scenario: Folded player is never asked

- **WHEN** a player has folded
- **THEN** the system SHALL NOT require or prompt for their hole cards

### Requirement: Duplicate card detection

The system SHALL ensure every recorded card is distinct across the board and all hole cards within a hand, treating collisions as likely mistakes rather than misconduct.

#### Scenario: Duplicate card is entered

- **WHEN** a card is recorded that has already been recorded elsewhere in the current hand
- **THEN** the entry SHALL be rejected
- **AND** the message SHALL identify where the conflicting card was already recorded so the mistake can be corrected

#### Scenario: Card freed by correction

- **WHEN** a previously recorded card is cleared or changed
- **THEN** that card SHALL become available to record elsewhere

#### Scenario: Cards reset each hand

- **WHEN** a new hand begins
- **THEN** all card records from the previous hand SHALL be cleared
- **AND** every card SHALL be available for entry again

### Requirement: Hand ranking display

The system SHALL show a player the strength of their own hand once enough cards are known.

#### Scenario: Player sees their current ranking

- **WHEN** a player has recorded both hole cards and at least three board cards are recorded
- **THEN** that player SHALL be shown the name of their current best five-card hand

#### Scenario: Ranking updates as the board grows

- **WHEN** a new board card is recorded
- **THEN** each player who has recorded hole cards SHALL see their ranking updated

#### Scenario: Ranking is private

- **WHEN** a player is shown their hand ranking
- **THEN** no other player or spectator SHALL be shown it

### Requirement: Hand evaluation

The system SHALL determine the best five-card hand from a player's two hole cards and the five board cards, according to standard poker hand rankings.

#### Scenario: Best five of seven

- **WHEN** a player has two hole cards and five board cards recorded
- **THEN** the system SHALL select the strongest five-card combination available

#### Scenario: Comparing hands of the same category

- **WHEN** two hands fall in the same ranking category
- **THEN** they SHALL be compared by their ranks in standard order, including kickers

#### Scenario: Genuinely tied hands

- **WHEN** two hands are equal in every respect
- **THEN** they SHALL be reported as tied
- **AND** suits SHALL NOT be used to break the tie

#### Scenario: The board plays

- **WHEN** the best five-card hand available to a player uses none of their hole cards
- **THEN** that board hand SHALL be their hand

### Requirement: Hole card censoring

The system SHALL keep a player's own hole cards hidden on their screen by default to protect against onlookers.

#### Scenario: Cards censored by default

- **WHEN** a player has recorded their hole cards
- **THEN** those cards SHALL be displayed censored on their own device

#### Scenario: Temporary reveal

- **WHEN** the player taps their censored cards
- **THEN** the cards SHALL be revealed for five seconds
- **AND** SHALL return to censored automatically afterwards

#### Scenario: Reveal does not persist

- **WHEN** a player's cards are revealed and the page is reloaded or the device is locked and reopened
- **THEN** the cards SHALL be censored again
