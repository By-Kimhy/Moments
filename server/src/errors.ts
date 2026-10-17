import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { translate, translateFields } from "./messages.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}

/** Parses input with a zod schema, or throws a 400 listing the bad fields. */
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new HttpError(400, "Some fields are invalid.", z.flattenError(result.error).fieldErrors as Record<string, string[]>);
  }
  return result.data;
}

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, "Not found."));
}

// Express 5 forwards rejected promises from handlers here. It needs all four parameters.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const language = req.acceptsLanguages("en", "km");
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: translate(err.message, language), fieldErrors: translateFields(err.fieldErrors, language) });
    return;
  }
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({ error: translate("Request body is not valid JSON.", language) });
    return;
  }
  console.error(err);
  res.status(500).json({ error: translate("Something went wrong.", language) });
}
