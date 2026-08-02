import { RiCheckLine } from "@remixicon/react";

import type { PlayerName } from "~/domain/Ids";
import type { HandView, PlayerView } from "~/state/snapshot";
import { Avatar, AvatarBadge, AvatarFallback } from "~/ui/components/ui/avatar";
import { Badge } from "~/ui/components/ui/badge";
import { avatarColor } from "~/ui/lib/color";
import { cn } from "~/ui/lib/utils";

const PlayerAvatar = ({
  player,
  isDealer,
  isActing,
  bet,
  folded,
  showReady,
  isWinner,
}: {
  readonly player: PlayerView;
  readonly isDealer: boolean;
  readonly isActing: boolean;
  readonly bet: number | undefined;
  readonly folded: boolean;
  readonly showReady: boolean;
  readonly isWinner: boolean;
}) => (
  <div
    className={cn(
      "flex w-16 shrink-0 flex-col items-center gap-1 rounded-lg",
      isWinner ? "py-2" : "py-1",
      isWinner && "bg-emerald-500/15 ring-1 ring-emerald-500/30",
    )}
  >
    <div className="relative">
      <Avatar
        size="lg"
        className={cn(
          isActing &&
            "ring-primary ring-offset-background ring-2 ring-offset-2",
          folded && "opacity-40",
        )}
      >
        <AvatarFallback
          className="font-semibold text-white"
          style={{ backgroundColor: avatarColor(player.name) }}
        >
          {player.name.charAt(0).toUpperCase()}
        </AvatarFallback>
        {isDealer && (
          <AvatarBadge className="bg-foreground text-background text-[10px]">
            D
          </AvatarBadge>
        )}
      </Avatar>
      {showReady && player.ready && (
        <span className="bg-primary text-primary-foreground ring-background absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full ring-2">
          <RiCheckLine className="size-3" />
        </span>
      )}
    </div>
    <div className="text-foreground truncate text-xs">{player.name}</div>
    <div className="tabular text-muted-foreground text-xs">
      {player.balance}
    </div>
    {bet !== undefined && bet > 0 && (
      <Badge className="tabular rounded-full">{bet}</Badge>
    )}
  </div>
);

/** Horizontal wrapping row of player avatars, Offsuit-style (no table graphic). */
export const PlayerAvatarRow = ({
  players,
  hand,
  lastWinners,
}: {
  readonly players: ReadonlyArray<PlayerView>;
  readonly hand: HandView | undefined;
  readonly lastWinners: ReadonlyArray<PlayerName> | undefined;
}) => {
  const contribution = (name: string) =>
    hand?.contributions.find((c) => c.player === name)?.amount;

  const winners = lastWinners !== undefined ? new Set(lastWinners) : undefined;

  // `seatOrder` runs clockwise (action moves to increasing index); mirror
  // the row so that turn order reads right-to-left on screen instead of
  // left-to-right.
  const displayOrder = [...players].reverse();

  return (
    <div className="flex flex-wrap justify-center gap-3 px-2 py-3">
      {displayOrder.map((player) => (
        <PlayerAvatar
          key={player.name}
          player={player}
          isDealer={hand?.button === player.name}
          isActing={hand?.actingPlayer === player.name}
          bet={contribution(player.name)}
          folded={hand?.folded.includes(player.name) ?? false}
          showReady={hand === undefined}
          isWinner={winners?.has(player.name) ?? false}
        />
      ))}
    </div>
  );
};
