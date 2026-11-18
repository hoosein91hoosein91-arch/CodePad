export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const bare = specifier.slice(2);
    const file = bare.endsWith(".ts") || bare.endsWith(".tsx") ? bare : `${bare}.ts`;
    const url = new URL(`../src/${file}`, import.meta.url);
    return nextResolve(url.href, context);
  }
  return nextResolve(specifier, context);
}
