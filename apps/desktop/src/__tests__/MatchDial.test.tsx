import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

import { MatchDial } from "@/pages/upload/MatchDial";

afterEach(() => {
  cleanup();
});

describe("MatchDial", () => {
  it("renders score 0 with LOW label and full dasharray-offset (empty arc)", () => {
    const { getByTestId, container } = render(<MatchDial score={0} level="LOW" />);
    const dial = getByTestId("match-dial");
    expect(dial.getAttribute("data-score")).toBe("0");
    expect(dial.getAttribute("data-level")).toBe("LOW");
    const arcs = container.querySelectorAll("circle");
    expect(arcs.length).toBe(2);
    const offset = parseFloat(arcs[1].getAttribute("stroke-dashoffset") ?? "0");
    const dasharray = parseFloat(arcs[1].getAttribute("stroke-dasharray") ?? "0");
    expect(offset).toBeCloseTo(dasharray, 4);
    expect(container.textContent).toContain("MATCH · LOW");
  });

  it("renders score 50 with MID and offset = 0.5 * circumference", () => {
    const { getByTestId, container } = render(<MatchDial score={50} level="MID" />);
    expect(getByTestId("match-dial").getAttribute("data-score")).toBe("50");
    const arcs = container.querySelectorAll("circle");
    const offset = parseFloat(arcs[1].getAttribute("stroke-dashoffset") ?? "0");
    const dasharray = parseFloat(arcs[1].getAttribute("stroke-dasharray") ?? "0");
    expect(offset / dasharray).toBeCloseTo(0.5, 3);
    expect(container.textContent).toContain("MATCH · MID");
  });

  it("renders score 78 with HIGH and shows the headline number", () => {
    const { container } = render(<MatchDial score={78} level="HIGH" />);
    expect(container.textContent).toContain("78");
    expect(container.textContent).toContain("/ 100");
    expect(container.textContent).toContain("MATCH · HIGH");
  });

  it("renders score 100 with HIGH and zero dashoffset (full arc)", () => {
    const { container } = render(<MatchDial score={100} level="HIGH" />);
    const arcs = container.querySelectorAll("circle");
    const offset = parseFloat(arcs[1].getAttribute("stroke-dashoffset") ?? "999");
    expect(offset).toBeCloseTo(0, 4);
  });

  it("clamps a score above 100 back to 100", () => {
    const { getByTestId } = render(<MatchDial score={150} level="HIGH" />);
    expect(getByTestId("match-dial").getAttribute("data-score")).toBe("100");
  });

  it("clamps a score below 0 back to 0", () => {
    const { getByTestId } = render(<MatchDial score={-20} level="LOW" />);
    expect(getByTestId("match-dial").getAttribute("data-score")).toBe("0");
  });
});
