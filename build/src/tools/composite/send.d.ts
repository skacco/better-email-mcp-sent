/**
 * Send Mega Tool
 * Send new emails, reply, and forward via SMTP
 */
import type { AccountConfig } from '../helpers/config.js';
export interface SendInput {
    action: 'new' | 'reply' | 'forward';
    account: string;
    body: string;
    to?: string;
    subject?: string;
    cc?: string;
    bcc?: string;
    uid?: number;
    folder?: string;
}
/**
 * Unified send tool - handles all outbound email operations
 */
export declare function send(accounts: AccountConfig[], input: SendInput): Promise<any>;
//# sourceMappingURL=send.d.ts.map