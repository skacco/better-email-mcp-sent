/**
 * SMTP Client
 * Send, reply, and forward emails via SMTP using Nodemailer
 */
import type { AccountConfig } from './config.js';
export interface SendEmailOptions {
    to: string;
    subject: string;
    body: string;
    cc?: string;
    bcc?: string;
    in_reply_to?: string;
    references?: string;
}
/**
 * Send a new email
 */
export declare function sendNewEmail(account: AccountConfig, options: SendEmailOptions): Promise<{
    success: boolean;
    message_id: string;
}>;
/**
 * Reply to an email (maintains thread via In-Reply-To and References headers)
 */
export declare function replyToEmail(account: AccountConfig, options: SendEmailOptions): Promise<{
    success: boolean;
    message_id: string;
}>;
/**
 * Forward an email
 */
export declare function forwardEmail(account: AccountConfig, options: SendEmailOptions & {
    original_body: string;
}): Promise<{
    success: boolean;
    message_id: string;
}>;
//# sourceMappingURL=smtp-client.d.ts.map