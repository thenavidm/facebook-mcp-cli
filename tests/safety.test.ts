/**
 * The two switches, as 0.2 read them. A Page post is public the moment it
 * lands and a delete cannot be undone, so they are two different switches, and
 * both are off until someone turns them on.
 */

import { describe, expect, it } from "vitest";
import { deletesOn, writesOff } from "../src/config.js";

describe("the write switches", () => {
  it("keeps writes off by default and turns them on with FACEBOOK_ALLOW_WRITE=true", () => {
    expect(writesOff({})).toBe(true);
    expect(writesOff({ FACEBOOK_ALLOW_WRITE: "true" })).toBe(false);
    expect(writesOff({ FACEBOOK_ALLOW_WRITE: "yes" })).toBe(true);
  });

  it("lets Slipway's FACEBOOK_READ_ONLY decide when it is set", () => {
    expect(writesOff({ FACEBOOK_READ_ONLY: "0" })).toBe(false);
    expect(writesOff({ FACEBOOK_READ_ONLY: "1", FACEBOOK_ALLOW_WRITE: "true" })).toBe(true);
  });

  it("still keeps deleting off when only writing is on", () => {
    // Deleting is the one action with no undo, so turning writes on must not
    // quietly turn it on too.
    expect(deletesOn({ FACEBOOK_ALLOW_WRITE: "true" })).toBe(false);
    expect(deletesOn({ FACEBOOK_ALLOW_DELETE: "true" })).toBe(true);
    expect(deletesOn({ FACEBOOK_ALLOW_DESTRUCTIVE: "1" })).toBe(true);
    expect(deletesOn({ FACEBOOK_ALLOW_DESTRUCTIVE: "0", FACEBOOK_ALLOW_DELETE: "true" })).toBe(false);
  });
});
