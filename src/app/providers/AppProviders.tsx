// src/app/providers/AppProviders.tsx

import type { ReactNode } from "react";

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { MantineProvider } from "@mantine/core";
import { ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(import.meta.env.PUBLIC_CONVEX_URL, {
  logger: false,
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <MantineProvider forceColorScheme="dark" defaultColorScheme="dark">
      <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>
    </MantineProvider>
  );
}
