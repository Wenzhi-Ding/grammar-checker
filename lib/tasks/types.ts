// lib/tasks/types.ts
import type { PolishResult } from "@/lib/providers/shared/schema";
import type { PolishError } from "@/lib/providers/shared/errors";

export type TaskStatus = "running" | "done" | "error" | "interrupted";

export interface PolishTask {
  id: string;                    // crypto.randomUUID()
  text: string;                  // snapshot of the source text at enqueue time
  createdAt: number;             // Date.now()
  providerId: string;
  model: string;
  status: TaskStatus;
  approxTokens: number;          // grows live while running (memory only)
  result?: PolishResult;         // set when done — restores the review state
  error?: PolishError;           // set when error
  unread: boolean;               // true only for tasks completed in the background
}
