"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.crypto = void 0;

// Metro can choke on direct aliases to hoisted package files outside projectRoot.
// Keep the shim local and match noble's browser export shape.
exports.crypto =
  typeof globalThis === "object" && "crypto" in globalThis ? globalThis.crypto : undefined;
