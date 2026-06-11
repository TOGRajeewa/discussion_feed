// Minimal stand-in for @microsoft/sp-http so unit tests can run off-farm.
// PeopleService only needs SPHttpClient.configurations.v1 to exist at runtime.
export class SPHttpClient {
  public static configurations = { v1: {} };
}
export interface SPHttpClientResponse {
  json(): Promise<any>;
}
