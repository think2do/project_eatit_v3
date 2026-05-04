import { z } from "zod";
import { bridge, type BridgeEvent } from "./nativeBridge";

// §B9 dual-end: Swift PickedFile.Encodable mirror.
// §C3: payload is user-selected resume/transcript content, not secret material.

export const PickedFileSchema = z.object({
  name: z.string(),
  size: z.number().int().nonnegative(),
  base64: z.string(),
});
export type PickedFile = z.infer<typeof PickedFileSchema>;

export const FileDroppedPayloadSchema = z.object({
  files: z.array(PickedFileSchema),
});
export type FileDroppedPayload = z.infer<typeof FileDroppedPayloadSchema>;

export const file = {
  pick: async (accept?: string[], multiple = false): Promise<PickedFile[]> => {
    const raw = await bridge.call("file.pick", {
      accept: accept ?? null,
      multiple,
    });
    return z.array(PickedFileSchema).parse(raw);
  },

  dropEnable: async (enabled: boolean): Promise<void> => {
    await bridge.call<void>("file.dropEnable", { enabled });
  },

  onDrop: (handler: (payload: FileDroppedPayload) => void): (() => void) => {
    return bridge.on("file-dropped", (event: BridgeEvent) => {
      handler(FileDroppedPayloadSchema.parse(event.payload));
    });
  },
};
