type HexagoniaRuntimeConfig = {
  apiBaseUrl?: string | null;
  wsUrl?: string | null;
  recaptchaSiteKey?: string | null;
};

declare global {
  interface Window {
    __HEXAGONIA_CONFIG__?: HexagoniaRuntimeConfig;
  }
}

export {};
