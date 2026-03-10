import type { FastifyReply } from "fastify";
import type { ErrorDescriptor, ErrorParams } from "@hexagonia/shared";
import { z } from "zod";

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly errorCode: string,
    public readonly errorParams?: ErrorParams
  ) {
    super(errorCode);
    this.name = "AppError";
  }
}

export function createErrorDescriptorError(
  errorCode: string,
  errorParams?: ErrorParams
): Error & ErrorDescriptor {
  const error = new Error(errorCode) as Error & ErrorDescriptor;
  error.errorCode = errorCode;
  if (errorParams) {
    error.errorParams = errorParams;
  }
  return error;
}

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  errorCode: string,
  errorParams?: ErrorParams
): FastifyReply {
  return reply.code(statusCode).send({
    errorCode,
    ...(errorParams ? { errorParams } : {})
  });
}

export function getErrorDescriptor(error: unknown): ErrorDescriptor | null {
  if (!error || typeof error !== "object" || !("errorCode" in error)) {
    return null;
  }

  const errorCode = (error as { errorCode?: unknown }).errorCode;
  if (typeof errorCode !== "string" || errorCode.length === 0) {
    return null;
  }

  const errorParams = (error as { errorParams?: unknown }).errorParams;
  return {
    errorCode,
    ...(errorParams && typeof errorParams === "object" ? { errorParams: errorParams as ErrorParams } : {})
  };
}

export function getZodErrorDescriptor(error: z.ZodError): ErrorDescriptor {
  const firstIssue = error.issues[0];
  if (!firstIssue) {
    return {
      errorCode: "validation.invalid_input"
    };
  }

  const field = String(firstIssue.path[0] ?? "");

  if (field === "username" && firstIssue.code === "too_small" && typeof firstIssue.minimum === "number") {
    return {
      errorCode: "validation.username_too_short",
      errorParams: { minimum: firstIssue.minimum }
    };
  }

  if (field === "username" && firstIssue.code === "too_big" && typeof firstIssue.maximum === "number") {
    return {
      errorCode: "validation.username_too_long",
      errorParams: { maximum: firstIssue.maximum }
    };
  }

  if (field === "username") {
    return {
      errorCode: firstIssue.message || "validation.username_invalid"
    };
  }

  if (field === "password" && firstIssue.code === "too_small" && typeof firstIssue.minimum === "number") {
    return {
      errorCode: "validation.password_too_short",
      errorParams: { minimum: firstIssue.minimum }
    };
  }

  if (field === "password" && firstIssue.code === "too_big" && typeof firstIssue.maximum === "number") {
    return {
      errorCode: "validation.password_too_long",
      errorParams: { maximum: firstIssue.maximum }
    };
  }

  if (field === "seatIndex") {
    return {
      errorCode: "validation.seat_invalid"
    };
  }

  if (field === "ready") {
    return {
      errorCode: "validation.ready_invalid"
    };
  }

  return {
    errorCode:
      firstIssue.message && firstIssue.message.startsWith("validation.")
        ? firstIssue.message
        : "validation.invalid_input"
  };
}
