import { register } from "node:module";

register("./alias-hooks.mjs", import.meta.url);
await import("./jib-selftest.ts");
