import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { ExamBankSchema } from "@innova/contracts";
import type { BankFile, Exercise, LessonSession } from "@/entities/bank";
import { UNITS } from "@/entities/bank";
import type { FinishedSession, SessionAnswer } from "@/entities/progress";
import { assembleLesson, assembleMock, assembleReview, recommendLesson, selectPrimerConcepts } from "@/features/start-lesson";
import { expectedLabel, getNoteResults, givenToString, gradeExercise } from "@/features/answer-exercise";
import { createExamBank, getExamBank } from "@/entities/exam-bank/api";
import { examBankQuery } from "@/entities/exam-bank/queries";
import { ApiError } from "@/shared/api/client";
import { authKeys } from "@/entities/auth/queries";
import { useCurrentUser } from "@/features/auth/hooks";
import { LogoutButton } from "@/features/auth/LogoutButton";
import { chapterMastery, useProgress } from "@/entities/progress";
import { todayKst } from "@/shared/lib/file";
import { shuffle } from "@/shared/lib/shuffle";
import "./exam.css";

const ACTIVE_KEY = "innova.exam.active-bank.v1";
type View = "home" | "units" | "review" | "mock" | "settings" | "lesson" | "result";
type Given = string | number | boolean | Array<{ leftId: string; rightId: string }> | null;

export default function ExamPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const [activeId, setActiveId] = useState(() => localStorage.getItem(ACTIVE_KEY) ?? "aws-sap");
  const { data, isPending, isError, error } = useQuery(examBankQuery(activeId));
  const { progress, record, setGoal, reset } = useProgress(currentUser.data!.id);
  const [view, setView] = useState<View>("home");
  const [session, setSession] = useState<LessonSession | null>(null);
  const [primerDone, setPrimerDone] = useState(false);
  const [message, setMessage] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const bank = data?.bank as BankFile | undefined;

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      queryClient.setQueryData(authKeys.me, null);
      navigate("/login", { replace: true, state: { from: "/exam" } });
    }
  }, [error, navigate, queryClient]);

  const selectBank = (id: string) => { localStorage.setItem(ACTIVE_KEY, id); setActiveId(id); setSession(null); setView("home"); };
  const start = (next: LessonSession | null, empty: string) => {
    if (!next) { setMessage(empty); return; }
    setMessage(""); setSession(next); setPrimerDone(false); setView("lesson");
  };
  const startLesson = (options: { chapter?: number; tag?: string } = {}) => bank && start(assembleLesson(bank, options), "이 범위로 만들 수 있는 레슨이 없습니다.");
  const startMock = (size: 10 | 40) => bank && start(assembleMock(bank, size), "모의고사 문항이 부족합니다.");
  const startReview = () => bank && start(assembleReview(bank, progress.wrongIds, progress.wrongTypes), "아직 복습할 오답이 없습니다.");
  const finish = (answers: SessionAnswer[]) => {
    if (!session) return;
    const finished: FinishedSession = { sessionId: session.sessionId, kind: session.kind, title: session.title,
      startedAt: session.startedAt, endedAt: new Date().toISOString(),
      durationSec: Math.max(1, Math.round((Date.now() - new Date(session.startedAt).getTime()) / 1000)), answers };
    record(finished); setSession(null); setView("result");
  };
  const importBank = async (file: File | undefined) => {
    if (!file || !bank) return;
    try {
      const incoming = ExamBankSchema.parse(JSON.parse(await file.text()));
      const next = importMode === "replace" ? incoming : {
        ...incoming,
        concepts: [...new Map([...bank.concepts, ...incoming.concepts].map((note) => [note.id, note])).values()],
        scenarios: [...new Map([...bank.scenarios, ...incoming.scenarios].map((note) => [note.id, note])).values()],
      };
      const saved = await createExamBank(next);
      selectBank(saved.id);
      setMessage(`DB에 개념 ${next.concepts.length}개, 사례 ${next.scenarios.length}개를 저장했습니다.`);
    } catch (cause) { setMessage(`문항을 가져오지 못했습니다: ${cause instanceof Error ? cause.message : "형식을 확인하세요."}`); }
  };

  if (isPending) return <div className="exam-loading">문항 은행을 불러오는 중입니다…</div>;
  if (isError || !bank) return <div className="exam-loading"><p>문항 은행을 불러오지 못했습니다. {error instanceof Error ? error.message : ""}</p><button onClick={() => selectBank("aws-sap")}>기본 은행 다시 열기</button></div>;

  const wrong = progress.wrongIds.filter((id) => bank.concepts.some((note) => note.id === id) || bank.scenarios.some((note) => note.id === id));
  const primer = session?.kind === "lesson" ? selectPrimerConcepts(session.exercises, bank, progress.notes) : [];
  return <div className="exam-shell">
    <header className="exam-head"><div><strong>Exam Drill</strong><span>{bank.subject} · {bank.concepts.length}개 개념 · {bank.scenarios.length}개 사례</span></div><span>{currentUser.data?.email}</span><LogoutButton /><a href="/">Innova Platform</a></header>
    <main className="exam-main">
      {message && <div className="exam-message" role="status">{message}<button onClick={() => setMessage("")} aria-label="닫기">×</button></div>}
      {view === "home" && <section className="exam-stack">
        <div className="exam-hero"><p className="exam-eyebrow">AWS SAP · 오늘 학습</p><h1>오늘 이어서</h1><p>짧은 레슨으로 개념을 익히고, 바로 문제에 적용하세요.</p><button className="exam-primary" onClick={() => startLesson(recommendLesson(bank, progress.notes, todayKst()))}>레슨 시작</button></div>
        <div className="exam-summary"><div><strong>{progress.todayDate === todayKst() ? progress.todayMinutes : 0}분</strong><span>오늘 학습 · 목표 {progress.dailyGoalMin}분</span></div><div><strong>{progress.streakDays}일</strong><span>연속 학습</span></div><div><strong>{wrong.length}개</strong><span>오답 노트</span></div></div>
        <div className="exam-actions"><button onClick={() => setView("units")}>유닛 선택</button><button onClick={() => setView("review")}>오답 복습</button><button onClick={() => startMock(10)}>미니 모의 · 10문항</button></div>
      </section>}
      {view === "units" && <section className="exam-stack"><div><h1>유닛</h1><p>원하는 범위를 골라 바로 학습할 수 있습니다.</p></div><div className="exam-unit-grid">{UNITS.map((unit) => {
        const ids = [...bank.concepts, ...bank.scenarios].filter((note) => note.chapter === unit.id).map((note) => note.id);
        return <button key={unit.id} className="exam-unit" onClick={() => startLesson({ chapter: unit.id })}><span>Unit {unit.id}</span><strong>{unit.title}</strong><small>노트 {ids.length}개 · 숙련 {chapterMastery(progress.notes, ids)}%</small></button>;
      })}</div></section>}
      {view === "review" && <section className="exam-stack"><div><h1>오답 복습</h1><p>틀린 개념을 더 어려운 유형으로 다시 풀어 봅니다.</p></div><button className="exam-primary" disabled={!wrong.length} onClick={startReview}>오답 다시 풀기 · {wrong.length}개</button><div className="exam-list">{wrong.length ? wrong.slice(0, 30).map((id) => { const concept = bank.concepts.find((note) => note.id === id); const scenario = bank.scenarios.find((note) => note.id === id); return <div key={id}><strong>{concept?.term ?? "사례 문제"}</strong><span>Unit {concept?.chapter ?? scenario?.chapter} · {progress.notes[id]?.wrong ?? 1}회 오답</span></div>; }) : <p>아직 틀린 문항이 없습니다.</p>}</div></section>}
      {view === "mock" && <section className="exam-stack"><div><h1>모의고사</h1><p>종료할 때 일괄 채점합니다. 제한 시간이 지나면 자동 제출됩니다.</p></div><div className="exam-actions"><button onClick={() => startMock(10)}>10문항 · 15분</button><button onClick={() => startMock(40)}>40문항 · 60분</button></div>{progress.lastMock && <p>최근 모의: {progress.lastMock.answers.filter((answer) => answer.correct).length}/{progress.lastMock.answers.length}</p>}</section>}
      {view === "lesson" && session && (primer.length && !primerDone ? <section className="exam-stack"><div><p className="exam-eyebrow">먼저 알아보기</p><h1>이번 레슨의 개념</h1></div><div className="exam-list">{primer.map((note) => <div key={note.id}><strong>{note.term}</strong><p>{note.definition}</p></div>)}</div><div className="exam-actions"><button onClick={() => { setSession(null); setView("home"); }}>나가기</button><button className="exam-primary" onClick={() => setPrimerDone(true)}>문제 풀기</button></div></section> : <ExamPlayer key={session.sessionId} session={session} onFinish={finish} onExit={() => { setSession(null); setView("home"); }} />)}
      {view === "result" && <section className="exam-stack"><div><p className="exam-eyebrow">학습 결과</p><h1>{progress.lastSession?.title ?? "결과"}</h1></div><div className="exam-score">{progress.lastSession?.answers.filter((answer) => answer.correct).length ?? 0}<span> / {progress.lastSession?.answers.length ?? 0}</span></div><div className="exam-list">{progress.lastSession?.answers.filter((answer) => !answer.correct).map((answer) => <div key={answer.exerciseId}><strong>{answer.prompt}</strong><p>정답: {answer.expected}</p></div>)}</div><div className="exam-actions"><button onClick={startReview}>오답 다시 풀기</button><button onClick={() => startLesson(recommendLesson(bank, progress.notes, todayKst()))}>다음 레슨</button><button onClick={() => setView("home")}>홈</button></div></section>}
      {view === "settings" && <section className="exam-stack"><div><h1>설정 · 데이터</h1><p>문항 은행은 PostgreSQL에 저장됩니다. 학습 기록의 통계와 ID만 현재 브라우저에 저장됩니다.</p></div><div className="exam-panel"><h2>오늘 목표</h2><div className="exam-actions"><button aria-pressed={progress.dailyGoalMin === 5} onClick={() => setGoal(5)}>5분</button><button aria-pressed={progress.dailyGoalMin === 15} onClick={() => setGoal(15)}>15분</button></div></div><div className="exam-panel"><h2>문항 은행</h2><label>불러오기 방식 <select value={importMode} onChange={(event) => setImportMode(event.target.value as "merge" | "replace")}><option value="merge">병합</option><option value="replace">교체</option></select></label><input type="file" accept=".json,application/json" aria-label="문항 JSON 불러오기" onChange={(event) => void importBank(event.target.files?.[0])}/><div className="exam-actions"><button onClick={() => void getExamBank("aws-sap").then(() => selectBank("aws-sap"))}>기본 은행으로 돌아가기</button></div></div><div className="exam-panel"><h2>학습 기록</h2><p>문제 본문과 정답은 브라우저에 영구 저장하지 않습니다.</p><button className="exam-danger" onClick={() => { if (window.confirm("학습 기록을 지울까요? 문항 은행은 유지됩니다.")) reset(); }}>학습 기록 초기화</button></div></section>}
    </main>
    {view !== "lesson" && <nav className="exam-tabs" aria-label="Exam Drill 메뉴">{([ ["home", "홈"], ["units", "유닛"], ["review", "오답"], ["mock", "모의"], ["settings", "설정"] ] as const).map(([id, label]) => <button key={id} aria-current={view === id ? "page" : undefined} onClick={() => { setMessage(""); setView(id); }}>{label}</button>)}</nav>}
  </div>;
}

function ExamPlayer({ session, onFinish, onExit }: { session: LessonSession; onFinish: (answers: SessionAnswer[]) => void; onExit: () => void }) {
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, Given>>({});
  const [saved, setSaved] = useState<Record<string, SessionAnswer>>({});
  const [feedback, setFeedback] = useState<ReturnType<typeof gradeExercise> | null>(null);
  const [hints, setHints] = useState<string[]>([]);
  const [nearMisses, setNearMisses] = useState<string[]>([]);
  const [remain, setRemain] = useState(session.timeLimitSec ?? 0);
  const started = useRef(new Date(session.startedAt).getTime());
  const itemStarted = useRef(new Date(session.startedAt).getTime());
  const finished = useRef(false);
  const mock = session.kind.startsWith("mock");
  const exercise = session.exercises[index]!;
  const given = drafts[exercise.id] ?? null;
  const pairChoices = useMemo(() => exercise.type === "pair" ? shuffle(exercise.pairs) : [], [exercise]);

  const answer = useCallback((ex: Exercise, value: Given, forceWrong = false): SessionAnswer => {
    const result = gradeExercise({ exercise: ex, given: value ?? "" });
    const correct = !forceWrong && result.correct;
    return { exerciseId: ex.id, noteId: ex.noteId, type: ex.type, chapter: ex.chapter, tags: ex.tags,
      prompt: ex.type === "pair" ? "짝을 연결하세요" : ex.type === "cloze" ? ex.template : ex.type === "short" ? ex.prompt : ex.type === "ox" ? ex.statement : ex.stem,
      correct, noteResults: getNoteResults(ex, value, correct), given: givenToString(value ?? "", ex),
      expected: expectedLabel(ex), ms: Date.now() - itemStarted.current, hintUsed: hints.includes(ex.id), at: new Date().toISOString() };
  }, [hints]);
  const finish = useCallback(() => {
    if (finished.current) return;
    finished.current = true;
    onFinish(session.exercises.map((ex) => saved[ex.id] ?? answer(ex, drafts[ex.id] ?? null)));
  }, [answer, drafts, onFinish, saved, session.exercises]);
  useEffect(() => {
    if (!session.timeLimitSec) return;
    const timer = window.setInterval(() => setRemain(Math.max(0, session.timeLimitSec! - Math.floor((Date.now() - started.current) / 1000))), 500);
    return () => window.clearInterval(timer);
  }, [session.timeLimitSec]);
  useEffect(() => { if (session.timeLimitSec && remain === 0) finish(); }, [session.timeLimitSec, remain, finish]);
  const update = (value: Given) => { if (!mock && feedback && !feedback.nearMiss) return; setDrafts((old) => ({ ...old, [exercise.id]: value })); };
  const check = (forceWrong = false) => {
    if (feedback && !feedback.nearMiss) return;
    const result = gradeExercise({ exercise, given: given ?? "" });
    if (!forceWrong && result.nearMiss && !nearMisses.includes(exercise.id)) {
      setNearMisses((old) => [...old, exercise.id]); setFeedback(result); update(""); return;
    }
    const final = forceWrong || result.nearMiss ? { correct: false as const, nearMiss: false as const, message: `오답 — ${exercise.rationale}`, expected: expectedLabel(exercise) } : result;
    setSaved((old) => ({ ...old, [exercise.id]: answer(exercise, given, forceWrong || result.nearMiss) }));
    setFeedback(final);
  };
  const next = () => { setFeedback(null); itemStarted.current = Date.now(); if (index + 1 === session.exercises.length) finish(); else setIndex(index + 1); };
  const hasAnswer = exercise.type === "pair" ? Array.isArray(given) && given.length === exercise.pairs.length : given !== null && String(given).trim() !== "";
  return <section className="exam-stack exam-player"><div className="exam-player-head"><div><button className="exam-link" onClick={onExit}>← 나가기</button><p>{session.title} · {index + 1}/{session.exercises.length}</p></div>{mock && <strong>{String(Math.floor(remain / 60)).padStart(2, "0")}:{String(remain % 60).padStart(2, "0")}</strong>}</div>
    {mock && <div className="exam-dots">{session.exercises.map((ex, position) => <button key={ex.id} aria-current={position === index ? "step" : undefined} className={drafts[ex.id] !== undefined ? "answered" : ""} onClick={() => { setIndex(position); itemStarted.current = Date.now(); }}>{position + 1}</button>)}</div>}
    <div className="exam-question"><p className="exam-eyebrow">{exercise.type === "scenario_mcq" ? "사례" : exercise.type === "pair" ? "짝맞추기" : exercise.type === "cloze" ? "빈칸" : exercise.type === "short" ? "짧은 답" : exercise.type === "ox" ? "참 · 거짓" : "객관식"}</p><h1>{exercise.type === "pair" ? "용어와 설명을 연결하세요" : exercise.type === "cloze" ? exercise.template.replace(/\{\{[^}]+\}\}/g, "______") : exercise.type === "short" ? exercise.prompt : exercise.type === "ox" ? exercise.statement : exercise.stem}</h1></div>
    {(exercise.type === "mcq" || exercise.type === "scenario_mcq") && <div className="exam-choices">{exercise.choices.map((choice, choiceIndex) => <button key={choiceIndex} aria-pressed={given === choiceIndex} disabled={!!feedback && !mock} onClick={() => update(choiceIndex)}><span>{choiceIndex + 1}</span>{choice}</button>)}</div>}
    {exercise.type === "ox" && <div className="exam-actions"><button aria-pressed={given === true} onClick={() => update(true)}>참</button><button aria-pressed={given === false} onClick={() => update(false)}>거짓</button></div>}
    {(exercise.type === "short" || exercise.type === "cloze") && <><input className="exam-input" value={typeof given === "string" ? given : ""} onChange={(event) => update(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !mock && !feedback) check(); }} placeholder={exercise.type === "cloze" && exercise.answers.length > 1 ? "답을 | 로 구분하세요" : "답 입력"}/><div className="exam-actions">{exercise.type === "cloze" && <button onClick={() => setHints((old) => [...old, exercise.id])}>힌트 보기</button>}{exercise.type === "short" && !mock && <button onClick={() => check(true)}>모르겠어요</button>}</div>{exercise.type === "cloze" && hints.includes(exercise.id) && <p>첫 글자: {exercise.answers.map((values) => values[0]?.slice(0, 1)).join(" · ")}</p>}</>}
    {exercise.type === "pair" && <div className="exam-pairs">{exercise.pairs.map((pair) => { const links = Array.isArray(given) ? given : []; return <label key={pair.noteId}><span>{pair.term}</span><select value={links.find((link) => link.leftId === pair.noteId)?.rightId ?? ""} onChange={(event) => update([...links.filter((link) => link.leftId !== pair.noteId), { leftId: pair.noteId, rightId: event.target.value }])}><option value="">설명 선택</option>{pairChoices.map((candidate) => <option key={candidate.noteId} value={candidate.noteId}>{candidate.definition}</option>)}</select></label>; })}</div>}
    {feedback && !mock && <div className={feedback.correct ? "exam-feedback correct" : "exam-feedback"}><strong>{feedback.nearMiss ? "거의 맞았습니다. 다시 시도해 보세요." : feedback.correct ? "정답" : "오답"}</strong><p>{feedback.message}</p>{!feedback.nearMiss && <p>정답: {feedback.expected}</p>}{"extra" in feedback && feedback.extra && <p>{feedback.extra}</p>}</div>}
    <div className="exam-actions exam-player-actions">{mock ? <><button disabled={index === 0} onClick={() => setIndex(index - 1)}>이전</button>{index + 1 < session.exercises.length ? <button className="exam-primary" onClick={() => setIndex(index + 1)}>다음</button> : <button className="exam-primary" onClick={finish}>채점</button>}</> : feedback && !feedback.nearMiss ? <button className="exam-primary" onClick={next}>{index + 1 === session.exercises.length ? "결과 보기" : "다음"}</button> : <button className="exam-primary" disabled={!hasAnswer} onClick={() => check()}>확인</button>}</div>
  </section>;
}
