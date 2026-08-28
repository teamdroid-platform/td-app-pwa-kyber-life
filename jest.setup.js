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

// jsdom (26.x) no implementa PointerEvent ni las APIs de captura de puntero
// (https://github.com/jsdom/jsdom/issues/2527), y Radix UI (dropdown-menu,
// select, popover, etc.) abre y cierra sus triggers escuchando pointerdown,
// no click. Sin este polyfill, fireEvent.pointerDown recibe un Event plano
// sin `button`/`ctrlKey` y Radix nunca abre el panel en los tests.
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEvent extends MouseEvent {
    constructor(type, params = {}) {
      super(type, params);
      this.pointerId = params.pointerId ?? 0;
      this.pointerType = params.pointerType ?? 'mouse';
      this.isPrimary = params.isPrimary ?? true;
    }
  }
  global.PointerEvent = PointerEvent;
}

if (typeof Element !== 'undefined') {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
  }
  if (!Element.prototype.setPointerCapture) {
    Element.prototype.setPointerCapture = () => {};
  }
  if (!Element.prototype.releasePointerCapture) {
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
}
