import test from "node:test";
import assert from "node:assert/strict";
import { isFavorite, toggleFavorite, listFavorites, favoriteCount } from "../mobile-src/assets/hub-favorites.js";

const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

test("toggleFavorite flips state and isFavorite reflects it", () => {
  const st = mem();
  assert.equal(isFavorite("py", "basics_hello", st), false);
  assert.equal(toggleFavorite("py", "basics_hello", st), true);
  assert.equal(isFavorite("py", "basics_hello", st), true);
  assert.equal(toggleFavorite("py", "basics_hello", st), false);
  assert.equal(isFavorite("py", "basics_hello", st), false);
});

test("favorites are namespaced by kind; same id in two kinds does not collide", () => {
  const st = mem();
  toggleFavorite("py", "x1", st);
  assert.equal(isFavorite("py", "x1", st), true);
  assert.equal(isFavorite("ref", "x1", st), false);
  toggleFavorite("ref", "x1", st);
  assert.equal(isFavorite("ref", "x1", st), true);
  assert.equal(favoriteCount("py", st), 1);
  assert.equal(favoriteCount("ref", st), 1);
});

test("listFavorites returns newest first and only the requested kind", async () => {
  const st = mem();
  toggleFavorite("py", "a", st);
  await new Promise((r) => setTimeout(r, 2));
  toggleFavorite("py", "b", st);
  toggleFavorite("ref", "c", st);
  const pyList = listFavorites("py", st);
  assert.deepEqual(pyList.map((x) => x.id), ["b", "a"]);
  assert.equal(listFavorites("ref", st).length, 1);
});

test("state survives a broken storage without throwing", () => {
  const broken = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); } };
  assert.equal(isFavorite("py", "z", broken), false);
  assert.doesNotThrow(() => toggleFavorite("py", "z", broken));
});
