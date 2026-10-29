import {test} from "node:test";
import assert from "node:assert/strict";
import {buildChain, fingerprint, FOXY_ID, FOXY_PRESETS, mediaPath, escapeHTML, normalizeScare} from "../scripts/core.js";
import {FOXY_CLIPS} from "../scripts/foxy-data.js";
import {frameAtTime} from "../scripts/foxy.js";
import {isVideoPath} from "../scripts/media.js";

const scare = (id, nextId = "") => ({id, name: id, mode: "popup", image: "assets/test.png", sound: "", duration: 2, volume: 0.8, nextId});

test("preloads every item in a nested chain in order", () => {
  assert.deepEqual(buildChain("a", [scare("a", "b"), scare("b", FOXY_ID)]).map(s => s.id), ["a", "b", FOXY_ID]);
});
test("cycles and deleted successors cannot be launched", () => {
  assert.throws(() => buildChain("a", [scare("a", "b"), scare("b", "a")]), /цикл/);
  assert.throws(() => buildChain("a", [scare("a", "deleted")]), /не найден/);
});

test("multiple successors run in order including their own queues and repeated siblings", () => {
  const catalog = [{...scare("a"), nextIds:["b", "c", "b"]}, {...scare("b"), nextIds:["d"]}, scare("c"), scare("d")];
  const chain = buildChain("a", catalog);
  assert.deepEqual(chain.map(s => s.id), ["a", "b", "d", "c", "b", "d"]);
  assert.deepEqual(buildChain("a", chain), chain, "socket payload retains the same order");
  assert.throws(() => buildChain("a", [{...scare("a"), nextIds:["b", "c"]}, scare("b"), {...scare("c"), nextIds:["a"]}]), /цикл/);
  assert.throws(() => buildChain("a", [{...scare("a"), nextIds:[""]}]), /Выберите следующий/);
});

test("legacy links migrate without changing the original closing behavior", () => {
  const image = normalizeScare({...scare("a", "builtin-foxy-close"), mode:"image"});
  assert.deepEqual(image.nextIds, [FOXY_ID]);
  assert.equal(image.advance, "close");
  assert.equal(Object.hasOwn(image, "nextId"), false);
  assert.equal(normalizeScare(scare("a")).advance, "timer");
});

test("built-in animations allow follow-up queues without changing fixed parameters", () => {
  const preset = FOXY_PRESETS[0];
  const chain = buildChain(preset.id, [{id:preset.id, nextIds:["a", "b"], advance:"close", duration:50, volume:0}, scare("a"), scare("b")]);
  assert.deepEqual(chain.map(s => s.id), [preset.id, "a", "b"]);
  assert.deepEqual(chain[0], {...preset, nextIds:["a", "b"]});
  assert.throws(() => buildChain(preset.id, [{id:preset.id, nextIds:["a"]}, scare("a", preset.id)]), /цикл/);
});
test("Foxy parameters cannot be overridden by stored or socket data", () => {
  for (const preset of FOXY_PRESETS) assert.deepEqual(buildChain(preset.id, [{...preset, image: "evil.png", volume: 0, duration: 50, animation: "bad"}]), [{...preset}]);
});
test("five game-specific presets retain their frame timing", () => {
  assert.equal(FOXY_PRESETS.length, 5);
  assert.deepEqual(FOXY_PRESETS.map(s => s.animation), ["fnaf1", "fnaf2", "fnaf4", "sister-location", "fnaf6"]);
  for (const preset of FOXY_PRESETS) {
    const clip = FOXY_CLIPS[preset.animation];
    assert.equal(preset.duration * 1000, clip.durations.reduce((sum, ms) => sum + ms, 0));
    assert.equal(frameAtTime(clip.durations, 0), 0);
    assert.equal(frameAtTime(clip.durations, clip.durations[0] - 1), 0);
    assert.equal(frameAtTime(clip.durations, clip.durations[0]), 1);
    assert.equal(frameAtTime(clip.durations, preset.duration * 1000), clip.durations.length - 1);
  }
});
test("video types are detected independently of query strings and GIF images", () => {
  for (const path of ["clip.mp4", "clip.WEBM?token=1", "clip.m4v#start", "clip.ogv"]) assert.equal(isVideoPath(path), true);
  for (const path of ["animation.gif", "image.webp", "image.png?name=clip.mp4"]) assert.equal(isVideoPath(path), false);
});
test("saved chains using removed synthetic variants keep working", () => {
  for (const id of ["builtin-foxy-lunge", "builtin-foxy-close", "builtin-foxy-dark"]) {
    assert.deepEqual(buildChain("a", [scare("a", id)]).map(s => s.id), ["a", FOXY_ID]);
  }
});
test("resource, timing and volume edits invalidate preload; recipients do not", () => {
  const a = scare("a");
  const sig = fingerprint(buildChain("a", [a]));
  for (const change of [{image: "other.png"}, {sound: "sound.ogg"}, {duration: 3}, {volume: 0.2}, {mode: "image"}, {animation: "dark"}, {advance:"close"}]) {
    assert.notEqual(fingerprint(buildChain("a", [{...a, ...change}])), sig);
  }
  assert.equal(fingerprint(buildChain("a", [{...a, targetIds: ["player"]}])), sig);
  const catalog = [{...a, nextIds:["b", "c"]}, scare("b"), scare("c")];
  assert.notEqual(fingerprint(buildChain("a", catalog)), fingerprint(buildChain("a", [{...catalog[0], nextIds:["c", "b"]}, ...catalog.slice(1)])));
});
test("missing images, invalid duration, volume and mode fail before transmission", () => {
  for (const change of [{image: ""}, {duration: NaN}, {duration: 0}, {duration: 61}, {volume: -1}, {volume: 1.1}, {mode: "unknown"}, {advance:"unknown"}]) {
    assert.throws(() => buildChain("a", [{...scare("a"), ...change}]));
  }
});
test("resource paths and displayed names are constrained", () => {
  assert.equal(mediaPath("assets/мой скример.png"), "assets/мой скример.png");
  assert.equal(mediaPath("https://example.com/test.png"), "https://example.com/test.png");
  for (const path of ["javascript:alert(1)", "data:text/html,evil", "file:///secret", "blob:anything"]) assert.throws(() => mediaPath(path));
  assert.equal(escapeHTML('<img src="x">&'), "&lt;img src=&quot;x&quot;&gt;&amp;");
});
