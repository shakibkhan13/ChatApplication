
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { pool } from "../../config/database";
import { env } from "../../config/env";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createAccessToken(user: { id: string; email: string }) {
  return jwt.sign(
    { email: user.email },
    env.JWT_ACCESS_SECRET,
    {
      subject: user.id,
      expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"],
      issuer: "pulsechat",
      audience: "pulsechat-api",
    }
  );
}

function createRefreshToken() {
  return randomBytes(48).toString("base64url");
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
}) {
  const passwordHash = await bcrypt.hash(input.password, 12);

  try {
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, avatar_url, created_at`,
      [input.name, input.email, passwordHash]
    );

    return result.rows[0];
  } catch (error: any) {
    if (error.code === "23505") {
      throw Object.assign(new Error("Email already registered"), {
        statusCode: 409,
      });
    }
    throw error;
  }
}

export async function login(email: string, password: string) {
  const result = await pool.query(
    `SELECT id, name, email, avatar_url, password_hash
     FROM users WHERE email = $1`,
    [email]
  );

  const user = result.rows[0];

  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw Object.assign(new Error("Invalid email or password"), {
      statusCode: 401,
    });
  }

  const refreshToken = createRefreshToken();
  const expiresAt = new Date(
    Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000
  );

  await pool.query(
    `INSERT INTO refresh_sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, hashToken(refreshToken), expiresAt]
  );

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
    },
    accessToken: createAccessToken(user),
    refreshToken,
  };
}

export async function refresh(refreshToken: string) {
  const client = await pool.connect();
  const replacementToken = createRefreshToken();

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT id, user_id
       FROM refresh_sessions
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [hashToken(refreshToken)]
    );

    const session = result.rows[0];

    if (!session) {
      await client.query("ROLLBACK");
      throw Object.assign(new Error("Invalid refresh token"), {
        statusCode: 401,
      });
    }

    const userResult = await client.query(
      `SELECT id, email FROM users WHERE id = $1`,
      [session.user_id]
    );

    const user = userResult.rows[0];

    if (!user) {
      await client.query("ROLLBACK");
      throw Object.assign(new Error("User not found"), {
        statusCode: 401,
      });
    }

    await client.query(
      `UPDATE refresh_sessions SET revoked_at = NOW()
       WHERE id = $1`,
      [session.id]
    );

    await client.query(
      `INSERT INTO refresh_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 day'))`,
      [user.id, hashToken(replacementToken), env.REFRESH_TOKEN_DAYS]
    );

    await client.query("COMMIT");

    return {
      accessToken: createAccessToken(user),
      refreshToken: replacementToken,
    };
  } catch (error) {
    if (!clientReleased) {
      // Transaction errors are rolled back below when needed.
    }
    throw error;
  } finally {
    client.release();
  }
}

export async function logout(refreshToken: string) {
  await pool.query(
    `UPDATE refresh_sessions SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hashToken(refreshToken)]
  );
}



export async function rotateRefreshToken(refreshToken: string) {
  const client = await pool.connect();
  const nextToken = createRefreshToken();
  let committed = false;

  try {
    await client.query("BEGIN");

    const result = await client.query(
      `SELECT id, user_id
       FROM refresh_sessions
       WHERE token_hash = $1
         AND revoked_at IS NULL
         AND expires_at > NOW()
       FOR UPDATE`,
      [hashToken(refreshToken)]
    );

    const session = result.rows[0];

    if (!session) {
      throw Object.assign(new Error("Invalid refresh token"), {
        statusCode: 401,
      });
    }

    const userResult = await client.query(
      "SELECT id, email FROM users WHERE id = $1",
      [session.user_id]
    );

    const user = userResult.rows[0];

    if (!user) {
      throw Object.assign(new Error("User not found"), {
        statusCode: 401,
      });
    }

    await client.query(
      "UPDATE refresh_sessions SET revoked_at = NOW() WHERE id = $1",
      [session.id]
    );

    await client.query(
      `INSERT INTO refresh_sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + ($3 * INTERVAL '1 day'))`,
      [user.id, hashToken(nextToken), env.REFRESH_TOKEN_DAYS]
    );

    await client.query("COMMIT");
    committed = true;

    return {
      accessToken: createAccessToken(user),
      refreshToken: nextToken,
    };
  } catch (error) {
    if (!committed) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
