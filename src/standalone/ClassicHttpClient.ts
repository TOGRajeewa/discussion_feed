// Drop-in replacement for SPFx's SPHttpClient on a classic page. Implements the
// only surface PeopleService uses: post(url, config, options) -> { json() }.
// Adds the SharePoint form-digest required for POSTs (e.g. the People Picker call).
export class ClassicHttpClient {
  public static configurations: { v1: any } = { v1: {} };

  constructor(private webUrl: string) { }

  public post(url: string, _config: any, options: any): Promise<{ json(): Promise<any> }> {
    return this.getDigest().then((digest: string) => {
      const headers: any = { 'X-RequestDigest': digest };
      if (options && options.headers) {
        for (const k in options.headers) {
          if (options.headers.hasOwnProperty(k)) { headers[k] = options.headers[k]; }
        }
      }
      return fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: headers,
        body: options ? options.body : undefined
      }).then((res: Response) => ({ json: () => res.json() }));
    });
  }

  /** Use the on-page __REQUESTDIGEST when present (classic pages have it), else fetch one. */
  private getDigest(): Promise<string> {
    const el: HTMLInputElement = document.getElementById('__REQUESTDIGEST') as HTMLInputElement;
    if (el && el.value) { return Promise.resolve(el.value); }
    return fetch(this.webUrl + '/_api/contextinfo', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { Accept: 'application/json;odata=verbose' }
    })
      .then((r: Response) => r.json())
      .then((j: any) => j.d.GetContextWebInformation.FormDigestValue);
  }
}
