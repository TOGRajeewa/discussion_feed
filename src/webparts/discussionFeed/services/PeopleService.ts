import { SPHttpClient, SPHttpClientResponse } from '@microsoft/sp-http';
import { IMentionUser } from '../models';

/**
 * Query the LOCAL SharePoint Client People Picker web service.
 * This is the on-prem-correct path for @mentions — no Microsoft Graph.
 * POST -> _api/SP.UI.ApplicationPages.ClientPeoplePickerWebServiceInterface.ClientPeoplePickerSearchUser
 */
export async function searchPeople(
  spHttpClient: SPHttpClient,
  webUrl: string,
  query: string,
  maxSuggestions: number = 8
): Promise<IMentionUser[]> {
  if (!query || query.length < 2) { return []; }

  const body: string = JSON.stringify({
    queryParams: {
      __metadata: { type: 'SP.UI.ApplicationPages.ClientPeoplePickerQueryParameters' },
      AllowEmailAddresses: false,
      AllowMultipleEntities: false,
      MaximumEntitySuggestions: maxSuggestions,
      PrincipalSource: 15,   // All
      PrincipalType: 1,      // 1 = Users only
      QueryString: query
    }
  });

  const url: string =
    `${webUrl}/_api/SP.UI.ApplicationPages.ClientPeoplePickerWebServiceInterface.ClientPeoplePickerSearchUser`;

  const res: SPHttpClientResponse = await spHttpClient.post(url, SPHttpClient.configurations.v1, {
    headers: {
      'Accept': 'application/json;odata=nometadata',
      'Content-type': 'application/json;odata=verbose',
      'odata-version': ''
    },
    body
  });

  const json: any = await res.json();
  // .value is itself a JSON *string* — must be parsed a second time.
  const raw: string = json.value || (json.d && json.d.ClientPeoplePickerSearchUser) || '[]';
  const entities: any[] = JSON.parse(raw);

  return entities.map((e: any) => ({
    loginName: e.Key,                                   // i:0#.w|domain\user
    title: e.DisplayText,
    email: (e.EntityData && e.EntityData.Email) || ''
  }));
}
