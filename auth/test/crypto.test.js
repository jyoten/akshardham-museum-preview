import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, parseHash, timingSafeEqual, sign, signedVerify } from "../src/crypto.js";

test("passwords are stored as salted PBKDF2 hashes and verify", async () => {
  const a = await hashPassword("a long enough password");
  const b = await hashPassword("a long enough password");
  assert.match(a, /^pbkdf2-sha256\$100000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.notEqual(a, b, "each hash has its own salt");
  assert.ok(!a.includes("a long enough password"));
  assert.equal(await verifyPassword("a long enough password", a), true);
  assert.equal(await verifyPassword("a long enough passwore", a), false);
  assert.equal(await verifyPassword("anything", null), false, "unknown user never matches");
  assert.equal(await verifyPassword("anything", "garbage"), false);
  assert.ok(parseHash(a));
});

test("constant-time comparison", () => {
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("abc", "abcd"), false);
  assert.equal(timingSafeEqual("", ""), true);
});

test("HMAC signatures", async () => {
  const secret = "s".repeat(32);
  const sig = await sign("hello", secret);
  assert.equal(await signedVerify("hello", sig, secret), true);
  assert.equal(await signedVerify("hellp", sig, secret), false);
  await assert.rejects(() => sign("x", "short"), /SESSION_SECRET/);
});
