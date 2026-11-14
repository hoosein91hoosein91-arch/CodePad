const __vite__mapDeps = (i, m = __vite__mapDeps, d = m.f || (m.f = ["./web-BHRuVEBF.js", "./main.js"])) =>
  i.map((i) => d[i]);
import { a as e, n as t } from "./main.js";
var n = e(`App`, {
  web: () =>
    t(
      () => import(`./web-BHRuVEBF.js`).then((e) => new e.AppWeb()),
      __vite__mapDeps([0, 1]),
      import.meta.url,
    ),
});
export { n as App };
