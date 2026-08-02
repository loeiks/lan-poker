import {
  Config,
  ConfigProvider,
  Context,
  Effect,
  Layer,
  Option,
  Schema,
} from "effect";

import { Chips } from "~/domain/Chips";
import { describePlayerNameProblem, normalizePlayerName } from "~/domain/Ids";
import type { PlayerName, TableId } from "~/domain/Ids";
import { CreditMode, HOUSE_RULES, TableConfig } from "~/domain/TableConfig";

// Env vars validated to a `TableConfig` at startup, so a typo'd TABLE_MODE
// fails loudly instead of misbehaving quietly. The table id isn't read here
// -- it comes from EventStore for restart stability -- so `build` takes it
// as a parameter, keeping this testable without persistence.

const PositiveChips = Schema.NumberFromString.pipe(
  Schema.check(Schema.isInt()),
  Schema.check(Schema.isGreaterThan(0)),
);

const adjectives = [
  "quiet",
  "lucky",
  "loud",
  "late",
  "friendly",
  "wild",
  "steady",
  "sharp",
] as const;

const nouns = [
  "river",
  "flush",
  "table",
  "felt",
  "chip",
  "deck",
  "showdown",
  "button",
] as const;

/** A friendly default when nobody bothers to name the table. */
export const randomTableName = (random: () => number = Math.random): string => {
  const adjective = adjectives[Math.floor(random() * adjectives.length)]!;
  const noun = nouns[Math.floor(random() * nouns.length)]!;
  return `${adjective}-${noun}`;
};

const configError = (message: string): Config.ConfigError =>
  new Config.ConfigError(new ConfigProvider.SourceError({ message }));

/**
 * `Config.orElse` swallows validation errors, so a malformed-but-present
 * value would silently fall back to the default. Check presence separately.
 */
const readOptional = <A>(
  name: string,
  schema: Schema.Codec<A, string>,
  fallback: () => A,
): Effect.Effect<A, Config.ConfigError> =>
  Effect.gen(function* () {
    const raw = yield* Config.option(Config.nonEmptyString(name));
    if (raw._tag === "None") return fallback();
    return yield* Schema.decodeUnknownEffect(schema)(raw.value).pipe(
      Effect.mapError((issue) => configError(`${name}: ${issue.message}`)),
    );
  });

export interface AppConfigService {
  /** Everything but the table id, which the caller supplies. */
  readonly build: (id: TableId) => TableConfig;
}

export class AppConfig extends Context.Service<AppConfig, AppConfigService>()(
  "@lan-poker/AppConfig",
) {
  static readonly layer = Layer.effect(
    AppConfig,
    Effect.suspend(() => make),
  );

  static readonly testLayer = (
    overrides: Partial<Omit<TableConfigInit, "id">> = {},
  ) =>
    Layer.succeed(AppConfig, {
      build: (id) => new TableConfig({ ...defaults(id), ...overrides, id }),
    });
}

type TableConfigInit = ConstructorParameters<typeof TableConfig>[0];

const defaults = (id: TableId): TableConfigInit => ({
  id,
  name: randomTableName(),
  minimum: Chips.make(10),
  mode: "BURNOUT_CREDIT",
  startingBalance: Chips.make(10 * HOUSE_RULES.startingBalanceMultiplier),
  adminName: undefined,
});

const make = Effect.gen(function* () {
  const name = yield* readOptional(
    "TABLE_NAME",
    Schema.String,
    randomTableName,
  );

  const minimum = yield* readOptional(
    "TABLE_MIN",
    PositiveChips,
    () => 10,
  ).pipe(Effect.map((n) => Chips.make(n)));

  const mode = yield* readOptional(
    "TABLE_MODE",
    CreditMode,
    () => "BURNOUT_CREDIT" as CreditMode,
  );

  const startingBalance = yield* readOptional(
    "STARTING_BALANCE",
    PositiveChips,
    () => minimum * HOUSE_RULES.startingBalanceMultiplier,
  ).pipe(Effect.map((n) => Chips.make(n)));

  const rawAdminName = yield* Config.option(
    Config.nonEmptyString("ADMIN_NAME"),
  );
  const adminName = yield* Option.match(rawAdminName, {
    onNone: () => Effect.sync(() => undefined as PlayerName | undefined),
    onSome: (raw) => {
      const normalized = normalizePlayerName(raw);
      return normalized.ok
        ? Effect.succeed<PlayerName | undefined>(normalized.name)
        : Effect.fail(
            configError(
              `ADMIN_NAME: ${describePlayerNameProblem(normalized.problem)}`,
            ),
          );
    },
  });

  const build = (id: TableId): TableConfig =>
    new TableConfig({ id, name, minimum, mode, startingBalance, adminName });

  return { build };
});
