const __vite__mapDeps = (
  i,
  m = __vite__mapDeps,
  d = m.f || (m.f = ["./web-DClUQMxz.js", "./standalone-DSlJSeP3.js", "./standalone-EeokGpfa.css"]),
) => i.map((i) => d[i]);
import { r as e, t } from "./standalone-DSlJSeP3.js";
var n = e(`App`, {
  web: () =>
    t(
      () => import(`./web-DClUQMxz.js`).then((e) => new e.AppWeb()),
      __vite__mapDeps([0, 1, 2]),
      import.meta.url,
    ),
});
export { n as App };
