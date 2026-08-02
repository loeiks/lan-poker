import { Context, Effect, Layer, Ref } from "effect";

import type { PlayerName } from "~/domain/Ids";
import { encodeServerMessage, snapshotMessage } from "~/server/Messages";
import { Table } from "~/services/Table";

// Tracks open sockets (one player may have several) and fans out
// per-recipient snapshots, since hole cards differ by recipient. No
// reconnect logic: reconnecting is just opening a new connection.

export interface Connection {
  readonly id: number;
  readonly player: PlayerName;
  readonly send: (frame: string) => void;
}

export interface BroadcastService {
  /** Register an open socket for a player and send it its first snapshot. */
  readonly connect: (
    player: PlayerName,
    send: (frame: string) => void,
  ) => Effect.Effect<number>;
  /** Remove a socket. Game state is untouched. */
  readonly disconnect: (id: number) => Effect.Effect<void>;
  /** Push a fresh snapshot to every open socket for one player. */
  readonly sendTo: (player: PlayerName) => Effect.Effect<void>;
  /** Push a fresh per-recipient snapshot to every currently connected socket. */
  readonly broadcastAll: Effect.Effect<void>;
}

export class Broadcast extends Context.Service<Broadcast, BroadcastService>()(
  "@lan-poker/Broadcast",
) {
  static readonly layer = Layer.effect(
    Broadcast,
    Effect.suspend(() => make),
  );
}

const make = Effect.gen(function* () {
  const table = yield* Table;
  const connections = yield* Ref.make(new Map<number, Connection>());
  let nextId = 0;

  const sendSnapshotTo = (connection: Connection): Effect.Effect<void> =>
    Effect.map(table.snapshotFor(connection.player), (snapshot) => {
      connection.send(encodeServerMessage(snapshotMessage(snapshot)));
    });

  const connect = (
    player: PlayerName,
    send: (frame: string) => void,
  ): Effect.Effect<number> =>
    Effect.gen(function* () {
      const id = nextId++;
      const connection: Connection = { id, player, send };
      yield* Ref.update(connections, (map) => new Map(map).set(id, connection));
      yield* sendSnapshotTo(connection);
      return id;
    });

  const disconnect = (id: number): Effect.Effect<void> =>
    Ref.update(connections, (map) => {
      if (!map.has(id)) return map;
      const next = new Map(map);
      next.delete(id);
      return next;
    });

  const sendTo = (player: PlayerName): Effect.Effect<void> =>
    Effect.gen(function* () {
      const map = yield* Ref.get(connections);
      const targets = [...map.values()].filter((c) => c.player === player);
      yield* Effect.forEach(targets, sendSnapshotTo, { discard: true });
    });

  const broadcastAll: Effect.Effect<void> = Effect.gen(function* () {
    const map = yield* Ref.get(connections);
    yield* Effect.forEach([...map.values()], sendSnapshotTo, { discard: true });
  });

  return { connect, disconnect, sendTo, broadcastAll };
});
