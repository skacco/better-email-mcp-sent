/**
 * IMAP Client Manager
 * Manages connections to multiple IMAP servers with connection pooling
 */
import type { AccountConfig } from './config.js';
export interface EmailSummary {
    account_id: string;
    account_email: string;
    uid: number;
    message_id?: string;
    subject: string;
    from: string;
    to: string;
    date: string;
    flags: string[];
    snippet: string;
}
export interface EmailDetail {
    account_id: string;
    account_email: string;
    uid: number;
    message_id?: string;
    in_reply_to?: string;
    references?: string;
    subject: string;
    from: string;
    to: string;
    cc?: string;
    bcc?: string;
    date: string;
    flags: string[];
    body_text: string;
    attachments: AttachmentInfo[];
}
export interface AttachmentInfo {
    filename: string;
    content_type: string;
    size: number;
    content_id?: string;
}
export interface FolderInfo {
    name: string;
    path: string;
    flags: string[];
    delimiter: string;
}
/**
 * Search emails across one or multiple accounts
 */
export declare function searchEmails(accounts: AccountConfig[], query: string, folder: string, limit: number): Promise<EmailSummary[]>;
/**
 * Read a single email by UID
 */
export declare function readEmail(account: AccountConfig, uid: number, folder: string): Promise<EmailDetail>;
/**
 * Modify email flags (mark read/unread, flag/unflag)
 */
export declare function modifyFlags(account: AccountConfig, uids: number[], folder: string, flags: string[], action: 'add' | 'remove'): Promise<{
    success: boolean;
    modified: number;
}>;
/**
 * Move emails to another folder
 */
export declare function moveEmails(account: AccountConfig, uids: number[], fromFolder: string, toFolder: string): Promise<{
    success: boolean;
    moved: number;
}>;
/**
 * Delete (trash) emails
 */
export declare function trashEmails(account: AccountConfig, uids: number[], folder: string): Promise<{
    success: boolean;
    trashed: number;
}>;
/**
 * List mailbox folders
 */
export declare function listFolders(account: AccountConfig): Promise<FolderInfo[]>;
/**
 * Get attachment content by filename
 */
export declare function getAttachment(account: AccountConfig, uid: number, folder: string, filename: string): Promise<{
    filename: string;
    content_type: string;
    size: number;
    content_base64: string;
}>;
//# sourceMappingURL=imap-client.d.ts.map