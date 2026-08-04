import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";

import type { Seq } from "~/domain/Ids";
import type { UseTable } from "~/ui/hooks/useTable";
import { useTable } from "~/ui/hooks/useTable";
import appCss from "~/ui/styles.css?url";

const NAME_KEY = "lan-poker:name";

function storedName(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${NAME_KEY}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

function syncCookie(name: string | undefined) {
  if (typeof window === "undefined") return;
  if ("cookieStore" in window) {
    const cs = window.cookieStore as CookieStore;
    if (name) {
      cs.set({ name: NAME_KEY, value: name, path: "/" });
    } else {
      cs.delete({ name: NAME_KEY, path: "/" });
    }
    return;
  }
  if (name) {
    // biome-ignore lint/suspicious/noDocumentCookie: fallback for browsers without Cookie Store API
    document.cookie = `${NAME_KEY}=${encodeURIComponent(name)}; path=/; max-age=31536000`;
  } else {
    // biome-ignore lint/suspicious/noDocumentCookie: fallback for browsers without Cookie Store API
    document.cookie = `${NAME_KEY}=; path=/; max-age=0`;
  }
}

export interface TableContext {
  readonly name: string | undefined;
  readonly table: UseTable;
  readonly join: (n: string) => void;
  readonly leave: () => void;
}

const TableCtx = createContext<TableContext | undefined>(undefined);

export function useTableContext(): TableContext {
  const ctx = useContext(TableCtx);
  if (!ctx) throw new Error("useTableContext must be used within RootLayout");
  return ctx;
}

const getPlayerNameFromCookie = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getCookie } = await import("@tanstack/react-start/server");
    return getCookie(NAME_KEY);
  },
);

export const Route = createRootRoute({
  loader: async () => {
    const name = await getPlayerNameFromCookie();
    return { name };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover",
      },
      { title: "LAN Poker" },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico" },
      { rel: "stylesheet", href: appCss },
    ],
  }),
  notFoundComponent: () => null,
  component: RootComponent,
});

function RootComponent() {
  const { name: cookieName } = Route.useLoaderData();
  const [name, setName] = useState<string | undefined>(
    cookieName ?? storedName(),
  );
  const table = useTable(name);

  const join = (n: string) => {
    syncCookie(n);
    setName(n);
  };

  const leave = () => {
    if (table.snapshot) {
      table.leave(table.snapshot.seq as Seq);
    }
    syncCookie(undefined);
    setName(undefined);
  };

  return (
    <TableCtx value={{ name, table, join, leave }}>
      <RootDocument>
        <Outlet />
      </RootDocument>
    </TableCtx>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
