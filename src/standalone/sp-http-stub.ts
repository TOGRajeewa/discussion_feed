// In the standalone (classic-page) build there is no SPFx runtime, so
// `@microsoft/sp-http` is aliased to this stub in webpack.standalone.js.
// PeopleService only references SPHttpClient.configurations.v1 (a placeholder)
// and the SPHttpClient/Response *types*; the actual HTTP work is done by
// ClassicHttpClient, which is passed in as the `spHttpClient` prop.
export class SPHttpClient {
  public static configurations: { v1: any } = { v1: {} };
}
export interface SPHttpClientResponse {
  json(): Promise<any>;
}
