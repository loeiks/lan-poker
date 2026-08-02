import { useCallback, useEffect, useRef, useState } from "react";

import type { Card } from "~/domain/Card";
import type { PlayerName, Seq } from "~/domain/Ids";
import type { ActionIntent } from "~/rules/betting";
import type { TableSnapshot } from "~/state/snapshot";

// Mirrors `src/server/Messages.ts`'s `ServerMessage`. Plain JSON.parse here
// -- no need for Effect Schema in the client bundle; server is authoritative.
type ServerMessage =
  | { readonly type: "snapshot"; readonly snapshot: TableSnapshot }
  | {
      readonly type: "error";
      readonly tag: string;
      readonly message: string;
      readonly snapshot: TableSnapshot | undefined;
    };

export type ConnectionStatus = "connecting" | "open" | "closed";

/**
 * `JSON.stringify` turns `undefined` array elements to `null`.
 * `hand.board` slots arrive as `null` -- normalize here so consumers
 * can trust the declared type instead of needing their own null-checks.
 */
const normalizeSnapshot = (snapshot: TableSnapshot): TableSnapshot =>
  snapshot.hand === undefined
    ? snapshot
    : {
        ...snapshot,
        hand: {
          ...snapshot.hand,
          board: snapshot.hand.board.map((card) => card ?? undefined),
        },
      };

/** Wire shape for `ClientMessage` (see `src/server/Messages.ts`). Sent as-is via `JSON.stringify`. */
type OutgoingAction =
  | { readonly _tag: "Ready"; readonly seq: Seq }
  | { readonly _tag: "Unready"; readonly seq: Seq }
  | { readonly _tag: "Leave"; readonly seq: Seq }
  | {
      readonly _tag: "StartHand";
      readonly seq: Seq;
      readonly dealer?: PlayerName;
    }
  | { readonly _tag: "Act"; readonly seq: Seq; readonly intent: WireIntent }
  | {
      readonly _tag: "SetBoardCard";
      readonly seq: Seq;
      readonly index: number;
      readonly card: Card | null;
    }
  | {
      readonly _tag: "SetHoleCards";
      readonly seq: Seq;
      readonly target: PlayerName;
      readonly cards: readonly [Card, Card] | null;
    }
  | {
      readonly _tag: "DeclareWinners";
      readonly seq: Seq;
      readonly awards: ReadonlyArray<{
        readonly potIndex: number;
        readonly winners: ReadonlyArray<PlayerName>;
      }>;
    }
  | {
      readonly _tag: "AdjustBalance";
      readonly seq: Seq;
      readonly player: PlayerName;
      readonly next: number;
    }
  | {
      readonly _tag: "Transfer";
      readonly seq: Seq;
      readonly to: PlayerName;
      readonly amount: number;
    }
  | { readonly _tag: "ClaimCredit"; readonly seq: Seq }
  | { readonly _tag: "FinishSession"; readonly seq: Seq }
  | {
      readonly _tag: "ReorderSeats";
      readonly seq: Seq;
      readonly order: ReadonlyArray<PlayerName>;
    };

type WireIntent =
  | { readonly _tag: "check" }
  | { readonly _tag: "call" }
  | { readonly _tag: "fold" }
  | { readonly _tag: "raise"; readonly to: number }
  | { readonly _tag: "allin" };

const toWireIntent = (intent: ActionIntent): WireIntent => {
  switch (intent.kind) {
    case "check":
      return { _tag: "check" };
    case "call":
      return { _tag: "call" };
    case "fold":
      return { _tag: "fold" };
    case "raise":
      return { _tag: "raise", to: intent.to };
    case "allin":
      return { _tag: "allin" };
  }
};

const MAX_BACKOFF_MS = 4000;

export interface UseTable {
  readonly snapshot: TableSnapshot | undefined;
  readonly status: ConnectionStatus;
  readonly lastError: string | undefined;
  readonly send: (message: OutgoingAction) => void;
  readonly ready: (seq: Seq) => void;
  readonly unready: (seq: Seq) => void;
  readonly leave: (seq: Seq) => void;
  readonly startHand: (seq: Seq, dealer?: PlayerName) => void;
  readonly act: (seq: Seq, intent: ActionIntent) => void;
  readonly setBoardCard: (
    seq: Seq,
    index: number,
    card: Card | undefined,
  ) => void;
  readonly setHoleCards: (
    seq: Seq,
    target: PlayerName,
    cards: readonly [Card, Card] | undefined,
  ) => void;
  readonly declareWinners: (
    seq: Seq,
    awards: ReadonlyArray<{
      potIndex: number;
      winners: ReadonlyArray<PlayerName>;
    }>,
  ) => void;
  readonly adjustBalance: (seq: Seq, player: PlayerName, next: number) => void;
  readonly transfer: (seq: Seq, to: PlayerName, amount: number) => void;
  readonly claimCredit: (seq: Seq) => void;
  readonly finishSession: (seq: Seq) => void;
  readonly reorderSeats: (seq: Seq, order: ReadonlyArray<PlayerName>) => void;
}

// Owns the single WebSocket connection to `/ws`. Every inbound snapshot
// replaces local state wholesale, no diffing. Reconnect backs off but never
// gives up -- a phone locking is normal.
export const useTable = (name: string | undefined): UseTable => {
  const [snapshot, setSnapshot] = useState<TableSnapshot | undefined>(
    undefined,
  );
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [lastError, setLastError] = useState<string | undefined>(undefined);
  const wsRef = useRef<WebSocket | undefined>(undefined);
  const attemptRef = useRef(0);
  const closedByUsRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (name === undefined || name.length === 0) return;

    closedByUsRef.current = false;

    const connect = () => {
      setStatus("connecting");
      const url = new URL("/ws", window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("name", name);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        attemptRef.current = 0;
        setStatus("open");
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as ServerMessage;
          if (message.type === "snapshot") {
            setSnapshot(normalizeSnapshot(message.snapshot));
          } else {
            setLastError(message.message);
            if (message.snapshot !== undefined)
              setSnapshot(normalizeSnapshot(message.snapshot));
          }
        } catch {
          // Malformed frame: ignore, next snapshot will resync.
        }
      };

      ws.onclose = (event) => {
        setStatus("closed");
        if (closedByUsRef.current) return;
        console.warn(
          `lan-poker: /ws closed (code ${event.code}), reconnecting…`,
        );
        const delay = Math.min(1000 * 2 ** attemptRef.current, MAX_BACKOFF_MS);
        attemptRef.current += 1;
        timerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      closedByUsRef.current = true;
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = undefined;
    };
  }, [name]);

  const send = useCallback((message: OutgoingAction) => {
    const ws = wsRef.current;
    if (ws === undefined || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(message));
  }, []);

  return {
    snapshot,
    status,
    lastError,
    send,
    ready: (seq) => send({ _tag: "Ready", seq }),
    unready: (seq) => send({ _tag: "Unready", seq }),
    leave: (seq) => send({ _tag: "Leave", seq }),
    startHand: (seq, dealer) => {
      if (dealer !== undefined) send({ _tag: "StartHand", seq, dealer });
      else send({ _tag: "StartHand", seq });
    },
    act: (seq, intent) =>
      send({ _tag: "Act", seq, intent: toWireIntent(intent) }),
    setBoardCard: (seq, index, card) =>
      send({ _tag: "SetBoardCard", seq, index, card: card ?? null }),
    setHoleCards: (seq, target, cards) =>
      send({ _tag: "SetHoleCards", seq, target, cards: cards ?? null }),
    declareWinners: (seq, awards) =>
      send({ _tag: "DeclareWinners", seq, awards }),
    adjustBalance: (seq, player, next) =>
      send({ _tag: "AdjustBalance", seq, player, next }),
    transfer: (seq, to, amount) => send({ _tag: "Transfer", seq, to, amount }),
    claimCredit: (seq) => send({ _tag: "ClaimCredit", seq }),
    finishSession: (seq) => send({ _tag: "FinishSession", seq }),
    reorderSeats: (seq, order) => send({ _tag: "ReorderSeats", seq, order }),
  };
};
