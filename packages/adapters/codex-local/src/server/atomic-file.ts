import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function writePrivateFileAtomically(
  targetPath: string,
  contents: string,
): Promise<void> {
  const parentDir = path.dirname(targetPath);
  await fs.mkdir(parentDir, { recursive: true });
  const temporaryPath = path.join(
    parentDir,
    `.${path.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  try {
    await fs.writeFile(temporaryPath, contents, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    await fs.chmod(temporaryPath, 0o600);
    await fs.rename(temporaryPath, targetPath);
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}
