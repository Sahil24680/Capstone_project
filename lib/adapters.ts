// lib/adapters.ts
// Central registry of ATS adapters
// Import this rather than many adapters
import { greenhouseAdapter } from "./adapters/greenhouse";
import { webAdapter, buildWebJobKey } from "./adapters/web";
import type { AdapterJob } from "./adapters/types";

export type AtsProvider = "greenhouse" | "web";

// Export the registry that testAdapter will consume
export const adapters: Record<AtsProvider, (...args: any[]) => Promise<AdapterJob | null>> = {
  greenhouse: greenhouseAdapter,
  web: webAdapter,
};

export { buildWebJobKey };
