import { searchPeople } from '../PeopleService';

/** Fake SPHttpClient capturing the request and returning a canned picker payload. */
function fakeClient(pickerJsonString: string): any {
  return {
    lastCall: null as any,
    post(url: string, _cfg: any, opts: any): Promise<any> {
      (this as any).lastCall = { url, opts };
      return Promise.resolve({ json: () => Promise.resolve({ value: pickerJsonString }) });
    }
  };
}

describe('searchPeople (local Client People Picker)', () => {
  it('double-parses the .value string and maps entities', async () => {
    // The picker returns .value as a JSON *string* — the classic on-prem gotcha.
    const payload: string = JSON.stringify([
      { Key: 'i:0#.w|contoso\\ksilva', DisplayText: 'K. Silva', EntityData: { Email: 'ksilva@contoso.com' } },
      { Key: 'i:0#.w|contoso\\npeiris', DisplayText: 'N. Peiris', EntityData: {} }
    ]);
    const client: any = fakeClient(payload);

    const result = await searchPeople(client, 'https://intranet/sites/x', 'silva');

    expect(result.length).toBe(2);
    expect(result[0]).toEqual({
      loginName: 'i:0#.w|contoso\\ksilva', title: 'K. Silva', email: 'ksilva@contoso.com'
    });
    expect(result[1].email).toBe('');            // missing EntityData.Email -> ''
  });

  it('posts to the ClientPeoplePickerSearchUser endpoint with Users-only filter', async () => {
    const client: any = fakeClient('[]');
    await searchPeople(client, 'https://intranet/sites/x', 'abc');

    expect(client.lastCall.url).toContain(
      '/_api/SP.UI.ApplicationPages.ClientPeoplePickerWebServiceInterface.ClientPeoplePickerSearchUser'
    );
    const body: any = JSON.parse(client.lastCall.opts.body);
    expect(body.queryParams.PrincipalType).toBe(1);   // 1 = users only
    expect(body.queryParams.QueryString).toBe('abc');
  });

  it('short-circuits on a too-short query (no network call)', async () => {
    const client: any = fakeClient('[]');
    const result = await searchPeople(client, 'https://intranet', 'a');
    expect(result).toEqual([]);
    expect(client.lastCall).toBeNull();
  });
});
