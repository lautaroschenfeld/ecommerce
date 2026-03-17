// Minimal HTTP primitives used by the custom Express server.
// This replaces the previous internal compatibility layer.

import type { NextFunction, Request, Response } from "express"

export type HttpRequest = Request
export type HttpResponse = Response
export type HttpNextFunction = NextFunction

export class HttpError extends Error {
  static Types = {
    INVALID_DATA: "invalid_data",
    NOT_FOUND: "not_found",
    UNAUTHORIZED: "unauthorized",
    UNEXPECTED_STATE: "unexpected_state",
  } as const

  type: (typeof HttpError.Types)[keyof typeof HttpError.Types]

  constructor(type: HttpError["type"], message: string) {
    super(message)
    this.type = type
    this.name = "HttpError"
  }
}
