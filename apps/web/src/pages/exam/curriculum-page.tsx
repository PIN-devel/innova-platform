import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { curriculumChaptersQuery, curriculumChapterQuery, curriculumQuizQuery } from "@/entities/curriculum/queries";
import { useSessionScope } from "@/features/auth/hooks";
import { CurriculumSubjectNavigation } from "@/features/study-curriculum/subject-navigation";
import { CurriculumReading, CurriculumSectionNavigation } from "@/features/study-curriculum/content";
import { CurriculumQuiz } from "@/features/study-curriculum/quiz";
import { curriculumPath } from "@/features/study-curriculum/location";
import { useRouteRefresh } from "@/shared/lib/router-query/use-route-refresh";
import { ApiError } from "@/shared/api/client";
import { ErrorState } from "@/shared/ui/error-state";
import { Skeleton } from "@/shared/ui/skeleton";

function Loading() {
  return <div className="exam-shell exam-stack" role="status" aria-busy="true"><span>교재 데이터를 불러오는 중입니다.</span><Skeleton className="h-10 w-2/3" /><Skeleton className="h-48 w-full" /></div>;
}
function Retry({ retry }: { retry: () => void }) { return <button onClick={retry}>다시 시도</button>; }
function blocked(error: unknown) { return error instanceof ApiError && error.status < 500; }

export default function CurriculumPage({ subjectId, chapterId, view }: { subjectId: string; chapterId: string | null; view: string }) {
  const { epoch } = useSessionScope();
  const query = useQuery({ ...curriculumChaptersQuery(subjectId, epoch), enabled: false });
  const refresh = useRouteRefresh([curriculumChaptersQuery(subjectId, epoch).queryKey]);
  if (blocked(query.error) || (!query.data && query.error)) return <ErrorState title="교재를 불러오지 못했습니다" description="접근 권한과 교재 상태를 확인해 주세요." action={<Retry retry={() => void refresh()} />} />;
  if (!query.data) return <Loading />;
  return <div className="exam-shell"><CurriculumSubjectNavigation activeSubject={subjectId} /><header className="exam-head"><h1>{query.data.subject.title}</h1></header>
    {query.isFetching && <p role="status">교재 목록 갱신 중…</p>}{query.error && <p role="alert">마지막 조회 결과를 표시합니다. <Retry retry={() => void refresh()} /></p>}
    {chapterId ? <Chapter key={chapterId} subjectId={subjectId} chapterId={chapterId} view={view} /> : <section className="exam-main exam-stack"><h2>Chapter 선택</h2><div className="exam-list">{query.data.chapters.map((c) => <Link key={c.id} to={curriculumPath(subjectId, c.id)}>{c.number && `${c.number}. `}{c.title}</Link>)}</div></section>}
  </div>;
}

function Chapter({ subjectId, chapterId, view }: { subjectId: string; chapterId: string; view: string }) {
  const { epoch } = useSessionScope();
  const reading = useQuery({ ...curriculumChapterQuery(subjectId, chapterId, epoch), enabled: false });
  const quiz = useQuery({ ...curriculumQuizQuery(subjectId, chapterId, epoch), enabled: false });
  const refresh = useRouteRefresh([curriculumChapterQuery(subjectId, chapterId, epoch).queryKey, curriculumQuizQuery(subjectId, chapterId, epoch).queryKey]);
  const queryError = reading.error ?? (view === "quiz" ? quiz.error : null);
  if (blocked(queryError) || (!reading.data && queryError) || (view === "quiz" && !quiz.data && quiz.error)) return <ErrorState title="Chapter를 불러오지 못했습니다" description="교재 상태와 명시적인 읽기 순서를 확인해 주세요." action={<Retry retry={() => void refresh()} />} />;
  if (!reading.data || (view === "quiz" && !quiz.data)) return <Loading />;
  const detail = reading.data;
  return <section className="exam-main exam-stack"><Link to={curriculumPath(subjectId)}>← Chapter 목록</Link><h2>{detail.chapter.title}</h2>
    <nav className="exam-actions" aria-label="Chapter 메뉴"><Link aria-current={view === "read" ? "page" : undefined} to={curriculumPath(subjectId, chapterId)}>교재 읽기</Link><Link aria-current={view === "quiz" ? "page" : undefined} to={curriculumPath(subjectId, chapterId, "quiz")}>교재 Quiz</Link><button disabled={reading.isFetching || quiz.isFetching} onClick={() => void refresh()}>새로고침</button></nav>
    {(reading.isFetching || quiz.isFetching) && <p role="status">Chapter 갱신 중…</p>}{queryError && <p role="alert">마지막 조회 결과를 표시합니다. <Retry retry={() => void refresh()} /></p>}
    {view === "quiz" ? <CurriculumQuiz questions={quiz.data!.questions} /> : <><details className="curriculum-toc"><summary>Section 탐색</summary><nav aria-label="Section 탐색"><CurriculumSectionNavigation sections={detail.sections} blocks={detail.sourceBlocks} /></nav></details><CurriculumReading subjectId={subjectId} chapterId={chapterId} sections={detail.sections} blocks={detail.sourceBlocks} /></>}
  </section>;
}
