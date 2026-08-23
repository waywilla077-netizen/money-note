// Cloudflare Pages Functions - 记账数据 API
// 绑定 D1 数据库：在 Pages 项目设置 → Functions → Bindings 中绑定名为 DB 的 D1 数据库

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

// 自动建表（首次访问时 D1 中尚无表）
async function ensureTable(env) {
  await env.DB.exec(
    'CREATE TABLE IF NOT EXISTS money_data (id TEXT PRIMARY KEY, json_data TEXT NOT NULL, updated_at TEXT NOT NULL)'
  );
}

// 预检请求
export async function onRequestOptions() {
  return new Response(null, { headers: CORS_HEADERS });
}

// 获取数据
export async function onRequestGet(context) {
  const { env } = context;
  try {
    const row = await env.DB.prepare(
      'SELECT json_data, updated_at FROM money_data WHERE id = ?'
    ).bind('main').first();
    if (!row) return jsonResponse({ data: null });
    return jsonResponse({ data: row.json_data, updated_at: row.updated_at });
  } catch (e) {
    if (String(e.message).includes('no such table')) {
      await ensureTable(env);
      return jsonResponse({ data: null });
    }
    return jsonResponse({ error: e.message }, 500);
  }
}

// 保存数据（upsert）
export async function onRequestPost(context) {
  const { env, request } = context;
  try {
    const body = await request.json();
    const jsonData = body.json_data || JSON.stringify(body);
    const updatedAt = new Date().toISOString();

    try {
      await env.DB.prepare(
        `INSERT INTO money_data (id, json_data, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET json_data = excluded.json_data, updated_at = excluded.updated_at`
      ).bind('main', jsonData, updatedAt).run();
    } catch (dbErr) {
      if (String(dbErr.message).includes('no such table')) {
        await ensureTable(env);
        await env.DB.prepare(
          `INSERT INTO money_data (id, json_data, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET json_data = excluded.json_data, updated_at = excluded.updated_at`
        ).bind('main', jsonData, updatedAt).run();
      } else {
        throw dbErr;
      }
    }
    return jsonResponse({ success: true, updated_at: updatedAt });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}
