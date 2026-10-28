import {z} from 'zod';
import {businessEventSchema} from './finance-business.js';
export const categoryIdSchema=z.union([z.literal('unclassified'),z.uuid()]);
export const classificationMoneySchema=z.string().regex(/^-?(0|[1-9]\d{0,24})$/);
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const allocationSchema=z.object({categoryId:categoryIdSchema,amount:classificationMoneySchema}).strict();
export const classificationEditSchema=z.object({eventId:z.uuid(),description:z.string().trim().min(1).max(200),occurredOn:date,amount:classificationMoneySchema,note:z.string().max(2000),allocations:z.array(allocationSchema).min(1).max(100),confirmed:z.boolean(),refundOf:z.uuid().nullable()}).strict();
export const classificationStateSchema=z.object({categories:z.array(z.object({id:categoryIdSchema,name:z.string().trim().min(1).max(40)})).max(100),edits:z.array(classificationEditSchema).max(10000)});
export const classificationCommandSchema=z.object({expectedRevision:z.number().int().min(0).max(10000),operationId:z.uuid(),change:z.discriminatedUnion('type',[
 z.object({type:z.literal('edit'),edit:classificationEditSchema}).strict(),
 z.object({type:z.literal('reset'),eventId:z.uuid()}).strict(),
 z.object({type:z.literal('restore'),eventId:z.uuid(),revision:z.number().int().positive()}).strict(),
 z.object({type:z.literal('category-add'),id:z.uuid(),name:z.string().trim().min(1).max(40)}).strict(),
 z.object({type:z.literal('category-rename'),id:z.uuid(),name:z.string().trim().min(1).max(40)}).strict(),
 z.object({type:z.literal('category-move'),id:z.uuid(),targetId:categoryIdSchema}).strict(),
])}).strict();
export const classificationViewSchema=z.object({revision:z.number().int().nonnegative(),updatedAt:z.string().nullable(),categories:classificationStateSchema.shape.categories,transactions:z.array(z.object({event:businessEventSchema,documentId:z.uuid(),sourceReview:z.boolean(),basisDate:date.nullable(),eligible:z.boolean(),effective:classificationEditSchema.nullable(),userEdited:z.boolean()})),history:z.array(z.object({revision:z.number().int().positive(),operationId:z.uuid(),createdAt:z.string(),type:z.string(),eventId:z.uuid().nullable()})),summary:z.object({total:classificationMoneySchema,transactionCount:z.number().int().nonnegative(),excludedCount:z.number().int().nonnegative(),allocations:z.array(z.object({categoryId:categoryIdSchema,amount:classificationMoneySchema,transactionCount:z.number().int().nonnegative()}))})});
export type ClassificationState=z.infer<typeof classificationStateSchema>;
export type ClassificationCommand=z.infer<typeof classificationCommandSchema>;
export type ClassificationEdit=z.infer<typeof classificationEditSchema>;
export type ClassificationView=z.infer<typeof classificationViewSchema>;
