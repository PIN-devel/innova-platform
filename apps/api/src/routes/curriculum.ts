import { CurriculumIdSchema, CurriculumAnswerSubmissionSchema, CurriculumSubjectsResponseSchema, CurriculumChaptersResponseSchema, CurriculumQuizResponseSchema, CurriculumGradeResponseSchema, toCurriculumQuizQuestion, gradeCurriculumAnswer } from "@innova/contracts";
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import type { CurriculumReadRepository } from "../db/curriculum-read.js";
import { CurriculumReadingOrderError } from "../db/curriculum-read.js";
import type { CurriculumAssetReader } from "../curriculum-assets.js";
import { AppError, invalidInput } from "../errors.js";

type Params = { subjectId: string; chapterId: string; questionId: string; blockId: string; index: string };
export const curriculumRoutes: FastifyPluginAsync<{ repository: CurriculumReadRepository; assets: CurriculumAssetReader; requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown> }> = async (app, { repository, assets, requireAuth }) => {
  app.addHook("onRequest", async (_request, reply) => { reply.header("Cache-Control", "no-store").header("Vary", "Cookie").header("X-Content-Type-Options", "nosniff"); });
  app.addHook("preHandler", requireAuth);
  app.addHook("preHandler", async (request) => {
    for (const [key, value] of Object.entries(request.params as Record<string, string>)) if (key !== "index" && !CurriculumIdSchema.safeParse(value).success) throw invalidInput("Invalid Curriculum identifier");
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof CurriculumReadingOrderError) return reply.code(409).send({ error: { code: "BUSINESS_RULE_VIOLATION", message: error.message } });
    throw error;
  });
  const requireSubject = async (id: string) => {
    const subject = await repository.subject(id);
    if (!subject) throw new AppError(404, "NOT_FOUND", "Curriculum Subject not found");
    return subject;
  };
  const requireChapter = async (subjectId: string, chapterId: string) => {
    const detail = await repository.chapter(subjectId, chapterId);
    if (!detail) throw new AppError(404, "NOT_FOUND", "Curriculum Chapter not found");
    return detail;
  };
  app.get("/subjects", async () => CurriculumSubjectsResponseSchema.parse({ subjects: await repository.subjects() }));
  app.get<{ Params: Params }>("/subjects/:subjectId", async (req) => requireSubject(req.params.subjectId));
  app.get<{ Params: Params }>("/subjects/:subjectId/chapters", async (req) => CurriculumChaptersResponseSchema.parse({ subject: await requireSubject(req.params.subjectId), chapters: await repository.chapters(req.params.subjectId) }));
  app.get<{ Params: Params }>("/subjects/:subjectId/chapters/:chapterId", async (req) => requireChapter(req.params.subjectId, req.params.chapterId));
  app.get<{ Params: Params }>("/subjects/:subjectId/chapters/:chapterId/quiz", async (req) => {
    const { subjectId, chapterId } = req.params;
    await requireChapter(subjectId, chapterId);
    return CurriculumQuizResponseSchema.parse({ subjectId, chapterId, questions: (await repository.questions(subjectId, chapterId)).map(toCurriculumQuizQuestion) });
  });
  app.post<{ Params: Params }>("/subjects/:subjectId/chapters/:chapterId/questions/:questionId/grade", async (req) => {
    const { subjectId, chapterId, questionId } = req.params;
    await requireChapter(subjectId, chapterId);
    const question = (await repository.questions(subjectId, chapterId)).find((q) => q.id === questionId);
    if (!question) throw new AppError(404, "NOT_FOUND", "Curriculum Question not found");
    const parsed = CurriculumAnswerSubmissionSchema.safeParse(req.body);
    if (!parsed.success) throw invalidInput("Invalid Curriculum answer");
    let result;
    try { result = gradeCurriculumAnswer(question, parsed.data); } catch { throw invalidInput("Answer does not match the question"); }
    return CurriculumGradeResponseSchema.parse(result);
  });
  app.get<{ Params: Params }>("/subjects/:subjectId/chapters/:chapterId/blocks/:blockId/assets/:index", async (req, reply) => {
    const { subjectId, chapterId, blockId, index } = req.params;
    if (!/^(0|[1-9]\d*)$/.test(index)) throw invalidInput("Invalid asset index");
    const detail = await requireChapter(subjectId, chapterId);
    const content = detail.sourceBlocks.find((b) => b.id === blockId)?.content[Number(index)];
    if (!content || (content.type !== "image" && content.type !== "diagram")) throw new AppError(404, "NOT_FOUND", "Curriculum asset not found");
    const asset = await assets(content.assetKey);
    if (!asset) throw new AppError(404, "NOT_FOUND", "Private asset is unavailable in this runtime");
    return reply.type(asset.contentType).send(asset.bytes);
  });
};
