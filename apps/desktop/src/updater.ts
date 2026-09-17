export type UpdateProgress =
  | { state: "checking" }
  | { state: "uptodate" }
  | { state: "available"; version: string }
  | { state: "downloading"; pct: number }
  | { state: "ready"; version: string }
  | { state: "error"; message: string };

export async function checkForUpdates(onProgress?: (p: UpdateProgress) => void): Promise<boolean> {
  onProgress?.({ state: "uptodate" });
  return false;
}

export async function autoCheckAndPrompt(): Promise<void> {
  // Self-update will be implemented against ActiLens releases later.
}
