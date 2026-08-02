import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";

import type { TableId } from "~/domain/Ids";
import { AppConfig } from "~/services/AppConfig";

const tableId = "t1" as TableId;

/** Run `AppConfig.layer` against a fixed set of env vars, no real process.env. */
const withEnv = (env: Record<string, string>) =>
  Layer.provide(
    AppConfig.layer,
    ConfigProvider.layer(ConfigProvider.fromUnknown(env)),
  );

const build = (env: Record<string, string>) =>
  Effect.provide(
    Effect.flatMap(AppConfig, (config) =>
      Effect.succeed(config.build(tableId)),
    ),
    withEnv(env),
  );

describe("AppConfig", () => {
  it.effect(
    "every variable omitted falls back to the documented defaults",
    () =>
      Effect.gen(function* () {
        const config = yield* build({});
        expect(config.minimum).toBe(10);
        expect(config.mode).toBe("BURNOUT_CREDIT");
        expect(config.startingBalance).toBe(700);
        expect(config.adminName).toBeUndefined();
        expect(config.name.length).toBeGreaterThan(0);
      }),
  );

  it.effect("the starting balance derives from the table minimum", () =>
    Effect.gen(function* () {
      const config = yield* build({ TABLE_MIN: "25" });
      expect(config.minimum).toBe(25);
      expect(config.startingBalance).toBe(1750);
    }),
  );

  it.effect("an explicit starting balance overrides the derived one", () =>
    Effect.gen(function* () {
      const config = yield* build({ TABLE_MIN: "25", STARTING_BALANCE: "500" });
      expect(config.startingBalance).toBe(500);
    }),
  );

  it.effect(
    "TABLE_NAME and ADMIN_NAME are read straight through and normalized",
    () =>
      Effect.gen(function* () {
        const config = yield* build({
          TABLE_NAME: "friday-night",
          ADMIN_NAME: "Enes",
        });
        expect(config.name).toBe("friday-night");
        expect(config.adminName).toBe("enes");
      }),
  );

  it.effect("an unparseable TABLE_MIN fails startup naming the variable", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(build({ TABLE_MIN: "not-a-number" }));
      expect(String(error)).toContain("TABLE_MIN");
    }),
  );

  it.effect("a zero TABLE_MIN fails startup", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(build({ TABLE_MIN: "0" }));
      expect(String(error)).toContain("TABLE_MIN");
    }),
  );

  it.effect("a negative STARTING_BALANCE fails startup", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(build({ STARTING_BALANCE: "-5" }));
      expect(String(error)).toContain("STARTING_BALANCE");
    }),
  );

  it.effect(
    "an unrecognized TABLE_MODE fails startup naming the accepted values",
    () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(build({ TABLE_MODE: "FREE_MONEY" }));
        expect(String(error)).toContain("TABLE_MODE");
      }),
  );

  it.effect("an unusable ADMIN_NAME fails startup", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(build({ ADMIN_NAME: "two words" }));
      expect(String(error)).toContain("ADMIN_NAME");
    }),
  );

  it.effect("the test layer builds a config with sane defaults for tests", () =>
    Effect.gen(function* () {
      const config = yield* Effect.provide(
        Effect.flatMap(AppConfig, (c) => Effect.succeed(c.build(tableId))),
        AppConfig.testLayer(),
      );
      expect(config.id).toBe(tableId);
      expect(config.minimum).toBe(10);
      expect(config.startingBalance).toBe(700);
    }),
  );
});
