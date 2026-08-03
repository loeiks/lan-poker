import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";

import type { Seq } from "~/domain/Ids";
import type { UseTable } from "~/ui/hooks/useTable";
import { useTable } from "~/ui/hooks/useTable";
import appCss from "~/ui/styles.css?url";

const NAME_KEY = "lan-poker:name";

function nameStorage(): Storage {
  if (typeof window === "undefined") return null as unknown as Storage;
  return import.meta.env.MODE === "development" ? sessionStorage : localStorage;
}

function storedName(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return nameStorage().getItem(NAME_KEY) ?? undefined;
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

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
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
  const [name, setName] = useState<string | undefined>(storedName);
  const table = useTable(name);

  const join = (n: string) => {
    nameStorage().setItem(NAME_KEY, n);
    setName(n);
  };

  const leave = () => {
    if (table.snapshot) {
      table.leave(table.snapshot.seq as Seq);
    }
    nameStorage().removeItem(NAME_KEY);
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
