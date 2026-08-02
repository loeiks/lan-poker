import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { Cause, Effect, Exit, Layer, ManagedRuntime, Result } from "effect";

import { normalizePlayerName, type PlayerName } from "~/domain/Ids";
import type { ActionIntent } from "~/rules/betting";
import {
  decodeClientMessage,
  encodeServerMessage,
  errorMessage,
  type ClientMessage,
} from "~/server/Messages";
import { AppConfig } from "~/services/AppConfig";
import { Broadcast } from "~/services/Broadcast";
import { EventStore } from "~/services/EventStore";
import {
  Table,
  type TableIntentError,
  type TableService,
} from "~/services/Table";

// Single Bun process serving HTTP and WebSocket. Handlers stay thin: decode,
// run one Effect against the runtime built here, encode the result back.
// No Effect logic inline in a callback.

const DB_FILENAME = process.env["DB_FILENAME"] ?? "./data/table.sqlite";
console.log(`lan-poker: using DB_FILENAME=${DB_FILENAME}`);

// bun:sqlite fails with SQLITE_CANTOPEN rather than creating a missing
// parent directory (e.g. a fresh checkout with no `data/` yet).
mkdirSync(dirname(DB_FILENAME), { recursive: true });

// Without these, an exception thrown outside an Effect boundary (a plain
// throw in a sync callback, a rejected promise nobody awaited) kills the
// whole Bun process silently -- every open WebSocket drops at once and the
// only visible symptom is a downstream EPIPE in whatever's proxying to us.
process.on("uncaughtException", (error) => {
  console.error("lan-poker: uncaughtException", error);
});
process.on("unhandledRejection", (reason) => {
  console.error("lan-poker: unhandledRejection", reason);
});

const TableLayer = Table.layer.pipe(
  Layer.provide(
    Layer.merge(EventStore.layer({ filename: DB_FILENAME }), AppConfig.layer),
  ),
);

const AppLayer = Broadcast.layer.pipe(Layer.provideMerge(TableLayer));

const runtime = ManagedRuntime.make(AppLayer);

interface SocketData {
  readonly player: PlayerName;
  connectionId: number | undefined;
}

const playerNameFromRequest = (req: Request): PlayerName | undefined => {
  const url = new URL(req.url);
  const raw = url.searchParams.get("name");
  if (raw === null) return undefined;
  const normalized = normalizePlayerName(raw);
  return normalized.ok ? normalized.name : undefined;
};

type WireActionIntent = Extract<
  ClientMessage,
  { readonly _tag: "Act" }
>["intent"];

/** The wire payload uses `_tag` (Schema.TaggedStruct); `rules/betting` uses `kind`. */
const toActionIntent = (intent: WireActionIntent): ActionIntent => {
  switch (intent._tag) {
    case "check":
      return { kind: "check" };
    case "call":
      return { kind: "call" };
    case "fold":
      return { kind: "fold" };
    case "raise":
      return { kind: "raise", to: intent.to };
    case "allin":
      return { kind: "allin" };
  }
};

/** Every client message mapped onto the `Table` method it represents. */
const runClientMessage = (
  table: TableService,
  player: PlayerName,
  message: ClientMessage,
): Effect.Effect<unknown, TableIntentError> => {
  switch (message._tag) {
    case "Ready":
      return table.ready(player, message.seq);
    case "Unready":
      return table.unready(player, message.seq);
    case "Leave":
      return table.leave(player, message.seq);
    case "StartHand":
      return table.startHand(player, message.seq, message.dealer);
    case "Act":
      return table.act(player, message.seq, toActionIntent(message.intent));
    case "SetBoardCard":
      return table.setBoardCard(
        player,
        message.seq,
        message.index,
        message.card ?? undefined,
      );
    case "SetHoleCards":
      return table.setHoleCards(
        player,
        message.seq,
        message.target,
        message.cards ?? undefined,
      );
    case "DeclareWinners":
      return table.declareWinners(player, message.seq, message.awards);
    case "AdjustBalance":
      return table.adjustBalance(
        player,
        message.seq,
        message.player,
        message.next,
      );
    case "Transfer":
      return table.transfer(player, message.seq, message.to, message.amount);
    case "ClaimCredit":
      return table.claimCredit(player, message.seq);
    case "FinishSession":
      return table.finishSession(player, message.seq);
    case "ReorderSeats":
      return table.reorderSeats(player, message.seq, message.order);
  }
};

const DIST_DIR = `${process.cwd()}/dist`;

const serveStatic = async (pathname: string): Promise<Response> => {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const file = Bun.file(`${DIST_DIR}${requested}`);
  if (await file.exists()) return new Response(file);
  const index = Bun.file(`${DIST_DIR}/index.html`);
  if (await index.exists()) return new Response(index);
  return new Response("lan-poker: run `bun run build` first", { status: 404 });
};

const server = Bun.serve<SocketData>({
  port: 1818,
  fetch(req, bunServer) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const player = playerNameFromRequest(req);
      if (player === undefined) {
        return new Response("missing or invalid ?name=", { status: 400 });
      }
      const upgraded = bunServer.upgrade(req, {
        data: { player, connectionId: undefined },
      });
      return upgraded ? undefined : new Response(null, { status: 400 });
    }

    // No server-side routing, so fall back to index.html for the SPA.
    return serveStatic(url.pathname);
  },
  websocket: {
    open(ws) {
      void runtime
        .runPromiseExit(
          Effect.gen(function* () {
            const table = yield* Table;
            const broadcast = yield* Broadcast;
            yield* table.join(ws.data.player);
            // Send the initial snapshot to this socket immediately so the
            // connecting client never hangs at "Connecting…". broadcastAll
            // follows to sync every other client.
            const id = yield* broadcast.connect(ws.data.player, (frame) =>
              ws.send(frame),
            );
            ws.data.connectionId = id;
            yield* broadcast.broadcastAll;
          }),
        )
        .then((exit) => {
          if (Exit.isFailure(exit)) {
            const cause = exit.cause;
            console.error("ws open failed", Cause.pretty(cause));
          }
        });
    },
    message(ws, raw) {
      const text = typeof raw === "string" ? raw : raw.toString();
      void runtime
        .runPromiseExit(
          Effect.gen(function* () {
            const table = yield* Table;
            const broadcast = yield* Broadcast;

            const decodedExit = yield* Effect.exit(decodeClientMessage(text));
            if (Exit.isFailure(decodedExit)) {
              ws.send(
                JSON.stringify({
                  type: "error",
                  tag: "IllegalFrame",
                  message: "That message could not be understood.",
                  snapshot: undefined,
                }),
              );
              return;
            }

            const outcome = yield* Effect.result(
              runClientMessage(table, ws.data.player, decodedExit.value),
            );
            if (Result.isSuccess(outcome)) {
              yield* broadcast.broadcastAll;
              return;
            }

            const error = outcome.failure;
            const fresh =
              error._tag === "StaleSequence"
                ? yield* table.snapshotFor(ws.data.player)
                : undefined;
            ws.send(encodeServerMessage(errorMessage(error, fresh)));
          }),
        )
        .then((exit) => {
          if (Exit.isFailure(exit))
            console.error("ws message failed", Cause.pretty(exit.cause));
        });
    },
    close(ws) {
      const id = ws.data.connectionId;
      if (id === undefined) return;
      void runtime
        .runPromise(Effect.flatMap(Broadcast, (b) => b.disconnect(id)))
        .catch((error) => console.error("ws close failed", error));
    },
  },
});

console.log(`lan-poker listening on http://localhost:${server.port}`);
