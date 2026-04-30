// V32.M2.3.5 — CompanyCard rendering contract.
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { CompanyProfile } from "@eatit/shared-types";

import { CompanyCard } from "@/pages/upload/CompanyCard";

afterEach(() => cleanup());

const BASE_COMPANY: CompanyProfile = {
  name: "字节跳动",
  business_model: "短视频与社交平台,广告变现为主。",
  stage: "mature",
  recent_signals: [
    {
      type: "funding",
      summary: "近期完成 D 轮融资 50 亿",
      occurred_at: null,
      source_url: null,
    },
    {
      type: "product",
      summary: "上线新一代推荐算法",
      occurred_at: null,
      source_url: null,
    },
  ],
  evidence_links: ["https://example.com/news/1"],
  confidence: "high",
};

describe("CompanyCard", () => {
  it("renders company name + stage + confidence chip", () => {
    const { getByText, getByTestId } = render(<CompanyCard company={BASE_COMPANY} />);
    expect(getByText("字节跳动")).toBeTruthy();
    expect(getByText("成熟期")).toBeTruthy();
    expect(getByTestId("company-confidence").textContent).toBe("高置信");
  });

  it("renders all recent_signals with their type chip", () => {
    const { getAllByTestId, container } = render(
      <CompanyCard company={BASE_COMPANY} />,
    );
    expect(getAllByTestId("company-signal").length).toBe(2);
    expect(container.textContent).toContain("融资");
    expect(container.textContent).toContain("产品");
  });

  it("renders evidence_links as <a> elements that open in a new tab", () => {
    const { getAllByTestId } = render(<CompanyCard company={BASE_COMPANY} />);
    const links = getAllByTestId("company-evidence-link");
    expect(links.length).toBe(1);
    expect(links[0].getAttribute("href")).toBe("https://example.com/news/1");
    expect(links[0].getAttribute("target")).toBe("_blank");
    expect(links[0].getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("hides the degraded banner by default", () => {
    const { queryByTestId } = render(<CompanyCard company={BASE_COMPANY} />);
    expect(queryByTestId("company-degraded-banner")).toBeNull();
  });

  it("shows the degraded banner when degraded=true", () => {
    const { getByTestId } = render(
      <CompanyCard company={BASE_COMPANY} degraded />,
    );
    expect(getByTestId("company-degraded-banner").textContent).toContain(
      "半离线模式",
    );
  });

  it("hides recent_signals + evidence_links sections when both are empty", () => {
    const empty: CompanyProfile = {
      ...BASE_COMPANY,
      recent_signals: [],
      evidence_links: [],
      confidence: "low",
    };
    const { queryByTestId, container } = render(<CompanyCard company={empty} />);
    expect(queryByTestId("company-signal")).toBeNull();
    expect(queryByTestId("company-evidence-link")).toBeNull();
    expect(container.textContent).toContain("低置信");
  });
});
