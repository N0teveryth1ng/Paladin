export type Selection =
  | { kind: 'component'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'edge'; id: string }
  | null;
