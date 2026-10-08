/** Read both published launcher backup formats before any storage is changed. */
export type BackupApp = {
  name: string; icon: string; iconImage?: string; iconColor?: string; page?: number; pageIndex?: number;
  files: { name: string; content: string }[];
  assets: { name: string; type: string; b64: string }[];
};

export function appPage(app: { page?: number; pageIndex?: number }): number {
  const page = app.page ?? app.pageIndex ?? 0;
  return Number.isInteger(page) && page >= 0 ? page : 0;
}

export function readLauncherBackup(text: string): { apps: BackupApp[]; prefs: unknown } {
  const data = JSON.parse(text);
  if (!data || typeof data !== "object" || !Array.isArray(data.apps) ||
      (data.jibosBackup !== 1 && data.format !== "jibcode-launcher-backup-v1")) {
    throw new Error("فایل پشتیبان معتبر نیست.");
  }
  const apps = data.apps.map((raw: unknown): BackupApp => {
    if (!raw || typeof raw !== "object") throw new Error("برنامهٔ پشتیبان معتبر نیست.");
    const a = raw as Record<string, unknown>;
    if (typeof a.name !== "string" || !a.name.trim() || !Array.isArray(a.files) ||
        a.files.some((f: unknown) => !f || typeof f !== "object" || typeof (f as Record<string, unknown>).name !== "string" || typeof (f as Record<string, unknown>).content !== "string")) {
      throw new Error("فایل‌های برنامهٔ پشتیبان معتبر نیستند.");
    }
    // Original JSON backups did not contain assets; new backups always do.
    const assets = a.assets === undefined ? [] : a.assets;
    if (!Array.isArray(assets) || assets.some((s: unknown) => !s || typeof s !== "object" || typeof (s as Record<string, unknown>).name !== "string" || typeof (s as Record<string, unknown>).b64 !== "string" || typeof (s as Record<string, unknown>).type !== "string")) {
      throw new Error("پیوست‌های برنامهٔ پشتیبان معتبر نیستند.");
    }
    return { ...a, name: a.name, icon: typeof a.icon === "string" ? a.icon : "?", files: a.files, assets, page: appPage(a as BackupApp) } as BackupApp;
  });
  return { apps, prefs: data.jibosBackup === 1 ? data.prefs : data.preferences };
}
