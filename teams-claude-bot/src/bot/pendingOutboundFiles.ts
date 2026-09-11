import { randomUUID } from "node:crypto";

export type PendingOutboundFile = {
  id: string;
  fileName: string;
  buffer: Buffer;
  description: string;
  createdAt: number;
  email: string | null;
};

const TTL_MS = 15 * 60 * 1000;
const store = new Map<string, PendingOutboundFile>();

function sweep(): void {
  const now = Date.now();
  for (const [id, file] of store) {
    if (now - file.createdAt > TTL_MS) store.delete(id);
  }
}

export function putPendingOutboundFile(input: {
  fileName: string;
  buffer: Buffer;
  description: string;
  email: string | null;
}): PendingOutboundFile {
  sweep();
  const id = randomUUID();
  const entry: PendingOutboundFile = {
    id,
    fileName: input.fileName,
    buffer: input.buffer,
    description: input.description,
    createdAt: Date.now(),
    email: input.email,
  };
  store.set(id, entry);
  return entry;
}

export function takePendingOutboundFile(
  id: string,
): PendingOutboundFile | null {
  sweep();
  const entry = store.get(id);
  if (!entry) return null;
  store.delete(id);
  return entry;
}

export function peekPendingOutboundFile(
  id: string,
): PendingOutboundFile | null {
  sweep();
  return store.get(id) ?? null;
}
