import { useState } from "react";
import type { CurriculumRichContent, CurriculumSection, CurriculumSourceBlock, CurriculumContent } from "@innova/contracts";
import { curriculumAssetUrl } from "@/entities/curriculum/api";

function PrivateImage({ content, url }: { content: Extract<CurriculumContent, { type: "image" | "diagram" }>; url?: string }) {
  const [unavailable, setUnavailable] = useState(!url);
  return <figure>{unavailable ? <p role="status">이 실행 환경에서는 비공개 그림을 불러올 수 없습니다.</p> : <img src={url} alt={content.alt} onError={() => setUnavailable(true)} loading="lazy" />}
    <figcaption>{content.caption ?? content.alt}</figcaption></figure>;
}

export function CurriculumContentView({ content, assetUrl }: { content: CurriculumRichContent; assetUrl?: (index: number) => string }) {
  return <>{content.map((item, index) => {
    if (item.type === "text") return <div key={index} className="curriculum-text">{item.text}</div>;
    if (item.type === "code") return <figure key={index}>{item.caption && <figcaption>{item.caption}</figcaption>}<pre><code data-language={item.language}>{item.code}</code></pre></figure>;
    if (item.type === "table") return <div className="curriculum-table" key={index}><table>{item.caption && <caption>{item.caption}</caption>}<tbody>{item.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => cell.header ? <th key={c} rowSpan={cell.rowSpan} colSpan={cell.colSpan}>{cell.text}</th> : <td key={c} rowSpan={cell.rowSpan} colSpan={cell.colSpan}>{cell.text}</td>)}</tr>)}</tbody></table></div>;
    return <PrivateImage key={assetUrl?.(index) ?? index} content={item} url={assetUrl?.(index)} />;
  })}</>;
}

function sectionTrail(sections: CurriculumSection[], sectionId: string) {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const trail: CurriculumSection[] = []; const visited = new Set<string>();
  let current = byId.get(sectionId);
  while (current && !visited.has(current.id)) { visited.add(current.id); trail.unshift(current); current = current.parentSectionId ? byId.get(current.parentSectionId) : undefined; }
  return trail;
}

export function CurriculumReading({ subjectId, chapterId, sections, blocks }: { subjectId: string; chapterId: string; sections: CurriculumSection[]; blocks: CurriculumSourceBlock[] }) {
  return <div className="curriculum-reading">{blocks.map((block, index) => <article id={`block-${block.id}`} key={block.id} className="curriculum-block" data-block-id={block.id}>
    {blocks[index - 1]?.sectionId !== block.sectionId && <h2>{sectionTrail(sections, block.sectionId).map((s) => s.title).join(" › ")}</h2>}
    <p className="curriculum-source">PDF {block.location.pdfPageStart}{block.location.pdfPageEnd !== block.location.pdfPageStart && `–${block.location.pdfPageEnd}`} · {block.role}</p>
    {block.review.status === "needs-review" && <p className="curriculum-review">검토 필요: {block.review.note}</p>}
    <CurriculumContentView content={block.content} assetUrl={(i) => curriculumAssetUrl(subjectId, chapterId, block.id, i)} />
  </article>)}</div>;
}

export function CurriculumSectionNavigation({ sections, blocks, parent = null }: { sections: CurriculumSection[]; blocks: CurriculumSourceBlock[]; parent?: string | null }) {
  const siblings = sections.filter((s) => s.parentSectionId === parent).sort((a, b) => a.position - b.position);
  if (!siblings.length) return null;
  return <ul>{siblings.map((s) => {
    const first = blocks.find((b) => sectionTrail(sections, b.sectionId).some((p) => p.id === s.id));
    return <li key={s.id}>{first ? <a href={`#block-${first.id}`}>{s.title}</a> : <span>{s.title}</span>}<CurriculumSectionNavigation sections={sections} blocks={blocks} parent={s.id} /></li>;
  })}</ul>;
}
