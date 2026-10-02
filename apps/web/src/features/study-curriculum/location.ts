export function curriculumLocation(url: URL) {
  const subjectId = url.searchParams.get("subject");
  if (!subjectId) return null;
  const chapterId = url.searchParams.get("chapter");
  const view = url.searchParams.get("view") === "quiz" ? "quiz" : "read";
  return { subjectId, chapterId, view, path: curriculumPath(subjectId, chapterId, view) };
}
export function curriculumPath(subjectId: string, chapterId: string | null = null, view = "read") {
  const params = new URLSearchParams({ subject: subjectId });
  if (chapterId) params.set("chapter", chapterId);
  if (chapterId && view === "quiz") params.set("view", "quiz");
  return `/exam?${params}`;
}
