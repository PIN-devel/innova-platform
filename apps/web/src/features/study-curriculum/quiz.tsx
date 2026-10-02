import { useState } from "react";
import { useFetcher } from "react-router";
import type { CurriculumQuizQuestion, CurriculumGradeResponse } from "@innova/contracts";
import type { ActionResult } from "@/shared/lib/router-query/action-result";
import { CurriculumContentView } from "./content";

export function CurriculumQuiz({ questions }: { questions: CurriculumQuizQuestion[] }) {
  const [index, setIndex] = useState(0);
  const [scores, setScores] = useState<(boolean | null)[]>([]);
  const [done, setDone] = useState(false);
  if (!questions.length) return <p>이 Chapter에 교재 Quiz가 없습니다.</p>;
  if (done) return <section className="exam-stack"><h2>Quiz 결과</h2><p>{scores.filter((s) => s === true).length} / {questions.length} 정답</p>{scores.some((s) => s === null) && <p>자동 채점할 수 없는 문항이 있습니다.</p>}<button onClick={() => { setIndex(0); setScores([]); setDone(false); }}>다시 풀기</button></section>;
  const question = questions[index]!;
  return <section><p>{index + 1} / {questions.length} · 교재 Quiz</p><QuizQuestion key={question.id} question={question} onNext={(correct) => {
    setScores((old) => [...old, correct]);
    if (index + 1 === questions.length) setDone(true); else setIndex(index + 1);
  }} /></section>;
}

function QuizQuestion({ question, onNext }: { question: CurriculumQuizQuestion; onNext: (correct: boolean | null) => void }) {
  const fetcher = useFetcher<ActionResult & { grade?: CurriculumGradeResponse }>();
  const [text, setText] = useState("");
  const [choices, setChoices] = useState<string[]>([]);
  const grade = fetcher.data?.grade;
  const busy = fetcher.state !== "idle";
  return <div className="exam-stack"><CurriculumContentView content={question.prompt} />
    {question.kind === "short-answer" && <p>{question.matching === "exact" ? "교재 공식 표현과 정확히 일치해야 합니다. 띄어쓰기와 대소문자도 구별합니다." : question.matching === "case-insensitive" ? "교재 답안과 비교하며 대소문자는 구별하지 않습니다." : "공식 답안이 확인되지 않은 문항입니다."}</p>}
    <fetcher.Form method="post">
      <input type="hidden" name="intent" value="curriculum-grade" /><input type="hidden" name="questionId" value={question.id} /><input type="hidden" name="kind" value={question.kind} />
      {"choices" in question && <div className="exam-choices">{question.choices.map((choice, i) => <label className="curriculum-choice" key={choice.id}><input type={question.kind === "single-choice" ? "radio" : "checkbox"} name="choiceIds" value={choice.id} checked={choices.includes(choice.id)} disabled={busy || !!grade} onChange={() => setChoices((old) => question.kind === "single-choice" ? [choice.id] : old.includes(choice.id) ? old.filter((id) => id !== choice.id) : [...old, choice.id])} /><span>{i + 1}.</span><CurriculumContentView content={choice.content} /></label>)}</div>}
      {question.kind === "short-answer" && <label>답안<input className="exam-input" name="text" value={text} onChange={(e) => setText(e.target.value)} disabled={busy || !!grade} autoComplete="off" /></label>}
      {!grade && <button className="exam-primary" disabled={busy || ("choices" in question && !choices.length) || (question.kind === "short-answer" && !text.length)}>{busy ? "채점 중…" : question.kind === "self-assessment" ? "평가 기준 보기" : "정답 확인"}</button>}
    </fetcher.Form>
    {fetcher.data?.error && <p role="alert">{fetcher.data.error}</p>}
    {grade && <div className={grade.correct ? "exam-feedback correct" : "exam-feedback"} role="status"><strong>{grade.correct === null ? "자동 채점 불가" : grade.correct ? "정답" : "오답"}</strong><p>{grade.answer.status === "official" ? "교재 공식 답안" : grade.answer.status === "proposed" ? "검토 중인 제안 답안" : "답안 미확정"}</p>
      {grade.answer.status === "unresolved" ? <p>{grade.answer.reason}</p> : <>
        {"correctChoiceIds" in grade.answer && "choices" in question && question.choices.filter((c) => "correctChoiceIds" in grade.answer && grade.answer.correctChoiceIds.includes(c.id)).map((c) => <div key={c.id}><strong>정답:</strong><CurriculumContentView content={c.content} /></div>)}
        {"acceptedAnswers" in grade.answer && <p>정답: {grade.answer.acceptedAnswers.join(" / ")}</p>}
        {"rubric" in grade.answer && <CurriculumContentView content={grade.answer.rubric} />}
        {"sampleAnswer" in grade.answer && grade.answer.sampleAnswer && <CurriculumContentView content={grade.answer.sampleAnswer} />}
        {grade.answer.explanation && <><h3>교재 해설</h3><CurriculumContentView content={grade.answer.explanation} /></>}
      </>}
      <button onClick={() => onNext(grade.correct)}>다음 / 결과</button>
    </div>}
  </div>;
}
