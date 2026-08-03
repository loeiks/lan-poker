<!-- effect-solutions:start -->

## Effect Best Practices

**IMPORTANT:** Always consult effect-solutions before writing Effect code.

1. Run `effect-solutions list` to see available guides
2. Run `effect-solutions show <topic>...` for relevant patterns (supports multiple topics)
3. Search `~/.local/share/effect-solutions/effect` for real implementations

Topics: quick-start, project-setup, tsconfig, basics, services-and-layers, data-modeling, error-handling, config, testing, cli.

Never guess at Effect patterns - check the guide first.

## Local Effect Source

The Effect v4 repository is cloned to `~/.local/share/effect-solutions/effect` for reference.
Use this to explore APIs, find usage examples, and understand implementation
details when the documentation isn't enough.
<!-- effect-solutions:end -->

## Development Rules

1. We are using Bun as runtime + package manager so use `bun` and `bunx` if ever needed NOT `npm` or `pnpm`.
2. Update package.json scripts if needed and always keep them as simple as possible.
3. DONT kill/stop development server of developer, if there is a running instance of same port it means developer started it, use that one instead of killing and re-creating new one.
4. DONT add useless and/or unhelpful comments that is especially long, keep comments as short as possible and add them when **really** needed not just you wanted to add, never explain what code does, only add comments that provide info that couldn't be understood by looking at the code.
5. When you need to check types use `bun run typecheck` shortly.
6. Never use `as any` like TypeScript patterns, this kills the meaning of TS usage. Respect Effect errors and fix them.