import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import * as client from './client.ts';

test('read-only requests use GET, reject HTTP failures and accept abort signals', async () => {
  const server = createServer((req, res) => {
    if (req.method !== 'GET') { res.writeHead(405); res.end(); return; }
    res.setHeader('content-type','application/json');
    if (req.url === '/missing') { res.writeHead(404); res.end(JSON.stringify({ok:false,error:'Ambassador not found'})); return; }
    if (req.url === '/fail') res.writeHead(503);
    res.end(JSON.stringify({ok:true, rows:[]}));
  }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.deepEqual(await client.readJson(`${url}/ok`), {ok:true,rows:[]});
    await assert.rejects(client.readJson(`${url}/fail`), /503/);
    await assert.rejects(client.readJson(`${url}/missing`), error => error.status === 404 && error.responseError === 'Ambassador not found');
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(client.readJson(`${url}/ok`, controller.signal));
  } finally { server.close(); }
});
