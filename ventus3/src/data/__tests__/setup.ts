// src/data/__tests__/setup.ts
// IndexedDB de mentira para poder testear la capa de datos en Node.
// fake-indexeddb/auto instala indexedDB e IDBKeyRange en globalThis, que es
// exactamente lo que Dexie busca al abrir la base.

import 'fake-indexeddb/auto'
