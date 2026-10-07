import { sp } from '@pnp/sp';
import { IMentionUser } from '../models';

/** Wording of the @mention email; each feed has its own. */
export interface IMentionMail {
  subject: string;
  intro: string;
  linkText: string;
}

export const SOCIAL_MENTION_MAIL: IMentionMail = {
  subject: 'You were mentioned in the Social Feed',
  intro: 'You were mentioned in a discussion post:',
  linkText: 'Open the discussion'
};

/**
 * Fire an immediate notification via the farm's outgoing SMTP
 * (Central Admin -> Outgoing E-Mail Settings). No Power Automate, no flow.
 * POST -> _api/SP.Utilities.Utility.SendEmail
 *
 * Note: SharePoint only relays to recipients it can resolve as site users,
 * which is fine because we sourced them from the local People Picker.
 */
export async function notifyMentions(
  mentions: IMentionUser[],
  postId: number,
  snippet: string,
  postUrl: string,
  mail: IMentionMail = SOCIAL_MENTION_MAIL
): Promise<void> {
  const recipients: string[] = mentions
    .map(m => m.email)
    .filter((e: string) => !!e);

  if (recipients.length === 0) { return; }

  const body: string =
    `<div style="font-family:Segoe UI,Arial,sans-serif;">
       <p>${mail.intro}</p>
       <blockquote style="border-left:3px solid #9B2242;padding-left:12px;color:#444;">
         ${snippet}
       </blockquote>
       <p><a href="${postUrl}">${mail.linkText} &rarr;</a></p>
     </div>`;

  try {
    await sp.utility.sendEmail({
      To: recipients,
      Subject: mail.subject,
      Body: body,
      AdditionalHeaders: { 'content-type': 'text/html' }
    });
  } catch (e) {
    // Best-effort: a relay hiccup must never block the post from saving.
    console.warn('[DiscussionFeed] sendEmail failed (post still saved):', e);
  }
}
