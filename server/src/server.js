import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { FeedbackStore } from './feedbackStore.js';
import { RoomManager, catalogVersion } from './roomManager.js';
import { MULTIPLAYER_MODES, MULTIPLAYER_PROTOCOL_VERSION } from '../../web/src/services/multiplayerRules.js';

const host = process.env.HOST ?? '127.0.0.1';
const port = Number(process.env.PORT ?? 3000);
const startedAt = new Date().toISOString();
const productionOrigins = String(process.env.FRONTEND_ORIGIN ?? 'https://luo-yi-ba.pages.dev,https://www.bilibili.com,https://www.bilibilitoy.com')
  .split(',').map((value) => value.trim()).filter(Boolean);
const rooms = new RoomManager({ dataDirectory: process.env.DATA_DIRECTORY ?? path.resolve('data/rooms') });
await rooms.initialize();
const feedback = new FeedbackStore({ filePath: process.env.FEEDBACK_DATA_FILE ?? path.resolve('data/feedback.json') });
await feedback.initialize();
const feedbackAdminPassword = String(process.env.FEEDBACK_ADMIN_PASSWORD ?? '');
const adminSessions = new Map();
const ADMIN_SESSION_MS = 7 * 24 * 60 * 60 * 1000;

const testPage = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>阿里云香港联机测试</title><style>:root{font-family:system-ui,-apple-system,"Microsoft YaHei",sans-serif;background:#edf8ff;color:#17364a}body{min-height:100vh;display:grid;place-items:center;margin:0;padding:20px;box-sizing:border-box}main{width:min(620px,100%);padding:28px;border:1px solid #cce7f5;border-radius:24px;background:#fff;box-shadow:0 20px 60px #2c78951c}h1{margin:0 0 8px;font-size:clamp(28px,6vw,44px)}p{color:#607d90;line-height:1.7}dl{display:grid;gap:10px;margin:24px 0}dl div{display:flex;justify-content:space-between;gap:20px;padding:14px 16px;border-radius:14px;background:#f2f9fc}dt{font-weight:700}dd{margin:0;font-weight:900}.ok{color:#168650}.bad{color:#b33d4b}button{width:100%;min-height:48px;border:0;border-radius:13px;background:#6754cc;color:#fff;font:inherit;font-weight:800;cursor:pointer}small{display:block;margin-top:14px;color:#7891a1;text-align:center}</style></head><body><main><h1>阿里云香港联机测试</h1><p>此页面测试从当前网络到多人服务器的 HTTP 与 WebSocket 连接。</p><dl><div><dt>HTTP 健康检查</dt><dd id="http">测试中…</dd></div><div><dt>WebSocket 连接</dt><dd id="socket">测试中…</dd></div><div><dt>连接与回声总耗时</dt><dd id="latency">—</dd></div></dl><button id="retry">重新测试</button><small>服务器：阿里云香港 · ${startedAt}</small></main><script>const show=(id,text,ok)=>{const item=document.getElementById(id);item.textContent=text;item.className=ok?'ok':'bad'};async function test(){show('http','测试中…',true);show('socket','测试中…',true);document.getElementById('latency').textContent='—';try{const t=performance.now();const response=await fetch('/health',{cache:'no-store'});if(!response.ok)throw new Error('HTTP '+response.status);show('http',Math.round(performance.now()-t)+' ms',true)}catch(error){show('http','失败：'+error.message,false)}const t=performance.now();const protocol=location.protocol==='https:'?'wss:':'ws:';const socket=new WebSocket(protocol+'//'+location.host+'/socket-test');const timeout=setTimeout(()=>{show('socket','连接超时',false);socket.close()},10000);socket.onmessage=(event)=>{const message=JSON.parse(event.data);if(message.type==='hello'){socket.send('browser-connectivity-check');return}if(message.type==='echo'){clearTimeout(timeout);show('socket','连接正常',true);show('latency',Math.round(performance.now()-t)+' ms',true);socket.close()}};socket.onerror=()=>{clearTimeout(timeout);show('socket','连接失败',false);show('latency','—',false)}}document.getElementById('retry').addEventListener('click',test);test()</script></body></html>`;

function isAllowedOrigin(origin) {
  if (!origin) return true;
  return productionOrigins.includes(origin) || /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/u.test(origin);
}

function corsHeaders(request) {
  const origin = request.headers.origin;
  return origin && isAllowedOrigin(origin) ? { 'access-control-allow-origin': origin, vary: 'Origin' } : {};
}

function json(response, status, value, headers = {}) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  response.end(JSON.stringify(value));
}

function requestIp(request) {
  return String(request.headers['x-forwarded-for'] ?? request.socket.remoteAddress ?? 'unknown').split(',').at(-1).trim();
}

function constantTimeEqual(left, right) {
  const first = Buffer.from(String(left));
  const second = Buffer.from(String(right));
  return first.length === second.length && timingSafeEqual(first, second);
}

function requireFeedbackAdmin(request) {
  const token = String(request.headers.authorization ?? '').replace(/^Bearer\s+/iu, '');
  const expiresAt = adminSessions.get(token);
  if (!token || !expiresAt || expiresAt <= Date.now()) {
    if (token) adminSessions.delete(token);
    throw Object.assign(new Error('管理员登录已失效'), { status: 401 });
  }
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw Object.assign(new Error('请求内容过大'), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('请求格式无效'), { status: 400 }); }
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  const cors = corsHeaders(request);
  try {
    if (!isAllowedOrigin(request.headers.origin)) return json(response, 403, { error: '不允许的来源' });
    if (request.method === 'OPTIONS') {
      response.writeHead(204, { ...cors, 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS', 'access-control-allow-headers': 'content-type,authorization', 'access-control-max-age': '86400' });
      return response.end();
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(response, 200, { status: 'ok', service: 'luo-yi-ba-multiplayer', region: 'aliyun-hongkong', protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, catalogVersion, modes: MULTIPLAYER_MODES, startedAt, uptimeSeconds: Math.floor(process.uptime()), rooms: rooms.rooms.size });
    }
    if (request.method === 'GET' && url.pathname === '/api/catalog') {
      return json(response, 200, { catalogVersion, protocolVersion: MULTIPLAYER_PROTOCOL_VERSION, modes: MULTIPLAYER_MODES }, cors);
    }
    if (request.method === 'GET' && url.pathname === '/api/feedback') {
      return json(response, 200, { items: feedback.listPublic({ limit: url.searchParams.get('limit') }) }, cors);
    }
    if (request.method === 'POST' && url.pathname === '/api/feedback') {
      const item = await feedback.create(await readJson(request), { ip: requestIp(request) });
      return json(response, 201, { item }, cors);
    }
    if (request.method === 'POST' && url.pathname === '/api/feedback/admin/login') {
      const { password } = await readJson(request);
      if (!feedbackAdminPassword || !constantTimeEqual(password, feedbackAdminPassword)) {
        return json(response, 401, { error: '管理员密码错误或服务端尚未配置密码' }, cors);
      }
      const token = randomBytes(32).toString('base64url');
      adminSessions.set(token, Date.now() + ADMIN_SESSION_MS);
      return json(response, 200, { token, expiresInSeconds: ADMIN_SESSION_MS / 1000 }, cors);
    }
    if (request.method === 'GET' && url.pathname === '/api/feedback/admin') {
      requireFeedbackAdmin(request);
      return json(response, 200, { items: feedback.listAdmin({ status: url.searchParams.get('status'), limit: url.searchParams.get('limit') }), counts: feedback.counts() }, cors);
    }
    const feedbackAdminMatch = url.pathname.match(/^\/api\/feedback\/admin\/([0-9a-f-]+)$/iu);
    if (request.method === 'PATCH' && feedbackAdminMatch) {
      requireFeedbackAdmin(request);
      const { status } = await readJson(request);
      return json(response, 200, { item: await feedback.updateStatus(feedbackAdminMatch[1], status), counts: feedback.counts() }, cors);
    }
    if (request.method === 'POST' && url.pathname === '/api/rooms') {
      const input = rooms.validateCreate(await readJson(request));
      return json(response, 200, await rooms.create(input), cors);
    }
    const match = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/(join)$/u);
    if (request.method === 'POST' && match) {
      const room = rooms.get(match[1]);
      if (!room) return json(response, 404, { error: '房间不存在或已过期' }, cors);
      const input = await readJson(request);
      return json(response, 200, await room.run(() => room.join(input)), cors);
    }
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/test')) {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self' ws: wss:", 'x-content-type-options': 'nosniff' });
      return response.end(testPage);
    }
    return json(response, 404, { error: '接口不存在' }, cors);
  } catch (error) {
    console.error(error);
    return json(response, error.status ?? 500, { error: error.status ? error.message : '服务器内部错误' }, cors);
  }
});

const sockets = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

function rejectUpgrade(socket, status, message) {
  const body = JSON.stringify({ error: message });
  socket.write(`HTTP/1.1 ${status} Error\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`);
  socket.destroy();
}

server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  if (!isAllowedOrigin(request.headers.origin)) return rejectUpgrade(socket, 403, '不允许的来源');
  if (url.pathname === '/socket-test') {
    return sockets.handleUpgrade(request, socket, head, (webSocket) => {
      webSocket.send(JSON.stringify({ type: 'hello', message: 'Connected to Aliyun Hong Kong WebSocket server.' }));
      webSocket.on('message', (data, isBinary) => {
        if (isBinary) return webSocket.close(1003, 'Binary messages are not supported');
        webSocket.send(JSON.stringify({ type: 'echo', message: data.toString() }));
      });
    });
  }
  const match = url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{6})\/socket$/u);
  if (!match) return rejectUpgrade(socket, 404, '接口不存在');
  const room = rooms.get(match[1]);
  if (!room) return rejectUpgrade(socket, 404, '房间不存在或已过期');
  const token = url.searchParams.get('token');
  if (!room.playerForToken(token)) return rejectUpgrade(socket, 401, '恢复凭据无效');
  sockets.handleUpgrade(request, socket, head, (webSocket) => {
    room.run(async () => {
      await room.connect(token, webSocket);
      webSocket.on('message', (data, isBinary) => {
        if (isBinary) return webSocket.close(1003, 'Binary messages are not supported');
        let message;
        try { message = JSON.parse(data.toString()); }
        catch { return room.sendError(webSocket, '消息格式无效'); }
        room.run(() => room.command(webSocket, message)).catch((error) => { console.error(error); room.sendError(webSocket, '服务器内部错误'); });
      });
      webSocket.once('close', () => room.run(() => room.disconnect(webSocket)).catch(console.error));
    }).catch((error) => { console.error(error); webSocket.close(1011, 'Connection failed'); });
  });
});

server.listen(port, host, () => console.log(`Multiplayer server listening on http://${host}:${port}`));

function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  for (const socket of sockets.clients) socket.close(1001, 'Server shutting down');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
