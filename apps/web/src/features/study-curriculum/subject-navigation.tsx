import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { curriculumSubjectsQuery } from "@/entities/curriculum/queries";
import { useSessionScope } from "@/features/auth/hooks";
import { curriculumPath } from "./location";

export function CurriculumSubjectNavigation({ activeSubject }: { activeSubject?: string }) {
  const { epoch } = useSessionScope();
  const query = useQuery({ ...curriculumSubjectsQuery(epoch), enabled: false });
  return <nav className="curriculum-subjects" aria-label="과목 선택">
    <Link to="/exam" aria-current={!activeSubject ? "page" : undefined}>AWS SAP</Link>
    {query.data?.subjects.map((s) => <Link key={s.id} to={curriculumPath(s.id)} aria-current={s.id === activeSubject ? "page" : undefined}>{s.title}</Link>)}
    {query.isError && <span role="status">교재 과목 목록을 불러오지 못했습니다.</span>}
  </nav>;
}
