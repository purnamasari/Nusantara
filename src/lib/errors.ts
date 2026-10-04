// Coded errors shared by every layer (plan §11.6).

export type ErrorCode =
  | 'WEBGL2_UNAVAILABLE'
  | 'CONFIG_INVALID'
  | 'HEIGHTMAP_FETCH_FAILED'
  | 'HEIGHTMAP_INVALID'
  | 'GENERATION_INVALID'
  | 'SAVE_CORRUPT'
  | 'SAVE_INCOMPATIBLE'
  | 'SAVE_WRITE_FAILED'
  | 'UNEXPECTED';

const FATAL: Record<ErrorCode, boolean> = {
  WEBGL2_UNAVAILABLE: true,
  CONFIG_INVALID: true,
  HEIGHTMAP_FETCH_FAILED: true,
  HEIGHTMAP_INVALID: true,
  GENERATION_INVALID: true,
  SAVE_CORRUPT: false,
  SAVE_INCOMPATIBLE: false,
  SAVE_WRITE_FAILED: false,
  UNEXPECTED: true,
};

export class GameError extends Error {
  readonly code: ErrorCode;
  readonly details: readonly string[];
  readonly fatal: boolean;

  constructor(code: ErrorCode, message: string, details: readonly string[] = []) {
    super(message);
    this.name = 'GameError';
    this.code = code;
    this.details = details;
    this.fatal = FATAL[code];
  }
}

export function toGameError(err: unknown): GameError {
  if (err instanceof GameError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new GameError('UNEXPECTED', message);
}
