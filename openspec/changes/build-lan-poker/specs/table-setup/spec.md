## Purpose

Configures the single poker table entirely from environment variables so that one person can bring the app up and have friends join in under five minutes, with no setup UI and no accounts to create.

## ADDED Requirements

### Requirement: Environment-driven configuration

The system SHALL read all table configuration from environment variables at startup and SHALL NOT provide any UI for creating or editing a table.

Recognized variables: `TABLE_NAME`, `TABLE_MIN`, `TABLE_MODE`, `STARTING_BALANCE`, `ADMIN_NAME`.

#### Scenario: All variables omitted

- **WHEN** the application starts with none of the recognized variables set
- **THEN** the table SHALL use a randomly generated table name
- **AND** `TABLE_MIN` SHALL default to `10`
- **AND** `TABLE_MODE` SHALL default to `BURNOUT_CREDIT`
- **AND** `STARTING_BALANCE` SHALL default to `70 × TABLE_MIN`
- **AND** the table SHALL start successfully with no admin designated

#### Scenario: Starting balance derived from table minimum

- **WHEN** `TABLE_MIN` is set to `25` and `STARTING_BALANCE` is not set
- **THEN** the starting balance SHALL be `1750`

#### Scenario: Starting balance explicitly overridden

- **WHEN** `TABLE_MIN` is set to `25` and `STARTING_BALANCE` is set to `500`
- **THEN** the starting balance SHALL be `500`

#### Scenario: Invalid configuration

- **WHEN** a variable is present but not parseable as its expected type, or `TABLE_MIN` or `STARTING_BALANCE` is less than or equal to zero, or `TABLE_MODE` is not one of `BURNOUT_CREDIT`, `LOSS_BONUS`, `DISABLED`
- **THEN** the application SHALL fail to start
- **AND** SHALL report which variable was invalid and what values are accepted

### Requirement: Table identity

The system SHALL assign the table a stable identifier and a display name that are visible to every player.

#### Scenario: Table identifier generated

- **WHEN** a table is created for the first time
- **THEN** the system SHALL generate a UUID as the table identifier
- **AND** SHALL persist it so it survives restarts

#### Scenario: Table name visible to players

- **WHEN** a player views the table
- **THEN** the table name and the table minimum SHALL be visible to them

### Requirement: Configuration is immutable for the life of a deployment

Table configuration SHALL be fixed at startup. Changing configuration requires restarting the application.

#### Scenario: Restart with changed table minimum

- **WHEN** the application is restarted with a different `TABLE_MIN` while persisted player balances exist
- **THEN** existing player balances SHALL be preserved unchanged
- **AND** the new table minimum SHALL apply to all subsequent hands

### Requirement: Admin designation

The system SHALL treat the player whose name matches `ADMIN_NAME` as the admin. Admin status SHALL NOT require a password or any other credential.

#### Scenario: Admin joins

- **WHEN** a player joins using the name configured in `ADMIN_NAME`
- **THEN** that player SHALL be granted admin actions
- **AND** admin actions SHALL be hidden from all other players

#### Scenario: Admin plays or spectates

- **WHEN** the admin is present at the table
- **THEN** the admin SHALL be able to either take a seat and play, or remain a spectator
- **AND** admin actions SHALL be available in both cases

#### Scenario: No admin configured

- **WHEN** `ADMIN_NAME` is not set
- **THEN** the table SHALL still accept players
- **AND** the system SHALL make clear that no hand can be started until an admin is present

### Requirement: Network exposure

The system SHALL serve the application on port `1818` over the local network so that players can reach it from their own devices.

#### Scenario: Player reaches the table over LAN

- **WHEN** a player on the same network opens the host machine's IP address on port `1818`
- **THEN** the join screen SHALL be served to them

#### Scenario: No internet connection available

- **WHEN** the host machine has no internet access
- **THEN** all functionality SHALL continue to work

### Requirement: Waiting for players state

The system SHALL present an explicit waiting state, rather than a non-functional start control, whenever a hand cannot legally begin.

#### Scenario: Fewer than two eligible players

- **WHEN** fewer than two players are simultaneously ready and holding a balance greater than zero
- **THEN** the table SHALL display a "waiting for players" state explaining what is missing
- **AND** the start control SHALL NOT be presented as available
