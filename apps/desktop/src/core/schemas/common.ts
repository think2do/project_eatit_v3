import { z } from "zod";

/**
 * Mirror of Python TimestampedResponse(SchemaModel).
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export const TimestampedResponseSchema = z
  .object({
    id: z.string().uuid(),
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
  })
  .strict();

export type TimestampedResponse = z.infer<typeof TimestampedResponseSchema>;

/**
 * Generic factory for PaginatedResponse[T].
 * Zod lacks native generic schemas; use a factory function instead.
 * Mirrors Python PaginatedResponse(SchemaModel, Generic[T]) field constraints:
 *   page: ge=1 default=1, page_size: ge=1 le=100 default=20, total: ge=0 default=0.
 * .strict() enforces no extra fields (v3.4 spec line 1417).
 */
export function paginatedResponseSchema<T extends z.ZodTypeAny>(
  itemSchema: T,
) {
  return z
    .object({
      items: z.array(itemSchema),
      page: z.number().int().min(1).default(1),
      page_size: z.number().int().min(1).max(100).default(20),
      total: z.number().int().min(0).default(0),
    })
    .strict();
}

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  page_size: number;
  total: number;
};
