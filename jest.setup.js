import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// jsdom no trae las APIs de fetch, pero desde jsdom 22 sí trae `Headers` y
// `FormData` reales. Cada global se rellena por separado a propósito: un guard
// único sobre `Request` pisaba el `Headers` bueno con un stub sin métodos, y
// @supabase/postgrest-js llama `headers.set()` en `.single()`.
if (typeof globalThis.Headers === 'undefined') {
  global.Headers = class Headers {
    constructor(init) { this._h = new Map(Object.entries(init ?? {})); }
    set(k, v) { this._h.set(String(k).toLowerCase(), String(v)); }
    get(k) { return this._h.get(String(k).toLowerCase()) ?? null; }
    has(k) { return this._h.has(String(k).toLowerCase()); }
    delete(k) { this._h.delete(String(k).toLowerCase()); }
    append(k, v) { this.set(k, v); }
    forEach(fn) { this._h.forEach((v, k) => fn(v, k, this)); }
  };
}

if (typeof globalThis.Request === 'undefined') {
  global.Request = class Request {};
}

if (typeof globalThis.Response === 'undefined') {
  global.Response = class Response {
    constructor(body = null, init = {}) {
      this.body = body;
      this.status = init.status ?? 200;
      this.ok = this.status >= 200 && this.status < 300;
      this.headers = new Headers(init.headers);
    }
    async text() { return typeof this.body === 'string' ? this.body : ''; }
    async json() { return this.body ? JSON.parse(await this.text()) : null; }
  };
}

if (typeof globalThis.fetch === 'undefined') {
  // Ningún test debe salir a la red. Devuelve una respuesta vacía y bien
  // formada para que el cliente de Supabase la sepa parsear.
  global.fetch = () => Promise.resolve(new Response('[]', {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
}
