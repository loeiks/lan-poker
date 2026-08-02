## Purpose

Shows everyone who is actually winning, by scoring players on what they are up or down rather than on raw chips, so that credit taken from the system is a visible loan rather than free money.

## ADDED Requirements

### Requirement: Score formula

The system SHALL score each player as their balance minus the configured starting balance minus the total credit they have taken.

#### Scenario: Player who has never busted

- **WHEN** a player holds 980 chips, the starting balance is 700, and they have taken no credit
- **THEN** their score SHALL be `+280`

#### Scenario: Player who has taken credit

- **WHEN** a player holds 760 chips, the starting balance is 700, and they have taken 140 in credit
- **THEN** their score SHALL be `−80`

#### Scenario: Fresh player starts at zero

- **WHEN** a player has just joined and has played no hands
- **THEN** their score SHALL be `0`

#### Scenario: Negative scores are valid

- **WHEN** a player's losses and credit taken exceed their gains
- **THEN** their score SHALL be displayed as a negative number

#### Scenario: Credit is a loan

- **WHEN** a player claims a credit
- **THEN** their balance SHALL rise by the credit amount
- **AND** their score SHALL be unchanged by the claim itself

#### Scenario: Transfers move score between players

- **WHEN** one player transfers chips to another
- **THEN** the sender's score SHALL decrease by that amount
- **AND** the recipient's score SHALL increase by that amount

### Requirement: Live leaderboard

The system SHALL make current standings visible to everyone during play.

#### Scenario: Standings visible during a hand

- **WHEN** any player or spectator views the leaderboard while a hand is in progress
- **THEN** they SHALL see every player ranked by score, highest first
- **AND** each row SHALL show the player's balance, total credit taken, and score

#### Scenario: Standings update after a hand

- **WHEN** a hand settles
- **THEN** the leaderboard SHALL reflect the new balances for every player without requiring a reload

#### Scenario: Departed players remain listed

- **WHEN** a player has left the table
- **THEN** they SHALL still appear on the leaderboard with their preserved score

#### Scenario: Equal scores

- **WHEN** two players have the same score
- **THEN** both SHALL be shown at the same rank

### Requirement: Ending the night

The system SHALL let the admin end the session at any point, with no fixed end condition.

#### Scenario: Admin finishes the night

- **WHEN** the admin finishes the session while no hand is in progress
- **THEN** a final leaderboard SHALL be presented to everyone
- **AND** the session SHALL be recorded as finished

#### Scenario: Finish refused during a hand

- **WHEN** the admin attempts to finish while a hand is in progress
- **THEN** the request SHALL be rejected until that hand settles

#### Scenario: Non-admin cannot finish

- **WHEN** a player who is not the admin attempts to finish the session
- **THEN** the request SHALL be rejected

#### Scenario: Balances carry forward

- **WHEN** a session has been finished and play later resumes
- **THEN** every player's balance and total credit taken SHALL be exactly as they were at the finish
- **AND** scores SHALL continue from those values rather than resetting
