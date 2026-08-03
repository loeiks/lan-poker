import { RiDraggable } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";

import type { Card } from "~/domain/Card";
import type { PlayerName, Seq } from "~/domain/Ids";
import type { TableSnapshot } from "~/state/snapshot";
import { CardPickerDialog } from "~/ui/components/CardPickerDialog";
import { PlayingCard } from "~/ui/components/PlayingCard";
import { Button } from "~/ui/components/ui/button";
import { Input } from "~/ui/components/ui/input";
import { Separator } from "~/ui/components/ui/separator";
import type { UseTable } from "~/ui/hooks/useTable";

const HoleCardEntry = ({
  player,
  onSet,
}: {
  readonly player: PlayerName;
  readonly onSet: (cards: readonly [Card, Card] | undefined) => void;
}) => {
  const [editingSlot, setEditingSlot] = useState<0 | 1 | undefined>(undefined);
  const [picked, setPicked] = useState<[Card | undefined, Card | undefined]>([
    undefined,
    undefined,
  ]);
  const bothPicked = picked[0] !== undefined && picked[1] !== undefined;

  return (
    <div className="flex flex-col gap-1">
      <div className="text-foreground text-xs">{player}</div>
      <div className="flex flex-wrap items-start gap-2">
        {([0, 1] as const).map((slot) => (
          <PlayingCard
            key={slot}
            card={picked[slot]}
            hidden={false}
            onClick={() => setEditingSlot(slot)}
          />
        ))}
        <Button
          size="sm"
          variant="secondary"
          disabled={!bothPicked}
          onClick={() => {
            if (bothPicked) onSet([picked[0]!, picked[1]!]);
          }}
        >
          Set
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setPicked([undefined, undefined]);
            onSet(undefined);
          }}
        >
          Clear
        </Button>
      </div>
      <CardPickerDialog
        open={editingSlot !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditingSlot(undefined);
        }}
        title={`${player} — Card ${(editingSlot ?? 0) + 1}`}
        onPick={(card: Card | undefined) => {
          if (editingSlot !== undefined) {
            setPicked((prev) => {
              const next = [...prev] as [Card | undefined, Card | undefined];
              next[editingSlot] = card;
              return next;
            });
          }
          setEditingSlot(undefined);
        }}
      />
    </div>
  );
};

const ITEM_H = 44;

const SeatOrderSection = ({
  snapshot,
  table,
}: {
  readonly snapshot: TableSnapshot;
  readonly table: UseTable;
}) => {
  const seq = snapshot.seq as Seq;
  const [dealer, setDealer] = useState<PlayerName | undefined>(
    snapshot.nextDealer,
  );
  const [order, setOrder] = useState<ReadonlyArray<PlayerName>>([]);
  const [dragging, setDragging] = useState<number | undefined>(undefined);
  const [dragY, setDragY] = useState(0);
  const startYRef = useRef(0);
  const dragIdxRef = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    setOrder(snapshot.players.map((p) => p.name));
  }, [snapshot.players]);

  // Pre-select whoever auto-rotation would pick -- admin can still tap a
  // different player before starting. Stays undefined (blank) for the very
  // first hand, when there's no rotation to preview yet.
  useEffect(() => {
    setDealer(snapshot.nextDealer);
  }, [snapshot.nextDealer]);

  const commit = (o: ReadonlyArray<PlayerName>) => {
    table.reorderSeats(seq, o);
  };

  const pointerDown = (index: number, e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragIdxRef.current = index;
    setDragging(index);
    startYRef.current = e.clientY;
    setDragY(0);
  };

  const pointerMove = (e: React.PointerEvent) => {
    if (dragging === undefined) return;
    const dy = e.clientY - startYRef.current;

    if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      setDragY(dy);

      const slots = Math.max(0, order.length - 1);
      const target = dragIdxRef.current + Math.round(dy / ITEM_H);
      const clamped = target < 0 ? 0 : target > slots ? slots : target;

      if (clamped !== dragging) {
        setOrder((prev) => {
          const next = [...prev];
          const [moved] = next.splice(dragging, 1);
          next.splice(clamped, 0, moved!);
          return next;
        });
        startYRef.current += (clamped - dragging) * ITEM_H;
        dragIdxRef.current = clamped;
        setDragging(clamped);
        setDragY(0);
      }
    });
  };

  const pointerUp = () => {
    if (dragging === undefined) return;
    cancelAnimationFrame(rafRef.current!);
    commit(order);
    setDragging(undefined);
    setDragY(0);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col">
        <div className="text-muted-foreground mb-1 text-xs">
          Seat order — hold and drag to reorder
        </div>
        <div className="relative flex flex-col">
          {order.map((name, i) => {
            const isDragging = dragging === i;
            return (
              <div
                key={name}
                onPointerDown={(e) => pointerDown(i, e)}
                onPointerMove={pointerMove}
                onPointerUp={pointerUp}
                className={`flex h-11 cursor-grab touch-none items-center gap-2 rounded-lg px-2 transition-colors select-none active:cursor-grabbing ${isDragging ? "bg-secondary/60" : ""}`}
                style={{
                  transform: isDragging ? `translateY(${dragY}px)` : undefined,
                  zIndex: isDragging ? 10 : undefined,
                  opacity: isDragging ? 0.9 : undefined,
                }}
              >
                <RiDraggable className="text-muted-foreground size-4 shrink-0" />
                <span className="text-foreground truncate text-sm">{name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {snapshot.hand === undefined && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Dealer</div>
            <div className="flex flex-wrap gap-1">
              {snapshot.players.map((p) => (
                <Button
                  key={p.name}
                  type="button"
                  size="sm"
                  variant={dealer === p.name ? "default" : "secondary"}
                  className="rounded-full"
                  onClick={() =>
                    setDealer((d) => (d === p.name ? undefined : p.name))
                  }
                >
                  {p.name}
                </Button>
              ))}
            </div>
            <Button onClick={() => table.startHand(seq, dealer)}>
              Start hand
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export const AdminPanel = ({
  snapshot,
  table,
}: {
  readonly snapshot: TableSnapshot;
  readonly table: UseTable;
}) => {
  const seq = snapshot.seq as Seq;
  const [awards, setAwards] = useState<
    Record<number, ReadonlyArray<PlayerName>>
  >({});
  const [balanceEdits, setBalanceEdits] = useState<Record<string, string>>({});

  const hand = snapshot.hand;

  const toggleWinner = (potIndex: number, player: PlayerName) => {
    setAwards((prev) => {
      const current = prev[potIndex] ?? [];
      const next = current.includes(player)
        ? current.filter((p) => p !== player)
        : [...current, player];
      return { ...prev, [potIndex]: next };
    });
  };

  const submitDeclaration = () => {
    if (hand === undefined) return;
    table.declareWinners(
      seq,
      hand.pots.map((_, i) => ({ potIndex: i, winners: awards[i] ?? [] })),
    );
    setAwards({});
  };

  return (
    <div className="flex flex-col gap-4 overflow-y-auto">
      <SeatOrderSection snapshot={snapshot} table={table} />

      {hand !== undefined && hand.street === "showdown" && (
        <div className="flex flex-col gap-2">
          {hand.pots.map((pot, i) => (
            <div key={i} className="flex flex-col gap-1">
              <div className="text-muted-foreground text-xs">
                Pot {i + 1}: {pot.amount}
              </div>
              <div className="flex flex-wrap gap-1">
                {pot.eligible.map((player) => (
                  <Button
                    key={player}
                    type="button"
                    size="sm"
                    variant={
                      (awards[i] ?? []).includes(player)
                        ? "default"
                        : "secondary"
                    }
                    className="rounded-full"
                    onClick={() => toggleWinner(i, player)}
                  >
                    {player}
                  </Button>
                ))}
              </div>
            </div>
          ))}
          <Button onClick={submitDeclaration}>Declare winners</Button>
        </div>
      )}

      {hand !== undefined && (
        <>
          <Separator />
          <div className="flex flex-col gap-2">
            <div className="text-muted-foreground text-xs">Hole cards</div>
            {hand.players.map((player) => (
              <HoleCardEntry
                key={player}
                player={player}
                onSet={(cards) => table.setHoleCards(seq, player, cards)}
              />
            ))}
          </div>
        </>
      )}

      <Separator />
      <div className="flex flex-col gap-1">
        <div className="text-muted-foreground text-xs">Balances</div>
        {snapshot.players.map((p) => (
          <div key={p.name} className="flex items-center gap-2">
            <div className="text-foreground w-20 truncate text-xs">
              {p.name}
            </div>
            <Input
              value={balanceEdits[p.name] ?? String(p.balance)}
              onChange={(e) =>
                setBalanceEdits((prev) => ({
                  ...prev,
                  [p.name]: e.target.value,
                }))
              }
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                const n = Number(balanceEdits[p.name] ?? p.balance);
                if (Number.isFinite(n) && n >= 0)
                  table.adjustBalance(seq, p.name, n);
              }}
            >
              Set
            </Button>
          </div>
        ))}
      </div>

      {hand !== undefined && (
        <>
          <Separator />
          <Button
            variant="outline"
            className="text-destructive"
            onClick={() => {
              if (
                window.confirm(
                  "Discard the hand in progress? Every bet placed this hand is refunded and everyone returns to ready-up.",
                )
              ) {
                table.abortHand(seq);
              }
            }}
          >
            Discard current hand
          </Button>
        </>
      )}

      <Separator />
      <Button variant="destructive" onClick={() => table.finishSession(seq)}>
        Finish session
      </Button>
      <Button
        variant="destructive"
        onClick={() => {
          if (
            window.confirm(
              "Wipe EVERYTHING? Every player, balance, and hand from this table's history is deleted permanently. This cannot be undone.",
            )
          ) {
            table.wipeEverything(seq);
          }
        }}
      >
        Wipe everything
      </Button>
    </div>
  );
};
