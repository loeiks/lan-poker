import type { Standing } from "~/rules/credit";

/** Standings rows, used both standalone and embedded in the header's dropdown menu. */
export const Leaderboard = ({
  standings,
}: {
  readonly standings: ReadonlyArray<Standing>;
}) => (
  <div className="flex flex-col gap-1">
    {standings.map((s) => (
      <div key={s.player} className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <span className="tabular text-muted-foreground">{s.rank}.</span>
          <span className="text-foreground">{s.player}</span>
          {!s.seated && <span className="text-muted-foreground">(left)</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="tabular text-muted-foreground">
            credit {s.creditTaken}
          </span>
          <span className="tabular text-foreground font-medium">{s.score}</span>
        </div>
      </div>
    ))}
  </div>
);
