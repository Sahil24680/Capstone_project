// lib/adapters/index.ts
import { greenhouseAdapter } from "./greenhouse";
import { webAdapter } from "./web";
import type { Adapter, AtsProvider } from "./types";

// Registry of adapters used by runtime and dev tools
export const adapters: Record<AtsProvider, Adapter> = {
  greenhouse: greenhouseAdapter,
  web: webAdapter,
};