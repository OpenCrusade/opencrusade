import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { PlainText } from "@/components/common/PlainText";

describe("PlainText", () => {
  it("formats headings, bullets, numbers, bold and paragraphs", () => {
    const { container } = render(
      <PlainText
        text={"# Painting\nFully painted forces gain **1 RP**.\n\n## Order\n1. Deploy\n2. Fight\n- one\n- two"}
      />,
    );
    expect(container.querySelector("h2")?.textContent).toBe("Painting");
    expect(container.querySelector("h3")?.textContent).toBe("Order");
    expect(container.querySelector("strong")?.textContent).toBe("1 RP");
    expect([...container.querySelectorAll("ol li")].map((l) => l.textContent)).toEqual(["Deploy", "Fight"]);
    expect([...container.querySelectorAll("ul li")].map((l) => l.textContent)).toEqual(["one", "two"]);
  });

  it("shows HTML as text, never as markup", () => {
    const { container } = render(<PlainText text={'<img src=x onerror="alert(1)"> <b>hi</b>'} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("<img src=x");
  });

  it("makes bare and named web addresses into links", () => {
    const { container } = render(
      <PlainText text={"See https://example.com/faq. Or read [the pack](https://example.com/pack?a=1) **now at http://example.org**"} />,
    );
    const a = [...container.querySelectorAll("a")];
    expect(a.map((l) => [l.textContent, l.getAttribute("href")])).toEqual([
      ["https://example.com/faq", "https://example.com/faq"],
      ["the pack", "https://example.com/pack?a=1"],
      ["http://example.org", "http://example.org"],
    ]);
    expect(a.every((l) => l.target === "_blank" && l.rel === "noopener noreferrer")).toBe(true);
    expect(container.textContent).toContain("faq. Or read the pack now at");
  });

  it("never links anything but http and https", () => {
    const { container } = render(
      <PlainText text={"[click](javascript:alert(1)) [mail](mailto:a@b.c) data:text/html,hi ftp://x.y"} />,
    );
    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("[click](javascript:alert(1))");
  });
});
