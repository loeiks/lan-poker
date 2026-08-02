# LAN Poker

A real-time poker table app for LAN parties. Cards stay physical — the app replaces chips, pot math, and hand evaluation. One device runs the server; everyone else joins through a phone browser on the same network.

## Features

- **Full poker rules** — blinds, button rotation, heads-up inversion, side pots, all-ins, uncalled bet returns, split pots
- **Auto-settlement** — when all board and hole cards are entered, the app evaluates hands and awards pots automatically
- **Credit system** — burnout credit, loss bonus, or disabled; nobody busts out for the night unless you choose that
- **Leaderboard** — live scoring based on balance and credit taken; final standings when the session ends
- **Admin panel** — drag-to-reorder seats, pick dealer before each hand, enter board cards, adjust balances, declare winners
- **Seat reorder** — rearrange player positions to match the real table by holding and dragging
- **Card picker** — tap any card slot to pick from a full 52-card deck with suit icons
- **Player hole cards** — enter your own cards, hidden by default with a reveal toggle
- **Transfers** — send chips to other players between hands
- **Mobile-first dark UI** — built for phones around a dimly lit table
- **Reconnect-safe** — lock your phone, unlock it, same state; balances and hand history survive restarts

## Quick Start (Docker)

```bash
docker build -t lan-poker .
docker run -p 1818:1818 -v lan-poker-data:/app/data lan-poker
```

Open `http://<server-ip>:1818` on any phone or laptop on the same network. The table is playable on defaults.

Customize with environment variables:

```bash
docker run -p 1818:1818 -v lan-poker-data:/app/data \
  -e TABLE_NAME="Friday Night" \
  -e TABLE_MIN=20 \
  -e TABLE_MODE=BURNOUT_CREDIT \
  -e STARTING_BALANCE=1400 \
  -e ADMIN_NAME=ali \
  -e DB_FILENAME=/app/data/friday.sqlite \
  lan-poker
```

| Variable           | Default                  | Example             | Description                                   |
| ------------------ | ------------------------ | ------------------- | --------------------------------------------- |
| `TABLE_NAME`       | random (e.g. `quiet-river`) | `"Friday Night"`  | Display name                                  |
| `TABLE_MIN`        | `10`                     | `20`                | Minimum bet                                   |
| `TABLE_MODE`       | `BURNOUT_CREDIT`         | `LOSS_BONUS`        | `BURNOUT_CREDIT`, `LOSS_BONUS`, or `DISABLED` |
| `STARTING_BALANCE` | `70 × TABLE_MIN`         | `1400`              | Starting chips per player                     |
| `ADMIN_NAME`       | _(none)_                 | `ali`               | Player that gets admin controls               |
| `DB_FILENAME`      | `./data/table.sqlite`    | `/app/data/fri.sqlite` | SQLite database path                        |

All variables are optional. The table is fully playable on defaults.

For design decisions (credit formulas, pot rules, event sourcing, identity model, etc.), see [`docs/DECISIONS.md`](docs/DECISIONS.md). For local development, see [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).
