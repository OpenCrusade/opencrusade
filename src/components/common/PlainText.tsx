import type { ReactNode } from "react";

/**
 * Show text a person typed, with a little formatting and no HTML:
 * a line starting "# " or "## " is a heading, "- " or "* " a bullet,
 * "1. " a numbered item, a blank line starts a new paragraph,
 * **words** are bold, and web addresses are links, either bare
 * (https://...) or named ([name](https://...)). Only http and https
 * addresses become links. Everything else is shown exactly as typed.
 */
export function PlainText({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={blocks.length} className="m-0 leading-[1.6] text-ink-2 whitespace-pre-wrap">
          {inline(para.join("\n"))}
        </p>,
      );
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>);
      blocks.push(
        list.ordered ? (
          <ol key={blocks.length} className="m-0 pl-6 grid gap-1 leading-[1.6] text-ink-2 list-decimal">{items}</ol>
        ) : (
          <ul key={blocks.length} className="m-0 pl-6 grid gap-1 leading-[1.6] text-ink-2 list-disc">{items}</ul>
        ),
      );
      list = null;
    }
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const heading = /^(#{1,2})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (!line.trim()) {
      flushPara();
      flushList();
    } else if (heading) {
      flushPara();
      flushList();
      blocks.push(
        heading[1].length === 1 ? (
          <h2 key={blocks.length} className="m-0 mt-2 font-display font-bold text-xl">{inline(heading[2])}</h2>
        ) : (
          <h3 key={blocks.length} className="m-0 mt-1 font-display font-bold text-base">{inline(heading[2])}</h3>
        ),
      );
    } else if (bullet || numbered) {
      flushPara();
      const ordered = !bullet;
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return <div className="grid gap-3">{blocks}</div>;
}

/** **bold** spans and links; the rest as typed. */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*\n]+\*\*)/).flatMap((part, i): ReactNode[] =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4
      ? [<strong key={i} className="font-semibold text-ink">{links(part.slice(2, -2), `${i}`)}</strong>]
      : links(part, `${i}`),
  );
}

// [name](https://...) or a bare https://... address.
const LINK = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"]+)/gi;
// Punctuation that ends a sentence rather than an address.
const TRAILING = /[.,;:!?)\]'"]+$/;

/** Turn web addresses in a run of text into links. */
function links(s: string, key = ""): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of s.matchAll(LINK)) {
    const start = m.index;
    let end = start + m[0].length;
    let href: string;
    let label: string;
    if (m[2]) {
      href = m[2];
      label = m[1];
    } else {
      href = m[3].replace(TRAILING, "");
      end = start + href.length;
      label = href;
    }
    if (!safeUrl(href)) continue;
    if (start > last) out.push(s.slice(last, start));
    out.push(
      <a key={`${key}-${start}`} href={href} target="_blank" rel="noopener noreferrer" className="text-ink underline break-words">
        {label}
      </a>,
    );
    last = end;
  }
  if (last < s.length) out.push(s.slice(last));
  return out;
}

function safeUrl(href: string): boolean {
  try {
    const u = new URL(href);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
