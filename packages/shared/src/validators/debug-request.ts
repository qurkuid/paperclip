import { z } from "zod";

export const debugElementRectSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
}).strict();

export const debugElementContextSchema = z.object({
  pagePath: z.string().trim().min(1).max(2048).startsWith("/"),
  tagName: z.string().trim().min(1).max(40).regex(/^[a-z][a-z0-9-]*$/),
  selector: z.string().trim().min(1).max(1024),
  text: z.string().trim().max(500),
  role: z.string().trim().min(1).max(100).nullable(),
  ariaLabel: z.string().trim().min(1).max(300).nullable(),
  rect: debugElementRectSchema,
}).strict();

export const createDebugRequestSchema = z.object({
  request: z.string().trim().min(3).max(4000),
  pageTitle: z.string().trim().min(1).max(200),
  element: debugElementContextSchema,
  allowPaperclipServerRestart: z.literal(true),
}).strict();

export type DebugElementContext = z.infer<typeof debugElementContextSchema>;
export type CreateDebugRequest = z.infer<typeof createDebugRequestSchema>;
