// lib/adapters/index.ts
import { greenhouseAdapter } from "./greenhouse";
import { webAdapter } from "./web";
import type { AtsProvider } from "./types";

// Map of adapter entry points, add as expanded.
export const adapters: Record<AtsProvider, any> = {
  greenhouse: greenhouseAdapter,
  web: webAdapter,
};
