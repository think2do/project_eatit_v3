import { describe, it, expect } from "vitest";
import { PERSONA_MAP, getPersona } from "../personas";

// ★ L0 #6 Persona 4-name lock contract ★
// Any rename of Sarah/Marcus/Lin/Daniel or their style mappings = immediate fail.
// Three-layer enforcement: ① TS Literal type ② Object.freeze+as const ③ this test.

describe("PERSONA_MAP — L0 4-name lock", () => {
  // MARK: Key set lock

  it("PERSONA_MAP has exactly 4 keys: expert, friendly, pressure, structured", () => {
    expect(Object.keys(PERSONA_MAP).sort()).toEqual([
      "expert",
      "friendly",
      "pressure",
      "structured",
    ]);
  });

  // MARK: Name set lock

  it("PERSONA_MAP values contain exactly 4 names: Daniel, Lin, Marcus, Sarah", () => {
    expect(Object.values(PERSONA_MAP).map((p) => p.name).sort()).toEqual([
      "Daniel",
      "Lin",
      "Marcus",
      "Sarah",
    ]);
  });

  // MARK: Style → name exact mapping

  it('PERSONA_MAP.structured.name === "Sarah"', () => {
    expect(PERSONA_MAP.structured.name).toBe("Sarah");
  });

  it('PERSONA_MAP.pressure.name === "Marcus"', () => {
    expect(PERSONA_MAP.pressure.name).toBe("Marcus");
  });

  it('PERSONA_MAP.friendly.name === "Lin"', () => {
    expect(PERSONA_MAP.friendly.name).toBe("Lin");
  });

  it('PERSONA_MAP.expert.name === "Daniel"', () => {
    expect(PERSONA_MAP.expert.name).toBe("Daniel");
  });

  // MARK: Style fields roundtrip

  it("each persona.style matches its key", () => {
    for (const [key, persona] of Object.entries(PERSONA_MAP)) {
      expect(persona.style).toBe(key);
    }
  });

  // MARK: Keywords length lock (exactly 3-tuple each)

  it("PERSONA_MAP.structured.keywords is exactly 3-tuple", () => {
    expect(PERSONA_MAP.structured.keywords.length).toBe(3);
  });

  it("PERSONA_MAP.pressure.keywords is exactly 3-tuple", () => {
    expect(PERSONA_MAP.pressure.keywords.length).toBe(3);
  });

  it("PERSONA_MAP.friendly.keywords is exactly 3-tuple", () => {
    expect(PERSONA_MAP.friendly.keywords.length).toBe(3);
  });

  it("PERSONA_MAP.expert.keywords is exactly 3-tuple", () => {
    expect(PERSONA_MAP.expert.keywords.length).toBe(3);
  });

  // MARK: Keywords exact values

  it("structured persona keywords are 逻辑清晰/节奏稳定/客观中立", () => {
    expect([...PERSONA_MAP.structured.keywords]).toEqual(["逻辑清晰", "节奏稳定", "客观中立"]);
  });

  it("pressure persona keywords are 直接犀利/连续追问/质疑判断", () => {
    expect([...PERSONA_MAP.pressure.keywords]).toEqual(["直接犀利", "连续追问", "质疑判断"]);
  });

  it("friendly persona keywords are 引导式/协助展开/适度肯定", () => {
    expect([...PERSONA_MAP.friendly.keywords]).toEqual(["引导式", "协助展开", "适度肯定"]);
  });

  it("expert persona keywords are 行业视角/案例迁移/商业本质", () => {
    expect([...PERSONA_MAP.expert.keywords]).toEqual(["行业视角", "案例迁移", "商业本质"]);
  });

  // MARK: Freeze check

  it("Object.isFrozen(PERSONA_MAP) is true", () => {
    expect(Object.isFrozen(PERSONA_MAP)).toBe(true);
  });

  // MARK: getPersona happy paths

  it('getPersona("structured").name === "Sarah"', () => {
    expect(getPersona("structured").name).toBe("Sarah");
  });

  it('getPersona("pressure").name === "Marcus"', () => {
    expect(getPersona("pressure").name).toBe("Marcus");
  });

  it('getPersona("friendly").name === "Lin"', () => {
    expect(getPersona("friendly").name).toBe("Lin");
  });

  it('getPersona("expert").name === "Daniel"', () => {
    expect(getPersona("expert").name).toBe("Daniel");
  });

  // MARK: getPersona fallback to Sarah

  it('getPersona("unknown_style") falls back to Sarah (structured)', () => {
    expect(getPersona("unknown_style").name).toBe("Sarah");
  });

  it('getPersona("") falls back to Sarah (structured)', () => {
    expect(getPersona("").name).toBe("Sarah");
  });

  it('getPersona(undefined as any) falls back to Sarah (structured)', () => {
    expect(getPersona(undefined as unknown as string).name).toBe("Sarah");
  });

  it('getPersona("STRUCTURED") (wrong case) falls back to Sarah', () => {
    expect(getPersona("STRUCTURED").name).toBe("Sarah");
  });
});
