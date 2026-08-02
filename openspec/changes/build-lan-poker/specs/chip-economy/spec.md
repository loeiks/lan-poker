## Purpose

Manages every chip at the table — balances, the credit that keeps busted players in the game, gifts between friends, and the admin's escape hatch for mistakes — so that a night of poker never has to end because someone ran out.

## ADDED Requirements

### Requirement: Balances

The system SHALL maintain a whole-number chip balance for every player and SHALL persist it indefinitely.

#### Scenario: New player balance

- **WHEN** a player joins for the first time
- **THEN** their balance SHALL be set to the configured starting balance

#### Scenario: Balance persists across nights

- **WHEN** the application is stopped and restarted on a later day
- **THEN** every player's balance SHALL be exactly what it was when the application stopped

#### Scenario: Balance never goes negative

- **WHEN** any operation would reduce a balance below zero
- **THEN** the operation SHALL be rejected

### Requirement: Spend accounting

The system SHALL record, for each player and each hand, the total chips that player committed to the pot.

#### Scenario: Spend recorded for a hand

- **WHEN** a hand settles
- **THEN** each participant's spend for that hand SHALL be recorded as the sum of their blinds, calls, bets, and raises

#### Scenario: Returned chips excluded

- **WHEN** a player had an uncalled bet returned during a hand
- **THEN** the returned amount SHALL NOT be included in their recorded spend

#### Scenario: Winnings do not offset spend

- **WHEN** a player commits 50 to the pot and wins 200
- **THEN** their recorded spend for that hand SHALL be 50

#### Scenario: Sitting out a hand

- **WHEN** a player does not participate in a hand
- **THEN** their spend for that hand SHALL be recorded as zero

#### Scenario: Transfers are not spend

- **WHEN** a player sends or receives a transfer
- **THEN** the amount SHALL NOT affect any recorded spend

### Requirement: Credit modes

The system SHALL operate in exactly one of three credit modes, fixed by configuration: `BURNOUT_CREDIT`, `LOSS_BONUS`, or `DISABLED`.

#### Scenario: Credit evaluated only between hands

- **WHEN** a player's balance reaches zero during a hand
- **THEN** no credit SHALL be granted until that hand has fully settled

#### Scenario: Disabled mode

- **WHEN** the mode is `DISABLED` and a player's balance reaches zero
- **THEN** no credit SHALL be offered
- **AND** that player SHALL remain unable to be dealt in unless another player transfers them chips

### Requirement: Burnout credit

In `BURNOUT_CREDIT` mode the system SHALL offer a busted player a credit sized from their recent spending, bounded by a floor and a ceiling.

#### Scenario: Credit amount calculated

- **WHEN** a player's balance is zero after a hand settles
- **THEN** a credit SHALL be calculated as twice the sum of their spend across their last three hands
- **AND** it SHALL be raised to `5 × TABLE_MIN` if lower
- **AND** it SHALL be reduced to `20 × TABLE_MIN` if higher

#### Scenario: Amount is frozen at bust time

- **WHEN** the credit is calculated
- **THEN** that amount SHALL be recorded and SHALL NOT be recalculated later
- **AND** it SHALL be the amount granted when the player eventually claims it

#### Scenario: Low spender receives the floor

- **WHEN** a player who folded three hands in a row busts on a blind
- **THEN** their credit SHALL be `5 × TABLE_MIN`

#### Scenario: High spender is capped

- **WHEN** twice a player's spend over the last three hands exceeds `20 × TABLE_MIN`
- **THEN** their credit SHALL be `20 × TABLE_MIN`

### Requirement: Burnout cooldown

The system SHALL require a busted player to sit out three hands before their credit can be claimed.

#### Scenario: Cooldown begins

- **WHEN** a credit is calculated for a busted player
- **THEN** that player SHALL be ineligible to be dealt in for the next three hands
- **AND** the pending credit amount and the number of hands remaining SHALL be visible to them

#### Scenario: Credit becomes claimable

- **WHEN** three hands have been played since the credit was calculated
- **THEN** the player SHALL be offered the ability to claim it

#### Scenario: Credit must be claimed

- **WHEN** a credit is claimable
- **THEN** it SHALL NOT be added to the player's balance until the player explicitly claims it

#### Scenario: Claiming the credit

- **WHEN** a player claims their credit
- **THEN** the amount SHALL be added to their balance
- **AND** the same amount SHALL be added to their cumulative total of credit taken
- **AND** the pending credit SHALL be cleared

#### Scenario: Gift during cooldown does not cancel the credit

- **WHEN** another player transfers chips to a player during their cooldown
- **THEN** the recipient SHALL be able to be dealt in immediately
- **AND** their pending credit SHALL remain and SHALL still be claimable once three hands have elapsed

#### Scenario: Busting again during a pending credit

- **WHEN** a player with a pending credit reaches zero balance again
- **THEN** no second credit SHALL be calculated while one is already pending

### Requirement: Loss bonus

In `LOSS_BONUS` mode the system SHALL return a fraction of a losing player's spend after each hand.

#### Scenario: Bonus granted on a loss

- **WHEN** a player participates in a hand and wins nothing from it
- **THEN** they SHALL receive fifteen percent of their spend for that hand, rounded down to a whole number
- **AND** the amount SHALL be added to their cumulative total of credit taken

#### Scenario: No bonus for a winner

- **WHEN** a player wins any portion of any pot in a hand
- **THEN** no loss bonus SHALL be granted to them for that hand

#### Scenario: No bonus without spend

- **WHEN** a losing player's spend for the hand was zero
- **THEN** no loss bonus SHALL be granted

#### Scenario: Bonus does not depend on balance

- **WHEN** a player loses a hand while still holding a large balance
- **THEN** the loss bonus SHALL still be granted

### Requirement: Player transfers

The system SHALL allow any player to send chips to any other player, replacing the real-world gesture of handing a friend some chips.

#### Scenario: Transfer between hands

- **WHEN** a player sends chips to another player while no hand is in progress
- **THEN** the amount SHALL be deducted from the sender and added to the recipient immediately
- **AND** no approval from the recipient or the admin SHALL be required

#### Scenario: Transfer is visible

- **WHEN** a transfer completes
- **THEN** the sender, recipient, and amount SHALL be announced to everyone at the table

#### Scenario: Transfer during a hand is refused

- **WHEN** a player attempts to send chips while a hand is in progress
- **THEN** the transfer SHALL be rejected
- **AND** the reason SHALL indicate that transfers are only possible between hands

#### Scenario: Transfer beyond balance

- **WHEN** a player attempts to send more chips than they hold
- **THEN** the transfer SHALL be rejected

#### Scenario: Invalid transfer amount

- **WHEN** a player attempts to send a non-positive or fractional amount
- **THEN** the transfer SHALL be rejected

### Requirement: Admin balance adjustment

The system SHALL allow the admin to set any player's balance to a chosen value, as the recovery mechanism for misclicks and faults.

#### Scenario: Admin corrects a balance

- **WHEN** the admin sets a player's balance to a specific whole number while no hand is in progress
- **THEN** the balance SHALL become exactly that value

#### Scenario: Adjustment is visible

- **WHEN** the admin adjusts a balance
- **THEN** the affected player, the previous value, and the new value SHALL be announced to everyone at the table

#### Scenario: Non-admin cannot adjust

- **WHEN** a player who is not the admin attempts to adjust any balance
- **THEN** the request SHALL be rejected

#### Scenario: Adjustment does not count as credit

- **WHEN** the admin adjusts a player's balance
- **THEN** the player's cumulative total of credit taken SHALL be unchanged
