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
        logger: {
            debug: (obj) => process.stderr.write('[IMAP] ' + JSON.stringify(obj) + '\n'),
            info: (obj) => process.stderr.write('[IMAP] ' + JSON.stringify(obj) + '\n'),
            warn: (obj) => process.stderr.write('[IMAP] ' + JSON.stringify(obj) + '\n'),
            error: (obj) => process.stderr.write('[IMAP] ' + JSON.stringify(obj) + '\n'),
        }
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
 * Parse query into server-side IMAP criteria (only what Dovecot supports reliably)
 * and client-side filters for TO and BEFORE (applied after envelope fetch).
 */
function parseQuery(query) {
    const upper = query.toUpperCase().trim();
    process.stderr.write('[parseQuery] input: ' + query + '\n');
    // Simple flag shortcuts — fully server-side
    if (upper === 'UNREAD' || upper === 'UNSEEN') return { criteria: { seen: false } };
    if (upper === 'READ' || upper === 'SEEN') return { criteria: { seen: true } };
    if (upper === 'FLAGGED' || upper === 'STARRED') return { criteria: { flagged: true } };
    if (upper === 'UNFLAGGED' || upper === 'UNSTARRED') return { criteria: { flagged: false } };
    if (upper === 'ALL' || upper === '*') return { criteria: {} };
    // TO filter — client-side only (server doesn't support it reliably)
    const toSinceMatch = query.match(/^TO\s+(.+?)\s+SINCE\s+(\d{4}-\d{2}-\d{2})$/i);
    if (toSinceMatch)
        return { criteria: { since: new Date(toSinceMatch[2]) }, toFilter: toSinceMatch[1].trim().replace(/^["']|["']$/g, '') };
    const toMatch = query.match(/^TO\s+(.+)$/i);
    if (toMatch)
        return { criteria: { all: true }, toFilter: toMatch[1].trim().replace(/^["']|["']$/g, '') };
    // Date range — SINCE server-side, BEFORE client-side
    const sinceBeforeMatch = query.match(/^SINCE\s+(\d{4}-\d{2}-\d{2})\s+BEFORE\s+(\d{4}-\d{2}-\d{2})$/i);
    if (sinceBeforeMatch)
        return { criteria: { since: new Date(sinceBeforeMatch[1]) }, beforeDate: new Date(sinceBeforeMatch[2]) };
    const beforeSinceMatch = query.match(/^BEFORE\s+(\d{4}-\d{2}-\d{2})\s+SINCE\s+(\d{4}-\d{2}-\d{2})$/i);
    if (beforeSinceMatch)
        return { criteria: { since: new Date(beforeSinceMatch[2]) }, beforeDate: new Date(beforeSinceMatch[1]) };
    // SINCE alone — server-side
    const sinceMatch = query.match(/^SINCE\s+(\d{4}-\d{2}-\d{2})$/i);
    if (sinceMatch) return { criteria: { since: new Date(sinceMatch[1]) } };
    // BEFORE alone — client-side only
    const beforeMatch = query.match(/^BEFORE\s+(\d{4}-\d{2}-\d{2})$/i);
    if (beforeMatch) return { criteria: { all: true }, beforeDate: new Date(beforeMatch[1]) };
    // FROM — server-side
    const fromMatch = query.match(/^FROM\s+(.+)$/i);
    if (fromMatch) return { criteria: { from: fromMatch[1].trim().replace(/^["']|["']$/g, '') } };
    // FROM x SINCE date — server-side
    const fromSinceMatch = query.match(/^FROM\s+(.+?)\s+SINCE\s+(\d{4}-\d{2}-\d{2})$/i);
    if (fromSinceMatch)
        return { criteria: { from: fromSinceMatch[1].trim().replace(/^["']|["']$/g, ''), since: new Date(fromSinceMatch[2]) } };
    // SUBJECT — server-side
    const subjectMatch = query.match(/^SUBJECT\s+(.+)$/i);
    if (subjectMatch) return { criteria: { subject: subjectMatch[1].trim().replace(/^["']|["']$/g, '') } };
    // UNREAD SINCE — server-side
    const unreadSinceMatch = query.match(/^UNREAD\s+SINCE\s+(\d{4}-\d{2}-\d{2})$/i);
    if (unreadSinceMatch) return { criteria: { seen: false, since: new Date(unreadSinceMatch[1]) } };
    // UNREAD FROM — server-side
    const unreadFromMatch = query.match(/^UNREAD\s+FROM\s+(.+)$/i);
    if (unreadFromMatch) return { criteria: { seen: false, from: unreadFromMatch[1].trim().replace(/^["']|["']$/g, '') } };
    // Default: subject search
    return { criteria: { subject: query } };
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
    const { criteria, toFilter, beforeDate } = parseQuery(query);
    const needsClientFilter = toFilter || beforeDate;
    const accountPromises = accounts.map(async (account) => {
        try {
            const emails = await withConnection(account, async (client) => {
                const lock = await client.getMailboxLock(folder);
                try {
                    // Step 1: server-side search (only criteria the server handles reliably)
                    const allUids = await client.search(criteria, { uid: true });
                    if (!allUids || allUids.length === 0)
                        return [];
                    // Step 2: if client-side filters needed, fetch envelopes in batches
                    let selectedUids;
                    if (needsClientFilter) {
                        const matchingUids = [];
                        const batchSize = 200;
                        for (let i = 0; i < allUids.length; i += batchSize) {
                            const batch = allUids.slice(i, i + batchSize);
                            const envMsgs = await client.fetchAll(batch.join(','), { uid: true, envelope: true }, { uid: true });
                            for (const msg of envMsgs) {
                                if (toFilter) {
                                    const toAddrs = (msg.envelope?.to || [])
                                        .map(a => (a.address || '').toLowerCase())
                                        .join(' ');
                                    if (!toAddrs.includes(toFilter.toLowerCase()))
                                        continue;
                                }
                                if (beforeDate) {
                                    const msgDate = msg.envelope?.date;
                                    if (!msgDate || msgDate >= beforeDate)
                                        continue;
                                }
                                matchingUids.push(msg.uid);
                            }
                        }
                        selectedUids = matchingUids.slice(-limit);
                    }
                    else {
                        selectedUids = allUids.slice(-limit);
                    }
                    if (selectedUids.length === 0)
                        return [];
                    // Step 3: fetch only those specific UIDs
                    const messages = await client.fetchAll(selectedUids, {
                        uid: true,
                        flags: true,
                        envelope: true,
                        bodyStructure: true,
                        source: { start: 0, maxLength: 2048 }
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