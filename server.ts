import { Cause, Effect, Exit, Layer, ManagedRuntime, Result } from "effect";
import { normalizePlayerName } from "~/domain/Ids";
import type { PlayerName } from "~/domain/Ids";
import type { ActionIntent } from "~/rules/betting";
import {
  decodeClientMessage,
  encodeServerMessage,
  errorMessage,
} from "~/server/Messages";
import type { ClientMessage } from "~/server/Messages";
import { AppConfig } from "~/services/AppConfig";
import { Broadcast } from "~/services/Broadcast";
import { EventStore } from "~/services/EventStore";
import {
  Table,
  type TableIntentError,
  type TableService,
} from "~/services/Table";

const DB_FILENAME = process.env.DB_FILENAME ?? "./db/table.sqlite";
console.log(`lan-poker: using DB_FILENAME=${DB_FILENAME}`);

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
    case "AbortHand":
      return table.abortHand(player, message.seq);
    case "WipeEverything":
      return table.wipeAll(player, message.seq);
  }
};

async function getHandler() {
  try {
    // @ts-expect-error — dist/server/server.js exists only after build
    const mod = await import("./dist/server/server.js");
    return (mod.default as { fetch: (req: Request) => Response }).fetch;
  } catch {
    return null;
  }
}

const handler = await getHandler();

const PORT = Number(process.env.PORT ?? 1818);

const server = Bun.serve<SocketData>({
  port: PORT,
  fetch(req, bunServer) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const player = playerNameFromRequest(req);
      if (!player) {
        return new Response("missing or invalid ?name=", { status: 400 });
      }
      const upgraded = bunServer.upgrade(req, {
        data: { player, connectionId: undefined },
      });
      return upgraded ? undefined : new Response(null, { status: 400 });
    }

    if (handler) return handler(req);
    return new Response("lan-poker: run `bun run build` first", {
      status: 404,
    });
  },
  websocket: {
    open(ws) {
      void runtime
        .runPromiseExit(
          Effect.gen(function* () {
            const table = yield* Table;
            const broadcast = yield* Broadcast;
            yield* table.join(ws.data.player);
            const id = yield* broadcast.connect(ws.data.player, (frame) =>
              ws.send(frame),
            );
            ws.data.connectionId = id;
            yield* broadcast.broadcastAll;
          }),
        )
        .then((exit) => {
          if (Exit.isFailure(exit)) {
            console.error("ws open failed", Cause.pretty(exit.cause));
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
