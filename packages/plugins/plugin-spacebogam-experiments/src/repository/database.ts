export interface ExperimentDatabase {
  readonly namespace: string;
  query(sql: string, params?: readonly unknown[]): Promise<unknown[]>;
  execute(
    sql: string,
    params?: readonly unknown[],
  ): Promise<{ readonly rowCount: number }>;
}

const SAFE_NAMESPACE = /^[a-z_][a-z0-9_]*$/u;

export function repositoryTable(
  database: ExperimentDatabase,
  name: string,
): string {
  if (!SAFE_NAMESPACE.test(database.namespace)) {
    throw new Error("Invalid plugin database namespace");
  }
  return `${database.namespace}.${name}`;
}
