import test from "node:test";
import assert from "node:assert/strict";
import { FOCUS_PLAYLIST, matchesTrack, normalizeName, searchUrl } from "../mobile-src/assets/focus-playlist.js";
import { fetchStations, RADIO_TAGS } from "../mobile-src/assets/music.js";

const tracks = FOCUS_PLAYLIST.groups.flatMap((g) => g.tracks);
const find = (title) => tracks.find((t) => t.title === title);

test("focus playlist is a real list with notes and search links", () => {
  assert.ok(tracks.length >= 10);
  for (const t of tracks) { assert.ok(t.artist && t.title && t.note); assert.match(searchUrl(t), /^https:\/\/www\.youtube\.com\/results\?search_query=/); }
  assert.equal(new Set(tracks.map((t) => normalizeName(t.artist + t.title))).size, tracks.length, "no duplicates");
});

test("local files are matched by title words, not by loose substrings of other tracks", () => {
  assert.equal(matchesTrack("Hensonn - SAHARA (Official Video).mp4", find("SAHARA")), true);
  assert.equal(matchesTrack("sahara.mp3", find("SAHARA")), false, "title alone is too ambiguous");
  assert.equal(matchesTrack("Kordhell - Murder In My Mind.webm", find("Murder In My Mind")), true);
  assert.equal(matchesTrack("Kordhell - Scopin.mp4", find("Murder In My Mind")), false);
  assert.equal(matchesTrack("INTERWORLD - METAMORPHOSIS (Slowed).mp4", find("METAMORPHOSIS")), true);
  assert.equal(matchesTrack("random song.mp3", find("METAMORPHOSIS")), false);
});

const station = (n, url, extra = {}) => ({ stationuuid: "id" + n, name: "Phonk FM " + n, url_resolved: url, country: "DE", tags: "phonk,drift,bass", bitrate: 128, ...extra });
const reply = (body, ok = true) => async () => ({ ok, status: ok ? 200 : 503, json: async () => body });

test("radio: https only, de-duplicated, mapped to playable entries", async () => {
  const list = await fetchStations("phonk", { bases: ["https://x"], fetcher: reply([station(1, "https://a/stream"), station(2, "http://b/stream"), station(3, "https://a/stream"), station(4, "https://c/s", { name: "  " })]) });
  assert.deepEqual(list.map((s) => s.src), ["https://a/stream"]);
  assert.equal(list[0].kind, "radio"); assert.match(list[0].sub, /DE/);
  const http = await fetchStations("phonk", { bases: ["https://x"], allowHttp: true, fetcher: reply([station(1, "http://b/stream")]) });
  assert.equal(http.length, 1);
});

test("radio: fails over to the next server and reports a clear error when all fail", async () => {
  const seen = [];
  const fetcher = async (url) => { seen.push(new URL(url).host); if (seen.length === 1) throw new TypeError("network"); return { ok: true, status: 200, json: async () => [station(9, "https://ok/s")] }; };
  const list = await fetchStations("drift phonk", { bases: ["https://one", "https://two"], fetcher });
  assert.deepEqual(seen, ["one", "two"]); assert.equal(list[0].src, "https://ok/s");
  await assert.rejects(fetchStations("phonk", { bases: ["https://a", "https://b"], fetcher: reply([], false) }), /رادیو در دسترس نیست/);
  await assert.rejects(fetchStations("phonk", { bases: ["https://a"], fetcher: reply([]) }), /no https stations/);
  assert.ok(RADIO_TAGS.includes("phonk"));
});
