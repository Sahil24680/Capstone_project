import { greenhouseAdapter } from "./greenhouse";
import type { Adapter, AtsProvider } from "./types";

export const adapters: Record<AtsProvider, Adapter> = {
  greenhouse: greenhouseAdapter,
};
