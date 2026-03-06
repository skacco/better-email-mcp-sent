/**
 * Attachments Mega Tool
 * List and download email attachments
 */
import type { AccountConfig } from '../helpers/config.js';
export interface AttachmentsInput {
    action: 'list' | 'download';
    account: string;
    uid: number;
    folder?: string;
    filename?: string;
}
/**
 * Unified attachments tool - handles attachment operations
 */
export declare function attachments(accounts: AccountConfig[], input: AttachmentsInput): Promise<any>;
//# sourceMappingURL=attachments.d.ts.map