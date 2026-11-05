import test from "node:test";
import assert from "node:assert/strict";
import { AnimationClip, NumberKeyframeTrack, Object3D } from "three";
import { createSnow360RiderAnimator } from "../components/snow360RiderAnimator.js";

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.00001, `${message || "pose"}: ${actual} != ${expected}`);
const clip = (name, start, end = start) => new AnimationClip(name, 1, [
  new NumberKeyframeTrack(".position[x]", [0, 1], [start, end]),
]);

function setup(animations = [clip("A", 10), clip("B", 20), clip("C", 30)]) {
  const character = new Object3D();
  character.position.x = -7;
  return { character, animator: createSnow360RiderAnimator(character, animations) };
}

test("the first pose has full weight immediately, without a bind-pose flash", () => {
  const { character, animator } = setup();
  animator.setPose("A", "initial");
  animator.update(0);
  close(character.position.x, 10);
  animator.dispose();
});

test("rapid interruptions start from the actual blended pose", () => {
  const { character, animator } = setup();
  animator.setPose("A", "initial");
  animator.update(0);
  animator.setPose("B", "second", { fadeSeconds: 0.13 });
  animator.update(0.02);
  close(character.position.x, 10 + 10 * 0.02 / 0.13);
  for (const [name, target, dt] of [["C", 30, 0.001], ["A", 10, 0.005], ["B", 20, 0.003]]) {
    const before = character.position.x;
    animator.setPose(name, name, { fadeSeconds: 0.13 });
    animator.update(0);
    close(character.position.x, before, "no instantaneous transition jump");
    animator.update(dt);
    close(character.position.x, before * (1 - dt / 0.13) + target * dt / 0.13, "captured-weight blend");
  }
  animator.update(0.13);
  close(character.position.x, 20, "outgoing poses no longer contribute");
  animator.dispose();
});

test("stable trick identities keep their clock; a repeated trick gets a fresh clock", () => {
  const { character, animator } = setup([clip("Trick", 0, 10)]);
  animator.setPose("Trick", "trick-1", { oneShot: true, timeScale: 2 });
  animator.update(0.2);
  close(character.position.x, 4);
  assert.equal(animator.setPose("Trick", "trick-1", { oneShot: true, timeScale: 2 }), false);
  animator.update(0.1);
  close(character.position.x, 6);
  animator.setPose("Trick", "trick-2", { oneShot: true, timeScale: 2, fadeSeconds: 0 });
  animator.update(0);
  close(character.position.x, 0, "new trick restarts");
  animator.update(0.7);
  close(character.position.x, 10, "one-shot holds its final pose");
  animator.update(0.2);
  close(character.position.x, 10);
  animator.setPose("Trick", "trick-3", { oneShot: true, timeScale: 2, fadeSeconds: 0.13 });
  animator.update(0);
  close(character.position.x, 10, "restart can blend from the previous instance");
  animator.update(0.065);
  close(character.position.x, 5.65);
  animator.dispose();
});

test("paused zero-time updates preserve both clip and transition progress", () => {
  const { character, animator } = setup([clip("A", 10), clip("Run", 20, 30)]);
  animator.setPose("A", "idle");
  animator.update(0);
  animator.setPose("Run", "run", { fadeSeconds: 0.2 });
  animator.update(0.05);
  const beforePause = character.position.x;
  for (let frame = 0; frame < 120; frame++) animator.update(0);
  close(character.position.x, beforePause);
  animator.update(0.05);
  close(character.position.x, 10 * 0.5 + 21 * 0.5, "resume continues from the saved clock");
  animator.dispose();
});

test("run-speed changes take effect without restarting the clip", () => {
  const { character, animator } = setup([clip("Run", 0, 10)]);
  animator.setPose("Run", "chase");
  animator.update(0.2);
  animator.setSpeed("Run", 0.5);
  animator.update(0.2);
  close(character.position.x, 3);
  animator.setSpeed("Run", 0);
  animator.update(0.2);
  close(character.position.x, 3);
  assert.equal(animator.setSpeed("Run", NaN), false);
  assert.equal(animator.setSpeed("missing", 1), false);
  animator.dispose();
});

test("reset clears run identity and disposals leave no action changing the character", () => {
  const { character, animator } = setup();
  animator.setPose("A", "ready");
  animator.update(0.1);
  animator.setPose("B", "ride");
  animator.update(0.03);
  animator.reset();
  close(character.position.x, -7, "original state restored");
  assert.equal(animator.setPose("B", "ride"), true);
  animator.update(0);
  close(character.position.x, 20, "new run starts at full weight");
  animator.dispose();
  animator.dispose();
  close(character.position.x, -7);
  assert.equal(animator.setPose("A", "ready"), false);
  animator.update(1);
  close(character.position.x, -7, "disposed animator cannot affect a replacement");
  const replacement = createSnow360RiderAnimator(character, [clip("B", 35)]);
  replacement.setPose("B", "ride");
  replacement.update(0);
  close(character.position.x, 35, "replacement starts with its own identity");
  replacement.dispose();
});

test("missing clips fall back to the snowboard idle when available", () => {
  const { character, animator } = setup([clip("SnowboardIdle", 4)]);
  assert.equal(animator.setPose("Unknown", "requested"), true);
  animator.update(0);
  close(character.position.x, 4);
  animator.dispose();
  const missing = setup([clip("A", 10)]);
  missing.animator.setPose("A", "known");
  missing.animator.update(0);
  assert.equal(missing.animator.setPose("Unknown", "unknown"), false);
  missing.animator.update(0.1);
  close(missing.character.position.x, 10);
  missing.animator.dispose();
});
