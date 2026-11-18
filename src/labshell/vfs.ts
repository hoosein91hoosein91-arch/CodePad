// یک سیستم‌فایل مجازی و درون‌برنامه‌ای برای کنسول ترموکس‌مانند.
// هیچ ارتباطی با سیستم‌فایل واقعی اندروید/لینوکس ندارد — فقط فایل‌های برنامه‌های
// نصب‌شده (read-only زیر /apps) و یک فضای نوشتنی موقتی (زیر /home/user) را نشان می‌دهد.
// همه چیز داخل WebView است و با بستن کنسول (clear/exit) از بین می‌رود.

export type VfsApp = { name: string; files: { name: string; content: string }[]; assets?: string[] };

export type VNode =
  | { type: "dir"; name: string; children: VNode[] }
  | { type: "file"; name: string; content: string; readonly?: boolean };

export type VfsState = {
  cwd: string; // همیشه مطلق و نرمال‌شده، مثل "/home/user"
  scratch: Record<string, string>; // مسیر مطلق → محتوا (فقط زیر /home/user)
};

export const HOME = "/home/user";

export function newVfs(): VfsState {
  return {
    cwd: HOME,
    scratch: {
      "/home/user/README.txt":
        "به کنسول CodePad خوش آمدی.\n" +
        "این یک پوستهٔ شبیه‌سازی‌شدهٔ POSIX است که فقط داخل برنامه کار می‌کند.\n" +
        "- /apps  : فایل‌های برنامه‌های نصب‌شده (فقط‌خواندنی)\n" +
        "- /home/user : فضای نوشتنی موقتی (با بستن کنسول پاک می‌شود)\n" +
        "help را بزن تا فهرست فرمان‌ها را ببینی.\n" +
        "محدودیت صادقانه: این کنسول برنامهٔ واقعی لینوکس/باینری اجرا نمی‌کند.\n",
    },
  };
}

function appsDir(apps: VfsApp[]): VNode {
  return {
    type: "dir",
    name: "apps",
    children: apps.map((a) => ({
      type: "dir" as const,
      name: a.name,
      children: [
        ...a.files.map((f) => ({ type: "file" as const, name: f.name, content: f.content, readonly: true })),
        ...(a.assets && a.assets.length
          ? [{ type: "dir" as const, name: "attachments", children: a.assets.map((n) => ({ type: "file" as const, name: n, content: "(پیوست دودویی — با cat نمایش داده نمی‌شود)", readonly: true })) }]
          : []),
      ],
    })),
  };
}

function homeDir(scratch: Record<string, string>): VNode {
  // درخت را از مسیرهای مسطح زیر /home/user می‌سازد
  const root: VNode = { type: "dir", name: "user", children: [] };
  for (const [path, content] of Object.entries(scratch)) {
    const rel = path.replace(/^\/home\/user\/?/, "");
    if (!rel) continue;
    const parts = rel.split("/");
    let dir = root;
    for (let i = 0; i < parts.length - 1; i++) {
      let next = dir.children.find((c) => c.type === "dir" && c.name === parts[i]) as VNode | undefined;
      if (!next || next.type !== "dir") {
        next = { type: "dir", name: parts[i], children: [] };
        dir.children.push(next);
      }
      dir = next;
    }
    dir.children.push({ type: "file", name: parts[parts.length - 1], content });
  }
  return { type: "dir", name: "home", children: [root] };
}

export function buildTree(apps: VfsApp[], scratch: Record<string, string>): VNode {
  return { type: "dir", name: "", children: [appsDir(apps), homeDir(scratch)] };
}

/** مسیر را نسبت به cwd نرمال می‌کند و خروجی مطلق می‌دهد */
export function resolvePath(cwd: string, arg: string): string {
  const base = !arg || arg === "." ? cwd : arg.startsWith("/") ? arg : `${cwd}/${arg}`;
  const out: string[] = [];
  for (const part of base.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}

export function lookup(tree: VNode, path: string): VNode | null {
  if (path === "/" || path === "") return tree;
  let node: VNode = tree;
  for (const part of path.split("/")) {
    if (!part) continue;
    if (node.type !== "dir") return null;
    const next: VNode | undefined = node.children.find((c) => c.name === part);
    if (!next) return null;
    node = next;
  }
  return node;
}

export function isWritable(path: string): boolean {
  return path === HOME || path.startsWith(HOME + "/");
}
