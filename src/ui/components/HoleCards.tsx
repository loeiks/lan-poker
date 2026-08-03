import { RiEyeLine, RiEyeOffLine } from "@remixicon/react";
import { useEffect, useRef, useState } from "react";

import type { Card } from "~/domain/Card";
import { CardPickerDialog } from "~/ui/components/CardPickerDialog";
import { PlayingCard } from "~/ui/components/PlayingCard";
import { Button } from "~/ui/components/ui/button";

const REVEAL_MS = 5000;

const SelfEntry = ({
  onSet,
}: {
  readonly onSet: (cards: readonly [Card, Card]) => void;
}) => {
  const [editingSlot, setEditingSlot] = useState<0 | 1 | undefined>(undefined);
  const [picked, setPicked] = useState<[Card | undefined, Card | undefined]>([
    undefined,
    undefined,
  ]);

  const bothPicked = picked[0] !== undefined && picked[1] !== undefined;

  return (
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
        disabled={!bothPicked}
        onClick={() => {
          if (bothPicked) onSet([picked[0]!, picked[1]!]);
        }}
      >
        Set my cards
      </Button>

      <CardPickerDialog
        open={editingSlot !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditingSlot(undefined);
        }}
        title={`Card ${(editingSlot ?? 0) + 1}`}
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

const REVEAL = "reveal";
const HIDE = "hide";

export const HoleCards = ({
  cards,
  onSet,
}: {
  readonly cards: readonly [Card, Card] | undefined;
  readonly onSet: ((cards: readonly [Card, Card]) => void) | undefined;
}) => {
  const [revealed, setRevealed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(
    () => () => {
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    },
    [],
  );

  if (onSet !== undefined && cards === undefined) {
    return <SelfEntry onSet={onSet} />;
  }

  if (cards === undefined) return null;

  const toggle = () => {
    if (revealed) {
      setRevealed(false);
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
      return;
    }
    setRevealed(true);
    timerRef.current = setTimeout(() => setRevealed(false), REVEAL_MS);
  };

  return (
    <div className="flex items-center gap-2">
      {cards.map((card, i) => (
        <PlayingCard key={i} card={card} hidden={!revealed} />
      ))}
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={revealed ? HIDE : REVEAL}
        onClick={toggle}
      >
        {revealed ? <RiEyeOffLine /> : <RiEyeLine />}
      </Button>
    </div>
  );
};
