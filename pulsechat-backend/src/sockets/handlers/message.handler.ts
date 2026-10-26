
import type { Server } from "socket.io";
import { z } from "zod";
import { pool } from "../../config/database";
import type { AuthSocket } from "../middleware/auth";

const sendMessageSchema = z.object({
  conversationId: z.string().uuid(),
  clientMsgId: z.string().uuid(),
  body: z.string().trim().min(1).max(10_000),
});

export function registerMessageHandlers(
  io: Server,
  socket: AuthSocket
) {
  const userId = socket.userId!;

  socket.on("conversation:join", async (payload, ack) => {
    const respond = typeof ack === "function" ? ack : () => {};

    try {
      const schema = z.object({
        conversationId: z.string().uuid(),
      });

      const { conversationId } = schema.parse(payload);

      const membership = await pool.query(
        `SELECT 1 FROM conversation_members
         WHERE conversation_id = $1 AND user_id = $2`,
        [conversationId, userId]
      );

      if (membership.rowCount === 0) {
        return respond({
          ok: false,
          error: "Conversation access denied",
        });
      }

      await socket.join(`conv:${conversationId}`);

      respond({ ok: true });
    } catch {
      respond({ ok: false, error: "Invalid request" });
    }
  });

  socket.on("message:send", async (payload, ack) => {
    const respond = typeof ack === "function" ? ack : () => {};

    try {
      const input = sendMessageSchema.parse(payload);

      const membership = await pool.query(
        `SELECT 1 FROM conversation_members
         WHERE conversation_id = $1 AND user_id = $2`,
        [input.conversationId, userId]
      );

      if (membership.rowCount === 0) {
        return respond({
          ok: false,
          error: "Conversation access denied",
        });
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const saved = await client.query(
          `INSERT INTO messages
            (conversation_id, sender_id, client_msg_id, body, type)
           VALUES ($1, $2, $3, $4, 'text')
           ON CONFLICT (conversation_id, sender_id, client_msg_id)
           DO NOTHING
           RETURNING id, conversation_id, sender_id,
                     client_msg_id, body, type, created_at`,
          [
            input.conversationId,
            userId,
            input.clientMsgId,
            input.body,
          ]
        );

        let message = saved.rows[0];

        if (!message) {
          const existing = await client.query(
            `SELECT id, conversation_id, sender_id,
                    client_msg_id, body, type, created_at
             FROM messages
             WHERE conversation_id = $1
               AND sender_id = $2
               AND client_msg_id = $3`,
            [input.conversationId, userId, input.clientMsgId]
          );

          message = existing.rows[0];
        }

        await client.query(
          `UPDATE conversations
           SET last_message_id = $2,
               last_message_at = $3
           WHERE id = $1
             AND (last_message_at IS NULL OR last_message_at <= $3)`,
          [
            input.conversationId,
            message.id,
            message.created_at,
          ]
        );

        await client.query("COMMIT");

        // Emit only after durable database commit.
        io.to(`conv:${input.conversationId}`).emit(
          "message:new",
          message
        );

        respond({ ok: true, message });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return respond({
          ok: false,
          error: "Invalid message payload",
        });
      }

      console.error("message:send failed", error);
      respond({ ok: false, error: "Unable to send message" });
    }
  });
}
