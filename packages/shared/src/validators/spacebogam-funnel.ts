import { z } from "zod";

export const spacebogamFunnelRangeDaysSchema = z.union([z.literal(7), z.literal(28), z.literal(90)]);
export const spacebogamFunnelStageKeySchema = z.enum([
  "visit",
  "engaged",
  "consultation",
  "form_start",
  "lead",
]);
export const spacebogamFunnelQualityStatusSchema = z.enum([
  "empty",
  "collecting",
  "ready",
  "stale",
  "invalid_sequence",
]);
export const spacebogamFunnelCampaignSampleStatusSchema = z.enum(["usable", "insufficient"]);
export const spacebogamFunnelRecommendationConfidenceSchema = z.enum([
  "measurement_only",
  "directional",
]);

const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const countSchema = z.number().int().nonnegative();
const finiteNumberSchema = z.number().finite();
const reportRateSchema = finiteNumberSchema.min(0).max(1);
const nullableReportRateSchema = reportRateSchema.nullable();
const nullableReportStageRateSchema = finiteNumberSchema.nullable();
const timestampSchema = z.string().min(1);

export const spacebogamFunnelCountsSchema = z.object({
  visits: countSchema,
  engagedVisits: countSchema,
  consultationClicks: countSchema,
  formStarts: countSchema,
  submittedLeads: countSchema,
}).strict();

export const spacebogamFunnelStageSchema = z.object({
  key: spacebogamFunnelStageKeySchema,
  label: z.string().min(1),
  count: countSchema,
  previousCount: countSchema.nullable(),
  conversionFromPrevious: nullableReportStageRateSchema,
  dropOffCount: z.number().int().nullable(),
  dropOffRate: nullableReportStageRateSchema,
}).strict();

export const spacebogamFunnelDailySchema = z.object({
  date: dateStringSchema,
  visits: countSchema,
  submittedLeads: countSchema,
  visitToLeadRate: nullableReportRateSchema,
}).strict();

export const spacebogamFunnelCampaignSchema = z.object({
  source: z.string(),
  medium: z.string(),
  campaign: z.string(),
  visits: countSchema,
  submittedLeads: countSchema,
  visitToLeadRate: nullableReportRateSchema,
  sampleStatus: spacebogamFunnelCampaignSampleStatusSchema,
}).strict();

export const spacebogamFunnelQualitySchema = z.object({
  status: spacebogamFunnelQualityStatusSchema,
  sampleSessions: countSchema,
  minimumReadySessions: z.literal(50),
  newestEventAt: timestampSchema.nullable(),
  freshnessHours: finiteNumberSchema.nullable(),
  utmTaggedVisitRate: nullableReportRateSchema,
  missingDataDays: z.array(dateStringSchema),
  isMonotonic: z.boolean(),
  warnings: z.array(z.string()),
}).strict();

export const spacebogamFunnelBottleneckSchema = z.object({
  fromStage: z.string().min(1),
  toStage: z.string().min(1),
  lostSessions: z.number().int(),
  lossRate: reportRateSchema,
}).strict();

export const spacebogamFunnelRecommendationSchema = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  reason: z.string().min(1),
  action: z.string().min(1),
  confidence: spacebogamFunnelRecommendationConfidenceSchema,
}).strict();

export const spacebogamFunnelReportSchema = z.object({
  schemaVersion: z.literal(1),
  timezone: z.literal("Asia/Seoul"),
  rangeDays: spacebogamFunnelRangeDaysSchema,
  generatedAt: timestampSchema,
  dataThrough: timestampSchema.nullable(),
  collectionStartedAt: timestampSchema.nullable(),
  counts: spacebogamFunnelCountsSchema,
  stages: z.array(spacebogamFunnelStageSchema),
  daily: z.array(spacebogamFunnelDailySchema),
  campaigns: z.array(spacebogamFunnelCampaignSchema),
  quality: spacebogamFunnelQualitySchema,
  bottleneck: spacebogamFunnelBottleneckSchema.nullable(),
  recommendations: z.array(spacebogamFunnelRecommendationSchema),
  legacyBaseline: z.unknown(),
}).strict().superRefine((report, ctx) => {
  if (report.daily.length !== report.rangeDays) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "daily length must match rangeDays",
      path: ["daily"],
    });
  }
  if (report.quality.status === "invalid_sequence" || !report.quality.isMonotonic) return;

  report.stages.forEach((stage, index) => {
    if (stage.conversionFromPrevious !== null && (stage.conversionFromPrevious < 0 || stage.conversionFromPrevious > 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "conversionFromPrevious must be a ratio between 0 and 1 for monotonic reports",
        path: ["stages", index, "conversionFromPrevious"],
      });
    }
    if (stage.dropOffRate !== null && (stage.dropOffRate < 0 || stage.dropOffRate > 1)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dropOffRate must be a ratio between 0 and 1 for monotonic reports",
        path: ["stages", index, "dropOffRate"],
      });
    }
    if (stage.dropOffCount !== null && stage.dropOffCount < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "dropOffCount must be nonnegative for monotonic reports",
        path: ["stages", index, "dropOffCount"],
      });
    }
  });
});

export type SpacebogamFunnelRangeDays = z.infer<typeof spacebogamFunnelRangeDaysSchema>;
export type SpacebogamFunnelStageKey = z.infer<typeof spacebogamFunnelStageKeySchema>;
export type SpacebogamFunnelQualityStatus = z.infer<typeof spacebogamFunnelQualityStatusSchema>;
export type SpacebogamFunnelReport = z.infer<typeof spacebogamFunnelReportSchema>;
