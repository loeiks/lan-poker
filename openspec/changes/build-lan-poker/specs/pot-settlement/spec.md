## Purpose

Divides the chips at the end of a hand correctly, including the side pots created by all-ins, so the table never has to stop and work out who is eligible to win which portion of the money.

## ADDED Requirements

### Requirement: Contribution tracking

The system SHALL record how many chips each player has put into the current hand, independently of whether they are still active.

#### Scenario: Contributions accumulate

- **WHEN** a player posts a blind, calls, bets, raises, or goes all-in
- **THEN** the contributed amount SHALL be deducted from their balance and added to their total contribution for the hand

#### Scenario: Folded players keep their contributions in the pot

- **WHEN** a player folds
- **THEN** their contributions SHALL remain counted toward the pots
- **AND** they SHALL be ineligible to win any pot

### Requirement: Pot construction

The system SHALL derive pots from the contribution amounts by slicing at each distinct all-in level, such that no player can win more from any opponent than that player contributed themselves.

#### Scenario: No all-ins

- **WHEN** a hand ends with no player having gone all-in for less than the final bet
- **THEN** a single pot SHALL be formed containing all contributions
- **AND** every player still active SHALL be eligible for it

#### Scenario: One short all-in creates a side pot

- **WHEN** contributions are 30, 80, and 80 from three active players
- **THEN** a main pot of 90 SHALL be formed with all three eligible
- **AND** a side pot of 100 SHALL be formed with only the two players who contributed 80 eligible

#### Scenario: Folded contributions fill the pots

- **WHEN** a player folds after contributing 80 while active players contributed 30, 80 and 80
- **THEN** the folded player's 80 SHALL be distributed into the pot layers according to the same slicing
- **AND** the folded player SHALL be eligible for none of them

#### Scenario: Multiple all-ins at different levels

- **WHEN** three players are all-in for different amounts and a fourth covers them all
- **THEN** one pot layer SHALL be formed at each distinct all-in level
- **AND** each layer SHALL list exactly the players who contributed at least that layer's level and are still active

#### Scenario: Conservation of chips

- **WHEN** pots are constructed for any hand
- **THEN** the sum of all pot amounts plus any returned uncalled bet SHALL equal the sum of all contributions

### Requirement: Uncalled bet return

The system SHALL return to a player any portion of their bet that no opponent could match, before pots are awarded.

#### Scenario: Overbet beyond all opponents

- **WHEN** a player bets 80 and every other player is either folded or all-in for at most 30
- **THEN** 50 SHALL be returned to the bettor before showdown
- **AND** the returned amount SHALL NOT form any pot

#### Scenario: Returned chips are not spend

- **WHEN** an uncalled bet is returned to a player
- **THEN** the returned amount SHALL NOT count toward that player's recorded spend for the hand

### Requirement: Awarding pots

The system SHALL award each pot to the best hand among the players eligible for that specific pot.

#### Scenario: Short stack wins only what they are eligible for

- **WHEN** a player who is all-in for 30 holds the best hand among a main pot of 90 and a side pot of 100
- **THEN** they SHALL be awarded 90
- **AND** the side pot of 100 SHALL be awarded to the best hand among its own eligible players

#### Scenario: Single remaining player

- **WHEN** all opponents have folded
- **THEN** the remaining player SHALL be awarded every pot regardless of cards

#### Scenario: Balances updated on award

- **WHEN** pots are awarded
- **THEN** each winner's balance SHALL increase by the amounts they won
- **AND** the total change in balances across all players SHALL be zero for that hand

### Requirement: Split pots

The system SHALL split a pot evenly among tied winners and SHALL keep every balance a whole number.

#### Scenario: Even split

- **WHEN** two eligible players tie for the best hand on a pot of 200
- **THEN** each SHALL receive 100

#### Scenario: Odd chip

- **WHEN** a pot of 201 is split between two tied players
- **THEN** each SHALL receive 100
- **AND** the remaining 1 SHALL be awarded to the tied player seated closest clockwise of the dealer button

#### Scenario: Balances stay whole

- **WHEN** any pot is awarded under any circumstances
- **THEN** no player balance SHALL become fractional

### Requirement: Manual winner declaration

The system SHALL allow the admin to declare winners without card data, per pot when more than one pot exists.

#### Scenario: Single pot declaration

- **WHEN** only one pot exists and the admin declares a winner
- **THEN** the entire pot SHALL be awarded to that player in a single action

#### Scenario: Multiple pot declaration

- **WHEN** more than one pot exists
- **THEN** the admin SHALL be asked to declare a winner for each pot separately
- **AND** for each pot only the players eligible for that pot SHALL be offered as choices

#### Scenario: Declaring a tie

- **WHEN** the admin selects more than one winner for a pot
- **THEN** that pot SHALL be split according to the split pot rules

#### Scenario: Ineligible player cannot be declared

- **WHEN** the admin attempts to award a pot to a player who is not eligible for it
- **THEN** the declaration SHALL be rejected

### Requirement: Pot visibility

The system SHALL show the pot in a way that does not mislead players about what they can actually win.

#### Scenario: Single pot

- **WHEN** no side pot exists
- **THEN** a single combined pot total SHALL be displayed

#### Scenario: Side pot exists

- **WHEN** an all-in has caused more than one pot to form
- **THEN** each pot SHALL be displayed separately with its amount
- **AND** the players eligible for each pot SHALL be indicated
