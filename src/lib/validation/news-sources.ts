import { z } from "zod";

/**
 * Validation schema for toggling a news source's active state.
 */
export const toggleNewsSourceSchema = z.object({
  sourceId: z.string().trim().min(1, "Source ID is required."),
  active: z
    .enum(["true", "false"])
    .transform((val) => val === "true"),
});

export type ToggleNewsSourceInput = z.infer<typeof toggleNewsSourceSchema>;
