import { bridge } from "./nativeBridge";

// §C3: no get() method. Secrets stay in Swift; JS only knows whether something is configured.
// §C1 service name lock = "com.eatit.desktop" (held in Swift KeychainService.serviceName).
// Account names should match §C1: ark-api-key / volc-asr-credentials / app-encryption-key.

export const keychain = {
  save: (account: string, secret: string): Promise<void> =>
    bridge.call<void>("keychain.save", { account, secret }),

  exists: (account: string): Promise<{ exists: boolean }> =>
    bridge.call<{ exists: boolean }>("keychain.exists", { account }),

  delete: (account: string): Promise<void> =>
    bridge.call<void>("keychain.delete", { account }),
};
