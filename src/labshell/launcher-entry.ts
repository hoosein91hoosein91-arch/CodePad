/** Explicit project entry wins over bundled templates; old packs retain their original fallback. */
export function launcherEntry<T extends { name: string; content: string }>(app: { files: T[]; entryFile?: string }): T | undefined {
  const runnable = (f: T) => !/\.(css)$/i.test(f.name);
  return app.files.find((f) => f.name === app.entryFile && runnable(f))
    ?? app.files.find((f) => /^main\./i.test(f.name) && runnable(f))
    ?? app.files.find((f) => /\.nava$/i.test(f.name))
    ?? app.files.find((f) => /\.mix$/i.test(f.name))
    ?? app.files.find((f) => /\.html?$/i.test(f.name))
    ?? app.files.find(runnable);
}
