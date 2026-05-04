import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  TimestampedResponseSchema,
  paginatedResponseSchema,
} from "../common";
import {
  CandidateAssetStatusSchema,
  AssetUploadResponseSchema,
  AssetUploadRequestSchema,
  CandidateAssetResponseSchema,
} from "../assets";

const VALID_UUID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const VALID_UUID2 = "550e8400-e29b-41d4-a716-446655440000";
const VALID_ISO = "2024-01-15T10:30:00.000Z";
const VALID_ISO2 = "2024-01-15T11:00:00.000Z";

const validTimestamped = {
  id: VALID_UUID,
  created_at: VALID_ISO,
  updated_at: VALID_ISO2,
};

describe("common.ts schemas", () => {
  describe("TimestampedResponseSchema", () => {
    it("parses valid {id, created_at, updated_at}", () => {
      const result = TimestampedResponseSchema.parse(validTimestamped);
      expect(result.id).toBe(VALID_UUID);
      expect(result.created_at).toBe(VALID_ISO);
      expect(result.updated_at).toBe(VALID_ISO2);
    });

    it("rejects extra field via .strict()", () => {
      expect(() =>
        TimestampedResponseSchema.parse({
          ...validTimestamped,
          extra: "evil",
        }),
      ).toThrow(z.ZodError);
    });

    it("rejects invalid uuid format", () => {
      expect(() =>
        TimestampedResponseSchema.parse({
          ...validTimestamped,
          id: "not-a-uuid",
        }),
      ).toThrow(z.ZodError);
    });

    it("rejects non-ISO datetime string", () => {
      expect(() =>
        TimestampedResponseSchema.parse({
          ...validTimestamped,
          created_at: "January 15 2024",
        }),
      ).toThrow(z.ZodError);
    });

    it("rejects missing required field", () => {
      const { updated_at: _omit, ...partial } = validTimestamped;
      expect(() => TimestampedResponseSchema.parse(partial)).toThrow(
        z.ZodError,
      );
    });
  });

  describe("paginatedResponseSchema", () => {
    const ItemSchema = z.object({ name: z.string() }).strict();
    const PaginatedSchema = paginatedResponseSchema(ItemSchema);

    it("accepts valid items with defaults page=1 / page_size=20 / total=0", () => {
      const result = PaginatedSchema.parse({ items: [{ name: "Test User" }] });
      expect(result.items).toEqual([{ name: "Test User" }]);
      expect(result.page).toBe(1);
      expect(result.page_size).toBe(20);
      expect(result.total).toBe(0);
    });

    it("accepts explicit page / page_size / total values", () => {
      const result = PaginatedSchema.parse({
        items: [],
        page: 3,
        page_size: 50,
        total: 150,
      });
      expect(result.page).toBe(3);
      expect(result.page_size).toBe(50);
      expect(result.total).toBe(150);
    });

    it("rejects page=0 (ge=1)", () => {
      expect(() =>
        PaginatedSchema.parse({ items: [], page: 0 }),
      ).toThrow(z.ZodError);
    });

    it("rejects page_size=101 (le=100)", () => {
      expect(() =>
        PaginatedSchema.parse({ items: [], page_size: 101 }),
      ).toThrow(z.ZodError);
    });

    it("rejects page_size=0 (ge=1)", () => {
      expect(() =>
        PaginatedSchema.parse({ items: [], page_size: 0 }),
      ).toThrow(z.ZodError);
    });

    it("rejects total=-1 (ge=0)", () => {
      expect(() =>
        PaginatedSchema.parse({ items: [], total: -1 }),
      ).toThrow(z.ZodError);
    });

    it("rejects extra fields via .strict()", () => {
      expect(() =>
        PaginatedSchema.parse({ items: [], extra_field: "evil" }),
      ).toThrow(z.ZodError);
    });
  });
});

describe("assets.ts schemas", () => {
  describe("CandidateAssetStatusSchema", () => {
    it("accepts all 5 valid enum values", () => {
      const values = [
        "DRAFT",
        "READY_FOR_PARSE",
        "PARSE_IN_PROGRESS",
        "ANALYSIS_READY",
        "PARSE_FAILED",
      ] as const;
      for (const v of values) {
        expect(CandidateAssetStatusSchema.parse(v)).toBe(v);
      }
    });

    it("rejects invalid enum value", () => {
      expect(() => CandidateAssetStatusSchema.parse("INVALID")).toThrow(
        z.ZodError,
      );
    });
  });

  describe("AssetUploadResponseSchema", () => {
    const validUpload = {
      ...validTimestamped,
      asset_bundle_id: VALID_UUID2,
      status: "DRAFT",
      uploaded_kind: "resume",
    };

    it("parses with all required fields", () => {
      const result = AssetUploadResponseSchema.parse(validUpload);
      expect(result.status).toBe("DRAFT");
      expect(result.asset_bundle_id).toBe(VALID_UUID2);
      expect(result.uploaded_kind).toBe("resume");
    });

    it("rejects extra field via .strict()", () => {
      expect(() =>
        AssetUploadResponseSchema.parse({ ...validUpload, extra: "evil" }),
      ).toThrow(z.ZodError);
    });

    it("rejects missing required asset_bundle_id", () => {
      const { asset_bundle_id: _omit, ...partial } = validUpload;
      expect(() => AssetUploadResponseSchema.parse(partial)).toThrow(
        z.ZodError,
      );
    });
  });

  describe("AssetUploadRequestSchema", () => {
    it("accepts asset_bundle_id as null", () => {
      const result = AssetUploadRequestSchema.parse({ asset_bundle_id: null });
      expect(result.asset_bundle_id).toBeNull();
    });

    it("accepts asset_bundle_id as undefined (omitted)", () => {
      const result = AssetUploadRequestSchema.parse({});
      expect(result.asset_bundle_id).toBeUndefined();
    });

    it("accepts valid uuid for asset_bundle_id", () => {
      const result = AssetUploadRequestSchema.parse({
        asset_bundle_id: VALID_UUID,
      });
      expect(result.asset_bundle_id).toBe(VALID_UUID);
    });

    it("rejects extra field via .strict()", () => {
      expect(() =>
        AssetUploadRequestSchema.parse({
          asset_bundle_id: null,
          extra: "evil",
        }),
      ).toThrow(z.ZodError);
    });
  });

  describe("CandidateAssetResponseSchema", () => {
    const validCandidate = {
      ...validTimestamped,
      user_id: VALID_UUID2,
      status: "ANALYSIS_READY",
    };

    it("accepts parse_preview as null", () => {
      const result = CandidateAssetResponseSchema.parse({
        ...validCandidate,
        parse_preview: null,
      });
      expect(result.parse_preview).toBeNull();
    });

    it("accepts parse_preview as object (unknown shape)", () => {
      const result = CandidateAssetResponseSchema.parse({
        ...validCandidate,
        parse_preview: { score: 0.9, summary: "Acme Corp role match" },
      });
      expect(result.parse_preview).toEqual({
        score: 0.9,
        summary: "Acme Corp role match",
      });
    });

    it("accepts parse_preview as undefined (omitted)", () => {
      const result = CandidateAssetResponseSchema.parse(validCandidate);
      expect(result.parse_preview).toBeUndefined();
    });

    it("accepts optional resume_filename and jd_filename as null", () => {
      const result = CandidateAssetResponseSchema.parse({
        ...validCandidate,
        resume_filename: null,
        jd_filename: null,
      });
      expect(result.resume_filename).toBeNull();
      expect(result.jd_filename).toBeNull();
    });

    it("rejects extra field via .strict()", () => {
      expect(() =>
        CandidateAssetResponseSchema.parse({
          ...validCandidate,
          extra: "evil",
        }),
      ).toThrow(z.ZodError);
    });
  });
});
