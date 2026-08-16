import type { ExperimentDatabase } from "./repository/database.js";
import { createRepositoryReader } from "./repository/read.js";
import { createExperimentMutations } from "./repository/experiment-mutations.js";
import { createEntryMutations } from "./repository/entry-mutations.js";
import { createAppendOperations } from "./repository/append.js";

export type { ExperimentDatabase } from "./repository/database.js";
export {
  ExperimentRepositoryError,
  type ExperimentDetail,
  type ExperimentPatch,
  type EntryWrite,
} from "./repository/types.js";

export function createExperimentRepository(database: ExperimentDatabase) {
  const reader = createRepositoryReader(database);
  return {
    ...reader,
    ...createExperimentMutations(database, reader),
    ...createEntryMutations(database, reader),
    ...createAppendOperations(database),
  };
}
