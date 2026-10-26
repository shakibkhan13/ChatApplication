
import { pool } from "../../config/database";

export async function getMessages(
  conversationId: string,
  userId: string,
  cursor?: string,
  requestedLimit = 30
) {
  const limit = Math.min(Math.max(requestedLimit, 1), 100);

  const membership = await pool.query(
    `SELECT 1 FROM conversation_members
     WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId]
  );

  if (membership.rowCount === 0) {
    throw Object.assign(new Error("Conversation access denied"), {
      statusCode: 403,
    });
  }

  if (cursor && !/^\d+$/.test(cursor)) {
    throw Object.assign(new Error("Invalid cursor"), {
      statusCode: 400,
    });
  }

  const result = await pool.query(
    `SELECT id::text AS id,
            conversation_id,
            sender_id,
            client_msg_id,
            body,
            type,
            reply_to_id::text AS reply_to_id,
            attachment_url,
            edited_at,
            deleted_at,
            created_at
     FROM messages
     WHERE conversation_id = $1
       AND ($2::bigint IS NULL OR id < $2::bigint)
     ORDER BY id DESC
     LIMIT $3`,
    [conversationId, cursor || null, limit + 1]
  );

  const hasMore = result.rows.length > limit;
  const items = result.rows.slice(0, limit);

  return {
    items: items.reverse(),
    nextCursor: hasMore ? items[0]?.id ?? null : null,
    hasMore,
  };
}
