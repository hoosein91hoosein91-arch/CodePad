declare module "JSCPP" {
  interface JSCPPApi {
    run: (
      code: string,
      input?: string,
      config?: {
        stdio?: { write?: (chunk: string) => void };
        maxTimeout?: number;
      },
    ) => unknown;
  }
  const JSCPP: JSCPPApi;
  export default JSCPP;
}
