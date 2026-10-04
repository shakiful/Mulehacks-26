import type { ErrorEnvelope, FieldError } from "./types";

export class ApiError extends Error {
  readonly code: string;
  readonly details: FieldError[];
  constructor(
    readonly status: number,
    envelope: ErrorEnvelope,
  ) {
    super(envelope.error.message);
    this.name = "ApiError";
    this.code = envelope.error.code;
    this.details = envelope.error.details;
  }
}

export function fail(
  status: number,
  code: string,
  message: string,
  details: FieldError[] = [],
): never {
  throw new ApiError(status, { error: { code, message, details } });
}

export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
