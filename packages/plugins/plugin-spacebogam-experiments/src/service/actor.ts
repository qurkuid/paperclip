import type { PluginPerformActionContext } from "@paperclipai/plugin-sdk";

import { ServiceError } from "./errors.js";

type BoardActor = { readonly companyId: string; readonly userId: string };

export function requireBoardActor(context: PluginPerformActionContext): BoardActor {
  if (
    context.actor.type !== "user"
    || context.actor.companyId === null
    || context.actor.userId === null
    || context.companyId !== context.actor.companyId
  ) {
    throw new ServiceError("company_isolation_violation", "Board user context is required");
  }
  return { companyId: context.actor.companyId, userId: context.actor.userId };
}
