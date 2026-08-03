## Purpose

Replaces the manual state switch in App.tsx with URL-driven navigation using TanStack Router, giving the app standard browser navigation (back/forward) and shareable URLs.

## ADDED Requirements

### Requirement: URL-driven navigation

The system SHALL use URL-based routes to navigate between the join screen and the table view, with each route rendering the corresponding screen component.

#### Scenario: Join screen at root

- **WHEN** a user navigates to `/` without an active player name
- **THEN** the system SHALL render the join screen

#### Scenario: Table view at /play

- **WHEN** a user navigates to `/play` with an active player name
- **THEN** the system SHALL render the table view with WebSocket connection active

#### Scenario: Browser back navigates to join

- **WHEN** a user presses browser back from `/play`
- **THEN** the browser SHALL navigate to `/` and the join screen SHALL render

#### Scenario: Browser forward returns to table

- **WHEN** a user presses browser forward from `/`
- **THEN** the browser SHALL navigate to `/play` and the table view SHALL render with an active WebSocket connection

### Requirement: Protected route redirect

The system SHALL redirect unauthenticated users from protected routes to the join screen.

#### Scenario: Direct access to /play without name

- **WHEN** a user navigates directly to `/play` without a stored player name
- **THEN** the system SHALL redirect them to `/`

#### Scenario: Direct access to /play with stored name

- **WHEN** a user navigates directly to `/play` with a previously stored player name
- **THEN** the system SHALL render the table view and attempt WebSocket connection

### Requirement: Shared layout

The system SHALL render all routes within a root layout that provides the WebSocket context, so the connection lifecycle is managed once regardless of which route is active.

#### Scenario: Layout persists across route changes

- **WHEN** a user navigates from `/` to `/play`
- **THEN** the root layout SHALL remain mounted
- **AND** the WebSocket connection SHALL persist without reconnection
