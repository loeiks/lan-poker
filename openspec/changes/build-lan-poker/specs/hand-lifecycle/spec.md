## Purpose

Runs a hand of No Limit Texas Hold'em from blinds through showdown, enforcing whose turn it is and which actions are legal, so that the table never has to remember the betting rules or argue about who acts next.

## ADDED Requirements

### Requirement: Starting a hand

The system SHALL allow only the admin to start a hand, and only when at least two players are ready with a balance greater than zero.

#### Scenario: Admin starts a hand

- **WHEN** the admin starts a hand while at least two eligible players are ready
- **THEN** exactly those ready players SHALL be dealt in
- **AND** the hand SHALL advance to posting blinds

#### Scenario: Non-admin attempts to start

- **WHEN** a player who is not the admin attempts to start a hand
- **THEN** the request SHALL be refused

#### Scenario: Start attempted with too few players

- **WHEN** the admin attempts to start a hand with fewer than two eligible ready players
- **THEN** the request SHALL be refused with an explanation

### Requirement: Dealer button

The system SHALL assign the dealer button at random for the first hand and SHALL rotate it clockwise after every hand.

#### Scenario: First hand of a table

- **WHEN** the very first hand starts
- **THEN** the button SHALL be assigned to a randomly selected participating player
- **AND** the button holder SHALL be visible to everyone

#### Scenario: Button rotates

- **WHEN** a hand settles
- **THEN** the button SHALL move clockwise to the next seat

#### Scenario: Button holder is absent

- **WHEN** the player who would receive the button has left the table or is not participating
- **THEN** the button SHALL continue clockwise to the next participating player

### Requirement: Posting blinds

The system SHALL automatically post and deduct the small and big blinds when a hand begins, and SHALL make this visible to the players who posted them.

#### Scenario: Blinds posted with three or more players

- **WHEN** a hand begins with three or more players
- **THEN** the player clockwise of the button SHALL post the small blind of half the table minimum
- **AND** the next player clockwise SHALL post the big blind equal to the table minimum
- **AND** both amounts SHALL be deducted from their balances and added to their contributions

#### Scenario: Blind posters are notified

- **WHEN** blinds are posted
- **THEN** each blind poster SHALL be explicitly notified of the amount taken from them

#### Scenario: Player cannot cover the blind

- **WHEN** a player's balance is less than the blind they owe
- **THEN** they SHALL post their entire remaining balance
- **AND** SHALL be marked all-in for the hand

### Requirement: Heads-up blind rules

With exactly two players, the system SHALL invert the standard blind and action order.

#### Scenario: Heads-up blinds

- **WHEN** a hand begins with exactly two players
- **THEN** the button SHALL post the small blind
- **AND** the other player SHALL post the big blind

#### Scenario: Heads-up preflop action order

- **WHEN** the preflop betting round begins with exactly two players
- **THEN** the button SHALL act first

#### Scenario: Heads-up post-flop action order

- **WHEN** any betting round after preflop begins with exactly two players
- **THEN** the button SHALL act last

### Requirement: Betting streets

The system SHALL run betting rounds in the order preflop, flop, turn, river.

#### Scenario: Preflop action order with three or more players

- **WHEN** the preflop betting round begins with three or more players
- **THEN** the first player to act SHALL be the one clockwise of the big blind

#### Scenario: Post-flop action order

- **WHEN** any betting round after preflop begins with three or more players
- **THEN** the first player to act SHALL be the first active player clockwise of the button

#### Scenario: Street advances

- **WHEN** a betting round closes and more than one player remains active
- **THEN** the hand SHALL advance to the next street
- **AND** each player's contribution for the new round SHALL reset to zero while their total contribution to the hand is retained

### Requirement: Legal actions

The system SHALL permit only legal actions from the player whose turn it is, and SHALL reject actions from anyone else.

#### Scenario: Acting out of turn

- **WHEN** a player attempts an action while it is not their turn
- **THEN** the action SHALL be rejected and the table state SHALL be unchanged

#### Scenario: Check

- **WHEN** the acting player's contribution this round already equals the current bet
- **THEN** they SHALL be permitted to check, passing action on without adding chips

#### Scenario: Check is illegal facing a bet

- **WHEN** the acting player's contribution this round is less than the current bet
- **THEN** checking SHALL be rejected

#### Scenario: Call

- **WHEN** the acting player calls
- **THEN** they SHALL contribute the difference between the current bet and their contribution this round
- **AND** if their balance cannot cover that difference they SHALL contribute their entire balance and be marked all-in

#### Scenario: Fold

- **WHEN** the acting player folds
- **THEN** they SHALL become inactive for the remainder of the hand
- **AND** their existing contributions SHALL remain in the pot
- **AND** they SHALL NOT be required to reveal or enter any cards

#### Scenario: Raise in table-minimum increments

- **WHEN** the acting player raises
- **THEN** the resulting current bet SHALL be a whole multiple of the table minimum
- **AND** a raise that is not a multiple of the table minimum SHALL be rejected

#### Scenario: Raise below the current bet

- **WHEN** a player attempts to raise to an amount less than or equal to the current bet
- **THEN** the action SHALL be rejected

#### Scenario: All-in exempt from the increment rule

- **WHEN** a player goes all-in
- **THEN** their entire remaining balance SHALL be contributed regardless of whether it is a multiple of the table minimum

#### Scenario: Action beyond available balance

- **WHEN** a player attempts to bet or raise more than their balance
- **THEN** the action SHALL be rejected in favour of an explicit all-in

### Requirement: Betting round closure

The system SHALL close a betting round when every active player has acted since the last aggressive action and all active players have either matched the current bet or are all-in.

#### Scenario: All players check

- **WHEN** every active player checks in turn
- **THEN** the betting round SHALL close with no additional chips committed

#### Scenario: A raise reopens the action

- **WHEN** a player raises
- **THEN** every other active player who is not all-in SHALL be required to act again before the round can close

#### Scenario: Round closes on matched bets

- **WHEN** all active players have acted and every active player has either matched the current bet or is all-in
- **THEN** the betting round SHALL close

### Requirement: Hand ends when only one player remains

The system SHALL end a hand immediately when all players but one have folded.

#### Scenario: Everyone folds to one player

- **WHEN** every player but one has folded
- **THEN** the hand SHALL proceed directly to settlement
- **AND** the remaining player SHALL be awarded the pot without any cards being required

### Requirement: Skip to showdown when betting is exhausted

The system SHALL stop requesting betting actions once no further betting is possible.

#### Scenario: All remaining players are all-in

- **WHEN** a betting round closes and fewer than two active players still have a balance greater than zero
- **THEN** the system SHALL request no further betting actions
- **AND** the hand SHALL proceed to showdown
- **AND** any remaining board cards SHALL be treated as reveals that may be entered at any time

### Requirement: Showdown

The system SHALL resolve the hand either from entered cards or from an admin declaration, and SHALL never require card entry in order to proceed.

#### Scenario: Sufficient card data exists

- **WHEN** the hand reaches showdown and every eligible player's hole cards and all five board cards have been entered
- **THEN** the system SHALL evaluate the hands and award the pots automatically

#### Scenario: Card data is incomplete

- **WHEN** the hand reaches showdown and card data is insufficient to determine a winner
- **THEN** the system SHALL ask the admin to declare the winner
- **AND** the hand SHALL settle on that declaration

#### Scenario: Admin overrides an evaluation

- **WHEN** the admin declares a winner even though the system evaluated the hand
- **THEN** the admin's declaration SHALL take precedence

### Requirement: Hand state survives interruption

The system SHALL preserve an in-progress hand across process restarts and client disconnections.

#### Scenario: Server restarts mid-hand

- **WHEN** the application process restarts while a hand is in progress
- **THEN** the hand SHALL resume in exactly the state it was in, with the same pot, contributions, active players, street, and acting player
