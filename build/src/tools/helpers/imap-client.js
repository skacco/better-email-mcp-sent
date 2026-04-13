/**
 * IMAP Client Manager
 * Manages connections to multiple IMAP servers with connection pooling
 */
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import { EmailMCPError } from './errors.js';
import { fastExtractSnippet, htmlToCleanText } from './html-utils.js';
/**
 * Create an ImapFlow client for the given account
 */
function createClient(account) {
    // Use local part only (before @) as IMAP username for self-hosted servers
    // that don't accept the full email address as login
    const imapUser = account.imap.imapUser || account.email.split('@')[0];
    return new ImapFlow({
        host: account.imap.host,
        port: account.imap.port,
        secure: account.imap.secure,
        auth: {
            user: imapUser,
            pass: account.password
        },
        tls: { rejectUnauthorized: false },
        logger: false
    });
}
/**
 * Execute an operation with an IMAP connection (auto-connect/disconnect)
 */
async function withConnection(account, fn) {
    const client = createClient(account);
    try {
        await client.connect();
        return await fn(client);
    }
    finally {
        try {
            await client.logout();
        }
        catch {
            // Ignore logout errors
        }
    }
}
/**
 * Build IMAP search criteria from query string
 */
function buildSearchCriteria(query) {
    const upper = query.toUpperCase().trim();
    // Simple keyword shortcuts
    if (upper === 'UNREAD' || upper === 'UNSEEN')
        return { seen: false };
    if (upper === 'READ' || upper === 'SEEN')
        return { seen: true };
    if (upper === 'FLAGGED' || upper === 'STARRED')
        return { flagged: true };
    if (upper === 'UNFLAGGED' || upper === 'UNSTARRED')
        return { flagged: false };
    if (upper === 'ALL' || upper === '*')
        return {};
    // Date range: SINCE YYYY-MM-DD BEFORE YYYY-MM-DD
    const sinceBeforeMatch = query.match(/^SINCE\s+(\d{4}-\d{2}-\d{2})\s+BEFORE\s+(\d{4}-\d{2}-\d{2})$/i);
    if (sinceBeforeMatch)
        return { since: new Date(sinceBeforeMatch[1]), before: new Date(sinceBeforeMatch[2]) };
    // Date range: BEFORE YYYY-MM-DD SINCE YYYY-MM-DD
    const beforeSinceMatch = query.match(/^BEFORE\s+(\d{4}-\d{2}-\d{2})\s+SINCE\s+(\d{4}-\d{2}-\d{2})$/i);
    if (beforeSinceMatch)
        return { before: new Date(beforeSinceMatch[1]), since: new Date(beforeSinceMatch[2]) };
    // Date-based: SINCE YYYY-MM-DD
    const sinceMatch = query.match(/^SINCE\s+(\d{4}-\d{2}-\d{2})$/i);
    if (sinceMatch)
        return { since: new Date(sinceMatch[1]) };
    // Date-based: BEFORE YYYY-MM-DD
    const beforeMatch = query.match(/^BEFORE\s+(\d{4}-\d{2}-\d{2})$/i);
    if (beforeMatch)
        return { before: new Date(beforeMatch[1]) };
    // From filter: FROM email@example.com (strip optional surrounding quotes)
    const fromMatch = query.match(/^FROM\s+(.+)$/i);
    if (fromMatch)
        return { from: fromMatch[1].trim().replace(/^["']|["']$/g, '') };
    // Subject filter: SUBJECT keyword (strip optional surrounding quotes)
    const subjectMatch = query.match(/^SUBJECT\s+(.+)$/i);
    if (subjectMatch)
        return { subject: subjectMatch[1].trim().replace(/^["']|["']$/g, '') };
    // Compound: UNREAD SINCE 2024-01-01
    const compoundUnreadSince = query.match(/^UNREAD\s+SINCE\s+(\d{4}-\d{2}-\d{2})$/i);
    if (compoundUnreadSince)
        return { seen: false, since: new Date(compoundUnreadSince[1]) };
    // Compound: UNREAD FROM x
    const compoundUnreadFrom = query.match(/^UNREAD\s+FROM\s+(.+)$/i);
    if (compoundUnreadFrom)
        return { seen: false, from: compoundUnreadFrom[1].trim().replace(/^["']|["']$/g, '') };
    // Default: treat as subject search
    return { subject: query };
}
/**
 * Extract a short snippet from email body
 */
async function extractSnippet(source, maxLength = 200) {
    try {
        const parsed = await simpleParser(source);
        const text = parsed.text || (parsed.html ? fastExtractSnippet(parsed.html, maxLength) : '');
        if (!text)
            return '';
        // If we used fastExtractSnippet, it's already cleaned and truncated
        if (parsed.html && !parsed.text)
            return text;
        const cleaned = text.replace(/\s+/g, ' ').trim();
        if (cleaned.length <= maxLength)
            return cleaned;
        return `${cleaned.substring(0, maxLength)}...`;
    }
    catch {
        return '';
    }
}
/**
 * Format email address from parsed address object
 */
function formatAddress(addr) {
    if (!addr)
        return '';
    if (typeof addr === 'string')
        return addr;
    if (addr.text)
        return addr.text;
    if (Array.isArray(addr.value)) {
        return addr.value.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(', ');
    }
    return '';
}
// ============================================================================
// Public API
// ============================================================================
/**
 * Search emails across one or multiple accounts
 */
export async function searchEmails(accounts, query, folder, limit) {
    const criteria = buildSearchCriteria(query);
    const accountPromises = accounts.map(async (account) => {
        try {
            const emails = await withConnection(account, async (client) => {
                const lock = await client.getMailboxLock(folder);
                try {
                    // Step 1: search to get UIDs (fast — server-side filtering)
                    const allUids = await client.search(criteria, { uid: true });
                    if (!allUids || allUids.length === 0)
                        return [];
                    // Step 2: take the most recent `limit` UIDs (highest UIDs = most recent)
                    const selectedUids = allUids.slice(-limit);
                    // Step 3: fetch only those specific UIDs
                    const messages = await client.fetchAll(selectedUids, {
                        uid: true,
                        flags: true,
                        envelope: true,
                        bodyStructure: true,
                        source: { start: 0, maxLength: 512 }
                    }, { uid: true });
                    // Process snippets in parallel to improve performance
                    const summariesPromises = messages.map(async (msg) => {
                        const snippet = msg.source ? await extractSnippet(msg.source) : '';
                        return {
                            account_id: account.id,
                            account_email: account.email,
                            uid: msg.uid,
                            message_id: msg.envelope?.messageId,
                            subject: msg.envelope?.subject || '(No subject)',
                            from: msg.envelope?.from?.[0]
                                ? `${msg.envelope.from[0].name || ''} <${msg.envelope.from[0].address || ''}>`.trim()
                                : '',
                            to: msg.envelope?.to?.map((a) => a.address).join(', ') || '',
                            date: msg.envelope?.date?.toISOString() || '',
                            flags: Array.from(msg.flags || []),
                            snippet
                        };
                    });
                    return Promise.all(summariesPromises);
                }
                finally {
                    lock.release();
                }
            });
            return emails;
        }
        catch (error) {
            // Include error info but continue with other accounts
            return [
                {
                    account_id: account.id,
                    account_email: account.email,
                    uid: 0,
                    subject: `[ERROR] ${error.message}`,
                    from: '',
                    to: '',
                    date: '',
                    flags: [],
                    snippet: `Failed to search ${account.email}: ${error.message}`
                }
            ];
        }
    });
    const resultsArrays = await Promise.all(accountPromises);
    return resultsArrays.flat();
}
/**
 * Read a single email by UID
 */
export async function readEmail(account, uid, folder) {
    return withConnection(account, async (client) => {
        const lock = await client.getMailboxLock(folder);
        try {
            const fetchResult = await client.fetchOne(`${uid}`, {
                flags: true,
                source: true
            }, { uid: true });
            if (!fetchResult || !fetchResult.source) {
                throw new EmailMCPError(`Email UID ${uid} not found in ${folder}`, 'NOT_FOUND', 'Check the UID and folder');
            }
            const msg = fetchResult;
            const parsed = await simpleParser(msg.source);
            const bodyText = parsed.text || (parsed.html ? htmlToCleanText(parsed.html) : '(Empty body)');
            return {
                account_id: account.id,
                account_email: account.email,
                uid: msg.uid,
                message_id: parsed.messageId,
                in_reply_to: parsed.inReplyTo,
                references: Array.isArray(parsed.references) ? parsed.references.join(' ') : parsed.references,
                subject: parsed.subject || '(No subject)',
                from: formatAddress(parsed.from),
                to: formatAddress(parsed.to),
                cc: formatAddress(parsed.cc),
                bcc: formatAddress(parsed.bcc),
                date: parsed.date?.toISOString() || '',
                flags: Array.from(msg.flags || []),
                body_text: bodyText,
                attachments: (parsed.attachments || []).map((att) => ({
                    filename: att.filename || 'unnamed',
                    content_type: att.contentType || 'application/octet-stream',
                    size: att.size || 0,
                    content_id: att.contentId
                }))
            };
        }
        finally {
            lock.release();
        }
    });
}
/**
 * Modify email flags (mark read/unread, flag/unflag)
 */
export async function modifyFlags(account, uids, folder, flags, action) {
    return withConnection(account, async (client) => {
        const lock = await client.getMailboxLock(folder);
        try {
            const uidStr = uids.join(',');
            if (action === 'add') {
                await client.messageFlagsAdd({ uid: uidStr }, flags);
            }
            else {
                await client.messageFlagsRemove({ uid: uidStr }, flags);
            }
            return { success: true, modified: uids.length };
        }
        finally {
            lock.release();
        }
    });
}
/**
 * Move emails to another folder
 */
export async function moveEmails(account, uids, fromFolder, toFolder) {
    return withConnection(account, async (client) => {
        const lock = await client.getMailboxLock(fromFolder);
        try {
            const uidStr = uids.join(',');
            await client.messageMove({ uid: uidStr }, toFolder);
            return { success: true, moved: uids.length };
        }
        finally {
            lock.release();
        }
    });
}
/**
 * Delete (trash) emails
 */
export async function trashEmails(account, uids, folder) {
    return withConnection(account, async (client) => {
        const lock = await client.getMailboxLock(folder);
        try {
            const uidStr = uids.join(',');
            await client.messageDelete({ uid: uidStr });
            return { success: true, trashed: uids.length };
        }
        finally {
            lock.release();
        }
    });
}
/**
 * List mailbox folders
 */
export async function listFolders(account) {
    return withConnection(account, async (client) => {
        const mailboxes = await client.list();
        return mailboxes.map((mb) => ({
            name: mb.name,
            path: mb.path,
            flags: Array.from(mb.flags || []),
            delimiter: mb.delimiter || '/'
        }));
    });
}
/**
 * Get attachment content by filename
 */
export async function getAttachment(account, uid, folder, filename) {
    return withConnection(account, async (client) => {
        const lock = await client.getMailboxLock(folder);
        try {
            const fetchResult = await client.fetchOne(`${uid}`, { source: true }, { uid: true });
            if (!fetchResult || !fetchResult.source) {
                throw new EmailMCPError(`Email UID ${uid} not found`, 'NOT_FOUND', 'Check the UID and folder');
            }
            const parsed = await simpleParser(fetchResult.source);
            const attachment = parsed.attachments?.find((att) => att.filename?.toLowerCase() === filename.toLowerCase());
            if (!attachment) {
                throw new EmailMCPError(`Attachment "${filename}" not found`, 'ATTACHMENT_NOT_FOUND', `Available: ${parsed.attachments?.map((a) => a.filename).join(', ') || 'none'}`);
            }
            return {
                filename: attachment.filename || 'unnamed',
                content_type: attachment.contentType || 'application/octet-stream',
                size: attachment.size || 0,
                content_base64: attachment.content.toString('base64')
            };
        }
        finally {
            lock.release();
        }
    });
}
/**
 * Append a sent email to the Sent folder via IMAP
 */
export async function appendToSent(account, rawMessage) {
    const sentFolderNames = ['Sent', 'Sent Items', 'Sent Mail', 'INBOX.Sent', '[Gmail]/Sent Mail'];
    return withConnection(account, async (client) => {
        // Find the Sent folder
        let sentFolder = null;
        for await (const mailbox of client.list()) {
            if (mailbox.specialUse === '\\Sent' || sentFolderNames.includes(mailbox.name)) {
                sentFolder = mailbox.path;
                break;
            }
        }
        if (!sentFolder) {
            sentFolder = 'Sent'; // fallback
        }
        const msgBuffer = Buffer.isBuffer(rawMessage) ? rawMessage : Buffer.from(rawMessage);
        await client.append(sentFolder, msgBuffer, ['\\Seen']);
    });
}
//# sourceMappingURL=imap-client.js.map