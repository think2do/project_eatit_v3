// V32.M1.1.X-followup — SessionPaceCard render coverage.
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { SessionPaceCard } from "@/pages/interview/SessionPaceCard";

afterEach(() => cleanup());

describe("SessionPaceCard", () => {
  it("formats elapsed time as mm:ss + denominator", () => {
    const { getByTestId } = render(
      <SessionPaceCard
        elapsedSeconds={125}
        durationMinutes={30}
        rateLabel="适中"
        rateTone="good"
        answeredTurns={3}
        totalTurns={8}
      />,
    );
    const card = getByTestId("session-pace-card");
    expect(card).toHaveTextContent("02:05");
    expect(card).toHaveTextContent("/ 30:00");
    expect(card).toHaveTextContent("本场节奏");
  });

  it("renders the 2 Metric tiles with labels + values", () => {
    const { getByTestId } = render(
      <SessionPaceCard
        elapsedSeconds={0}
        durationMinutes={15}
        rateLabel="偏慢"
        rateTone="warn"
        answeredTurns={1}
        totalTurns={4}
      />,
    );
    expect(getByTestId("session-pace-metric-当前节奏")).toHaveTextContent("偏慢");
    expect(getByTestId("session-pace-metric-已答题数")).toHaveTextContent(
      "1 / 4",
    );
  });

  it("clamps progress bar 0..100 even when elapsed exceeds budget", () => {
    const { getByTestId } = render(
      <SessionPaceCard
        elapsedSeconds={3600}
        durationMinutes={15}
        rateLabel="适中"
        rateTone="good"
        answeredTurns={4}
        totalTurns={4}
      />,
    );
    // Bar inside the card; ensure no overflow style leaked the math.
    const card = getByTestId("session-pace-card");
    const bar = card.querySelector(".bar > i") as HTMLElement | null;
    expect(bar).not.toBeNull();
    expect(bar!.style.width).toBe("100%");
  });
});
