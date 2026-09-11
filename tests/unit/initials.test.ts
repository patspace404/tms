import { describe, expect, it } from "vitest";

import { displayNameOf, initialsOf } from "@/lib/initials";

describe("initialsOf", () => {
  // Every one of these names is really in the workspace; five of the ten carry
  // a doubled space from Microsoft SSO, which is what produced "SUNDEFINED".
  it.each([
    ["Supat   Torsakun (Nui)", "ST"],
    ["Budsara  Sirisa (Snack)", "BS"],
    ["Songklod  Teerakul (Shong)", "ST"],
    ["Penradee  Klangsoontornrangsi (Bee)", "PK"],
    ["Sudhichai  Ungsuthornrungsi (Oh)", "SU"],
    ["Wirach Semwong (Axe)", "WS"],
    ["Sirikorn Na Lamphun (Nim)", "SN"],
    ["Supat T", "ST"],
    ["Bobby", "BO"],
    ["oa", "OA"],
  ])("%s → %s", (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });

  it("never renders the string 'undefined'", () => {
    expect(initialsOf("Supat   Torsakun (Nui)")).not.toContain("UNDEFINED");
  });

  it("skips a bracketed nickname rather than taking it as the surname", () => {
    // The other broken variant read the *last* word and produced "S(".
    expect(initialsOf("Supat (Nui)")).toBe("SU");
  });

  it("falls back to the email when there is no name", () => {
    expect(initialsOf(null, "penradee.k@socket9.com")).toBe("PE");
    expect(initialsOf("   ", "oh@isecthialand.com")).toBe("OH");
  });

  it("handles a Thai name written without spaces", () => {
    expect(initialsOf("สิริกร ณ ลำพูน")).toBe("สณ");
    expect(initialsOf("ทดสอบ")).toBe("ทด");
  });

  it("returns a placeholder rather than an empty badge", () => {
    expect(initialsOf(null, null)).toBe("?");
    expect(initialsOf("")).toBe("?");
  });
});

describe("displayNameOf", () => {
  it("prefers the name, then the email's local part", () => {
    expect(displayNameOf("Nim", "x@y.com")).toBe("Nim");
    expect(displayNameOf(null, "penradee.k@socket9.com")).toBe("penradee.k");
    expect(displayNameOf(null, null)).toBe("Unknown");
  });
});
