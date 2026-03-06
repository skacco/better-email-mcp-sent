/**
 * Send Mega Tool
 * Send new emails, reply, and forward via SMTP
 */
import { resolveSingleAccount } from '../helpers/config.js';
import { EmailMCPError, withErrorHandling } from '../helpers/errors.js';
import { appendToSent, readEmail } from '../helpers/imap-client.js';
import { forwardEmail, replyToEmail, sendNewEmail } from '../helpers/smtp-client.js';
/**
 * Unified send tool - handles all outbound email operations
 */
export async function send(accounts, input) {
    return withErrorHandling(async () => {
        if (!input.account) {
            throw new EmailMCPError('account is required for send operations', 'VALIDATION_ERROR', 'Provide the sender account email address');
        }
        if (!input.body) {
            throw new EmailMCPError('body is required', 'VALIDATION_ERROR', 'Provide the email body text');
        }
        switch (input.action) {
            case 'new':
                return await handleNew(accounts, input);
            case 'reply':
                return await handleReply(accounts, input);
            case 'forward':
                return await handleForward(accounts, input);
            default:
                throw new EmailMCPError(`Unknown action: ${input.action}`, 'VALIDATION_ERROR', 'Supported actions: new, reply, forward');
        }
    })();
}
/**
 * Send a new email
 */
async function handleNew(accounts, input) {
    if (!input.to) {
        throw new EmailMCPError('to is required for new email', 'VALIDATION_ERROR', 'Provide the recipient email address');
    }
    if (!input.subject) {
        throw new EmailMCPError('subject is required for new email', 'VALIDATION_ERROR', 'Provide the email subject');
    }
    const account = resolveSingleAccount(accounts, input.account);
    const result = await sendNewEmail(account, {
        to: input.to,
        subject: input.subject,
        body: input.body,
        cc: input.cc,
        bcc: input.bcc
    });
    // Append to Sent folder
    try {
        const date = new Date().toUTCString();
        const rawMsg = `From: ${account.email}\r\nTo: ${input.to}\r\nSubject: ${input.subject}\r\nDate: ${date}\r\nMessage-ID: ${result.message_id}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${input.body}`;
        await appendToSent(account, rawMsg);
    } catch (e) { console.error('[appendToSent] failed:', e.message); }
    return {
        action: 'new',
        from: account.email,
        to: input.to,
        subject: input.subject,
        ...result
    };
}
/**
 * Reply to an email (maintains thread headers)
 * `to` is optional — defaults to the original sender's address
 */
async function handleReply(accounts, input) {
    if (!input.uid) {
        throw new EmailMCPError('uid is required for reply action', 'VALIDATION_ERROR', 'Provide the UID of the email to reply to (from search/read)');
    }
    const account = resolveSingleAccount(accounts, input.account);
    const folder = input.folder || 'INBOX';
    // Read original email to get threading headers + auto-derive `to`
    const original = await readEmail(account, input.uid, folder);
    // Auto-derive `to` from original sender if not provided
    const replyTo = input.to || original.from;
    if (!replyTo) {
        throw new EmailMCPError('Could not determine reply-to address', 'VALIDATION_ERROR', 'Provide the `to` field explicitly, or ensure the original email has a From address');
    }
    const result = await replyToEmail(account, {
        to: replyTo,
        subject: input.subject || original.subject,
        body: input.body,
        cc: input.cc,
        bcc: input.bcc,
        in_reply_to: original.message_id,
        references: original.references || original.message_id
    });
    // Append to Sent folder
    try {
        const subject = input.subject || `Re: ${original.subject}`;
        const date = new Date().toUTCString();
        const rawMsg = `From: ${account.email}\r\nTo: ${replyTo}\r\nSubject: ${subject}\r\nDate: ${date}\r\nMessage-ID: ${result.message_id}\r\nIn-Reply-To: ${original.message_id}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${input.body}`;
        await appendToSent(account, rawMsg);
    } catch (e) { console.error('[appendToSent] failed:', e.message); }
    return {
        action: 'reply',
        from: account.email,
        to: replyTo,
        subject: input.subject || `Re: ${original.subject}`,
        in_reply_to: original.message_id,
        ...result
    };
}
/**
 * Forward an email
 */
async function handleForward(accounts, input) {
    if (!input.uid) {
        throw new EmailMCPError('uid is required for forward action', 'VALIDATION_ERROR', 'Provide the UID of the email to forward (from search/read)');
    }
    if (!input.to) {
        throw new EmailMCPError('to is required for forward action', 'VALIDATION_ERROR', 'Provide the recipient email address');
    }
    const account = resolveSingleAccount(accounts, input.account);
    const folder = input.folder || 'INBOX';
    // Read original email to include in forward
    const original = await readEmail(account, input.uid, folder);
    const result = await forwardEmail(account, {
        to: input.to,
        subject: input.subject || original.subject,
        body: input.body,
        cc: input.cc,
        bcc: input.bcc,
        original_body: original.body_text
    });
    // Append to Sent folder
    try {
        const subject = input.subject || `Fwd: ${original.subject}`;
        const date = new Date().toUTCString();
        const body = `${input.body}\n\n---------- Forwarded message ----------\n${original.body_text}`;
        const rawMsg = `From: ${account.email}\r\nTo: ${input.to}\r\nSubject: ${subject}\r\nDate: ${date}\r\nMessage-ID: ${result.message_id}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`;
        await appendToSent(account, rawMsg);
    } catch (e) { console.error('[appendToSent] failed:', e.message); }
    return {
        action: 'forward',
        from: account.email,
        to: input.to,
        subject: input.subject || `Fwd: ${original.subject}`,
        ...result
    };
}
//# sourceMappingURL=send.js.map