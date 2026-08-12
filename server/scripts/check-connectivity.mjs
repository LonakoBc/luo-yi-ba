import { WebSocket } from 'ws';

const baseUrl = process.argv[2] ?? 'ws://127.0.0.1/socket-test';
const timeoutMs = 10_000;
const startedAt = performance.now();
const socket = new WebSocket(baseUrl);
const timeout = setTimeout(() => {
  console.error(`Timed out connecting to ${baseUrl}`);
  socket.terminate();
  process.exitCode = 1;
}, timeoutMs);

let receivedHello = false;

socket.on('message', (data) => {
  const message = JSON.parse(data.toString());
  if (message.type === 'hello') {
    receivedHello = true;
    socket.send('hello-from-connectivity-check');
    return;
  }
  if (message.type === 'echo' && message.message === 'hello-from-connectivity-check') {
    clearTimeout(timeout);
    console.log(JSON.stringify({
      status: 'ok',
      url: baseUrl,
      receivedHello,
      roundTripMs: Math.round(performance.now() - startedAt),
    }));
    socket.close(1000, 'Connectivity check complete');
  }
});

socket.on('error', (error) => {
  clearTimeout(timeout);
  console.error(error.message);
  process.exitCode = 1;
});
