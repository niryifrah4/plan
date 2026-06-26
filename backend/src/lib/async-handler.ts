import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wrap async route handlers so thrown errors / rejected promises flow to the
 * Express error middleware instead of crashing the process. Express 4 does
 * not await handlers, so without this an unhandled rejection escapes.
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
