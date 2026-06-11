import { sp } from '@pnp/sp';
import { WebPartContext } from '@microsoft/sp-webpart-base';

let configured = false;

/**
 * Wire PnPjs v1 to the SPFx page context exactly once.
 * This gives PnP the request digest + base web url so all writes succeed
 * against the on-prem _api endpoints (no cloud, no Graph).
 */
export function configurePnP(context: WebPartContext): void {
  if (configured) { return; }
  sp.setup({
    spfxContext: context as any,
    sp: {
      headers: {
        Accept: 'application/json;odata=verbose'
      }
    }
  });
  configured = true;
}
