// شبیه‌ساز آموزشی اسکن پورت / nmap. هیچ بسته‌ای روی شبکه فرستاده نمی‌شود و هیچ
// سوکت واقعی باز نمی‌شود — WebView به سوکت خام TCP/UDP دسترسی ندارد. همهٔ نتایج
// از دادهٔ ساختگی (قطعی و قابل‌تکرار) ساخته می‌شوند تا مفهوم اسکن پورت را نشان دهند.

export type PortState = "open" | "closed" | "filtered";
export type PortResult = { port: number; state: PortState; service: string };

export const COMMON_PORTS: { port: number; service: string }[] = [
  { port: 21, service: "ftp" },
  { port: 22, service: "ssh" },
  { port: 23, service: "telnet" },
  { port: 25, service: "smtp" },
  { port: 53, service: "domain" },
  { port: 80, service: "http" },
  { port: 110, service: "pop3" },
  { port: 143, service: "imap" },
  { port: 443, service: "https" },
  { port: 3306, service: "mysql" },
  { port: 3389, service: "ms-wbt-server" },
  { port: 5432, service: "postgresql" },
  { port: 6379, service: "redis" },
  { port: 8080, service: "http-proxy" },
  { port: 8443, service: "https-alt" },
];

// هش قطعی و ساده برای تولید دادهٔ ساختگیِ یکسان برای یک «میزبان» مشخص
function seed(host: string): number {
  let h = 2166136261;
  for (let i = 0; i < host.length; i++) {
    h ^= host.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** اسکن ساختگی: برای همان host همیشه همان نتیجه را می‌دهد (آموزشی، آفلاین) */
export function simulateScan(host: string): PortResult[] {
  const s = seed(host.trim().toLowerCase() || "localhost");
  return COMMON_PORTS.map(({ port, service }, i) => {
    const r = (s >>> (i % 24)) & 0x7;
    const state: PortState = r === 0 ? "open" : r === 1 ? "filtered" : "closed";
    return { port, state, service };
  });
}

/** گزارش را شبیه خروجی nmap قالب‌بندی می‌کند (ولی با برچسب «شبیه‌سازی‌شده») */
export function formatScan(host: string, results: PortResult[]): string[] {
  const shown = results.filter((r) => r.state !== "closed");
  const openCount = results.filter((r) => r.state === "open").length;
  const lines = [
    "Starting NMAP-SIM (آموزشی/شبیه‌سازی‌شده — بدون ترافیک واقعی شبکه)",
    `Nmap scan report for ${host}`,
    "Host is up (0.0010s latency) [ساختگی]",
    "",
    "PORT     STATE     SERVICE",
  ];
  for (const r of shown) lines.push(`${String(r.port).padEnd(8)} ${r.state.padEnd(9)} ${r.service}`);
  if (!shown.length) lines.push("(هیچ پورت باز/فیلترشده‌ای در دادهٔ ساختگی نبود)");
  lines.push("", `NMAP-SIM done: 1 host, ${openCount} open port(s). داده ساختگی است؛ اسکن واقعی انجام نشد.`);
  return lines;
}
