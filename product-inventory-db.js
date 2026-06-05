/**
 * ProductInventoryDB — offline-first IndexedDB storage for reviewing sessions.
 * Primary persistence layer with lightweight localStorage backup pointers.
 */
(function (global) {
  "use strict";

  const DB_NAME = "ProductInventoryDB";
  const DB_VERSION = 1;
  const STORES = {
    sessions: "sessions",
    settings: "settings",
    barcodeMappings: "barcodeMappings",
    savedOperations: "savedOperations",
  };

  const LEGACY_SESSION_KEYS = [
    "excelData",
    "scannedProducts",
    "remainingProducts",
    "remainingNotes",
    "browseModeScannedProducts",
    "editedBarcodes",
    "fileName",
  ];

  let db = null;
  let initPromise = null;
  let writeChain = Promise.resolve();
  let statusCallback = null;

  function generateSessionId() {
    return "session_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  }

  function formatTime(date) {
    const pad = (n) => String(n).padStart(2, "0");
    return pad(date.getHours()) + ":" + pad(date.getMinutes()) + ":" + pad(date.getSeconds());
  }

  function notifyStatus(status, timeStr) {
    if (typeof statusCallback === "function") {
      statusCallback(status, timeStr);
    }
  }

  function normalizeBarcodeValue(barcode) {
    if (barcode == null) return "";
    return String(barcode).trim().replace(/\s+/g, "");
  }

  function normalizeRow(row) {
    if (!Array.isArray(row)) return [];
    return row.map((cell) =>
      cell === null || cell === undefined ? "" : String(cell).trim()
    );
  }

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const database = event.target.result;
        if (!database.objectStoreNames.contains(STORES.sessions)) {
          const sessionStore = database.createObjectStore(STORES.sessions, {
            keyPath: "sessionId",
          });
          sessionStore.createIndex("updatedAt", "updatedAt", { unique: false });
          sessionStore.createIndex("isActive", "isActive", { unique: false });
        }
        if (!database.objectStoreNames.contains(STORES.settings)) {
          database.createObjectStore(STORES.settings, { keyPath: "key" });
        }
        if (!database.objectStoreNames.contains(STORES.barcodeMappings)) {
          database.createObjectStore(STORES.barcodeMappings, { keyPath: "key" });
        }
        if (!database.objectStoreNames.contains(STORES.savedOperations)) {
          const opStore = database.createObjectStore(STORES.savedOperations, {
            keyPath: "id",
          });
          opStore.createIndex("timestamp", "timestamp", { unique: false });
        }
      };

      request.onsuccess = (event) => {
        db = event.target.result;
        db.onerror = (err) => {
          console.error("IndexedDB error:", err);
        };
        resolve(db);
      };

      request.onerror = (event) => {
        console.error("Failed to open IndexedDB:", event.target.error);
        reject(event.target.error);
      };
    });
  }

  function tx(storeNames, mode) {
    return db.transaction(storeNames, mode);
  }

  function promisifyRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function getSetting(key) {
    const transaction = tx([STORES.settings], "readonly");
    return promisifyRequest(transaction.objectStore(STORES.settings).get(key));
  }

  function putSetting(key, value) {
    return enqueueWrite(() => {
      const transaction = tx([STORES.settings], "readwrite");
      return promisifyRequest(
        transaction.objectStore(STORES.settings).put({ key, value })
      );
    });
  }

  function enqueueWrite(fn) {
    const run = writeChain.then(fn);
    writeChain = run.catch((err) => {
      console.error("IndexedDB write queue error:", err);
    });
    return run;
  }

  function writeBackupPointer(sessionId, updatedAt) {
    try {
      localStorage.setItem(
        "backup_" + sessionId,
        JSON.stringify({ sessionId, updatedAt })
      );
    } catch (err) {
      console.warn("localStorage backup pointer failed:", err);
    }
  }

  function removeLegacySessionKeys() {
    LEGACY_SESSION_KEYS.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch (_) { /* ignore */ }
    });
  }

  function validateSession(session) {
    const errors = [];
    if (!session || typeof session !== "object") {
      return { valid: false, session: null, errors: ["Session is null or invalid"] };
    }

    const cleaned = {
      sessionId: session.sessionId || generateSessionId(),
      orderName: session.orderName || session.fileName || "Product Inventory",
      createdAt: session.createdAt || Date.now(),
      updatedAt: session.updatedAt || Date.now(),
      excelData: Array.isArray(session.excelData) ? session.excelData : [],
      scannedProducts: Array.isArray(session.scannedProducts)
        ? session.scannedProducts
        : [],
      remainingProducts: Array.isArray(session.remainingProducts)
        ? session.remainingProducts
        : [],
      browseModeScannedProducts: Array.isArray(session.browseModeScannedProducts)
        ? session.browseModeScannedProducts
        : [],
      remainingNotes:
        session.remainingNotes && typeof session.remainingNotes === "object"
          ? session.remainingNotes
          : {},
      barcodeMappings: Array.isArray(session.barcodeMappings)
        ? session.barcodeMappings
        : [],
      statistics: session.statistics || {},
      settings: session.settings || {},
      isActive: session.isActive !== false,
    };

    if (typeof cleaned.excelData === "string") {
      try {
        cleaned.excelData = JSON.parse(cleaned.excelData);
      } catch (e) {
        errors.push("excelData parse failed");
        cleaned.excelData = [];
      }
    }

    if (typeof cleaned.scannedProducts === "string") {
      try {
        cleaned.scannedProducts = JSON.parse(cleaned.scannedProducts);
      } catch (e) {
        errors.push("scannedProducts parse failed");
        cleaned.scannedProducts = [];
      }
    }

    if (typeof cleaned.remainingProducts === "string") {
      try {
        cleaned.remainingProducts = JSON.parse(cleaned.remainingProducts);
      } catch (e) {
        errors.push("remainingProducts parse failed");
        cleaned.remainingProducts = [];
      }
    }

    cleaned.excelData = cleaned.excelData.map(normalizeRow);

    const seenBarcodes = new Set();
    const dedupedScanned = [];
    cleaned.scannedProducts.forEach((item) => {
      if (!item || typeof item !== "object") return;
      const norm = normalizeBarcodeValue(item.barcode);
      if (!norm || seenBarcodes.has(norm)) return;
      seenBarcodes.add(norm);
      dedupedScanned.push({
        ...item,
        barcode: norm,
        data: Array.isArray(item.data) ? item.data.map((c) => String(c ?? "")) : [],
      });
    });
    cleaned.scannedProducts = dedupedScanned;

    cleaned.remainingProducts = cleaned.remainingProducts.map(normalizeRow);

    const totalProducts =
      cleaned.excelData.length > 1 ? cleaned.excelData.length - 1 : 0;

    if (totalProducts > 0) {
      const combinedCount =
        cleaned.scannedProducts.length + cleaned.remainingProducts.length;

      if (combinedCount !== totalProducts) {
        const scannedRowKeys = new Set(
          cleaned.scannedProducts.map((sp) => JSON.stringify(normalizeRow(sp.data)))
        );
        cleaned.browseModeScannedProducts.forEach((sp) => {
          scannedRowKeys.add(JSON.stringify(normalizeRow(sp.data || sp)));
        });

        cleaned.remainingProducts = cleaned.excelData
          .slice(1)
          .map(normalizeRow)
          .filter((row) => !scannedRowKeys.has(JSON.stringify(row)));

        errors.push(
          "Product count mismatch — remainingProducts recomputed from excelData"
        );
      }
    }

    cleaned.statistics = {
      totalProducts,
      scannedCount: cleaned.scannedProducts.length,
      remainingCount: cleaned.remainingProducts.length,
    };

    const mappingSet = new Set();
    cleaned.barcodeMappings = cleaned.barcodeMappings.filter((entry) => {
      if (!Array.isArray(entry) || entry.length < 2) return false;
      const key = String(entry[0]).trim();
      if (!key || mappingSet.has(key)) return false;
      mappingSet.add(key);
      return true;
    });

    return {
      valid: errors.length === 0 || cleaned.excelData.length > 0,
      session: cleaned,
      errors,
    };
  }

  async function init() {
    if (db) return db;
    if (initPromise) return initPromise;
    initPromise = openDatabase();
    return initPromise;
  }

  async function migrateFromLocalStorage() {
    await init();

    const migrationDone = await getSetting("migrationComplete");
    if (migrationDone && migrationDone.value === true) {
      return false;
    }

    const rawExcel = localStorage.getItem("excelData");
    if (!rawExcel || rawExcel === "[]") {
      await putSetting("migrationComplete", true);
      return false;
    }

    let excelData = [];
    try {
      excelData = JSON.parse(rawExcel);
    } catch (e) {
      console.error("Migration: failed to parse excelData", e);
      await putSetting("migrationComplete", true);
      return false;
    }

    if (!Array.isArray(excelData) || excelData.length === 0) {
      await putSetting("migrationComplete", true);
      return false;
    }

    const sessionId = generateSessionId();
    const now = Date.now();

    let scannedProducts = [];
    let remainingProducts = [];
    let remainingNotes = {};
    let browseModeScannedProducts = [];
    let barcodeMappings = [];

    try {
      scannedProducts = JSON.parse(localStorage.getItem("scannedProducts") || "[]");
    } catch (_) { /* ignore */ }
    try {
      remainingProducts = JSON.parse(
        localStorage.getItem("remainingProducts") || "[]"
      );
    } catch (_) { /* ignore */ }
    try {
      remainingNotes = JSON.parse(localStorage.getItem("remainingNotes") || "{}");
    } catch (_) { /* ignore */ }
    try {
      browseModeScannedProducts = JSON.parse(
        localStorage.getItem("browseModeScannedProducts") || "[]"
      );
    } catch (_) { /* ignore */ }
    try {
      barcodeMappings = JSON.parse(localStorage.getItem("editedBarcodes") || "[]");
    } catch (_) { /* ignore */ }

    const session = {
      sessionId,
      orderName: localStorage.getItem("fileName") || "Product Inventory",
      createdAt: now,
      updatedAt: now,
      excelData,
      scannedProducts,
      remainingProducts,
      browseModeScannedProducts,
      remainingNotes,
      barcodeMappings,
      isActive: true,
    };

    const validated = validateSession(session);
    await saveSession(validated.session, { skipStatus: true });
    await putSetting("activeSessionId", sessionId);
    await putSetting("migrationComplete", true);

    removeLegacySessionKeys();
    console.log("Session migrated from localStorage:", sessionId);
    return true;
  }

  async function saveSession(session, options = {}) {
    await init();

    const validated = validateSession(session);
    if (!validated.session) {
      throw new Error("Invalid session data: " + validated.errors.join(", "));
    }

    const record = validated.session;
    record.updatedAt = Date.now();
    record.isActive = record.isActive !== false;

    if (!options.skipStatus) notifyStatus("saving");

    return enqueueWrite(async () => {
      const transaction = tx(
        [STORES.sessions, STORES.settings, STORES.barcodeMappings],
        "readwrite"
      );

      await promisifyRequest(
        transaction.objectStore(STORES.sessions).put(record)
      );

      if (record.barcodeMappings && record.barcodeMappings.length > 0) {
        await promisifyRequest(
          transaction.objectStore(STORES.barcodeMappings).put({
            key: "global",
            mappings: record.barcodeMappings,
            updatedAt: record.updatedAt,
          })
        );
      }

      if (record.settings && Object.keys(record.settings).length > 0) {
        await promisifyRequest(
          transaction.objectStore(STORES.settings).put({
            key: "columnVisibility",
            value: record.settings,
          })
        );
      }

      await promisifyRequest(
        transaction.objectStore(STORES.settings).put({
          key: "activeSessionId",
          value: record.sessionId,
        })
      );

      if (record.excelData && record.excelData.length > 0) {
        await promisifyRequest(
          transaction.objectStore(STORES.settings).put({
            key: "sessionCleared",
            value: false,
          })
        );
      }

      writeBackupPointer(record.sessionId, record.updatedAt);

      console.log("Session saved:", record.sessionId);
      console.log("IndexedDB write successful");

      if (!options.skipStatus) {
        notifyStatus("saved", formatTime(new Date(record.updatedAt)));
      }

      return record;
    });
  }

  async function getSession(sessionId) {
    await init();
    const transaction = tx([STORES.sessions], "readonly");
    const raw = await promisifyRequest(
      transaction.objectStore(STORES.sessions).get(sessionId)
    );
    if (!raw) return null;
    const validated = validateSession(raw);
    return validated.session;
  }

  async function getActiveSessionId() {
    const row = await getSetting("activeSessionId");
    return row ? row.value : null;
  }

  async function getActiveSession() {
    await init();
    const activeId = await getActiveSessionId();
    if (activeId) {
      const session = await getSession(activeId);
      if (session && session.isActive && session.excelData && session.excelData.length > 0) {
        return session;
      }
    }
    return getLatestActiveSession();
  }

  async function getLatestActiveSession() {
    await init();
    return new Promise((resolve, reject) => {
      const transaction = tx([STORES.sessions], "readonly");
      const store = transaction.objectStore(STORES.sessions);
      const index = store.index("updatedAt");
      const request = index.openCursor(null, "prev");

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const value = cursor.value;
          if (
            value.isActive !== false &&
            value.excelData &&
            value.excelData.length > 0
          ) {
            const validated = validateSession(value);
            resolve(validated.session);
            return;
          }
          cursor.continue();
        } else {
          resolve(null);
        }
      };

      request.onerror = () => reject(request.error);
    });
  }

  async function recoverLatestSession() {
    const session = await getLatestActiveSession();
    if (session) {
      console.log("Session restored:", session.sessionId);
    }
    return session;
  }

  function clearBackupPointers() {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("backup_")) {
          localStorage.removeItem(key);
        }
      });
    } catch (_) { /* ignore */ }
  }

  async function clearActiveSession() {
    await clearAllSessions();
  }

  async function isSessionCleared() {
    const row = await getSetting("sessionCleared");
    return !!(row && row.value === true);
  }

  async function markSessionCleared() {
    await putSetting("sessionCleared", true);
    await putSetting("sessionClearedAt", Date.now());
  }

  async function clearSessionClearedFlag() {
    await putSetting("sessionCleared", false);
  }

  async function clearAllSessions() {
    await init();
    await enqueueWrite(() => {
      return new Promise((resolve, reject) => {
        const transaction = tx([STORES.sessions], "readwrite");
        const store = transaction.objectStore(STORES.sessions);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
    await putSetting("activeSessionId", null);
    await markSessionCleared();
    removeLegacySessionKeys();
    clearBackupPointers();
  }

  async function saveBarcodeMappings(mappings) {
    await init();
    const entries = Array.isArray(mappings) ? mappings : [];
    return enqueueWrite(() => {
      const transaction = tx([STORES.barcodeMappings], "readwrite");
      return promisifyRequest(
        transaction.objectStore(STORES.barcodeMappings).put({
          key: "global",
          mappings: entries,
          updatedAt: Date.now(),
        })
      );
    });
  }

  async function getBarcodeMappings() {
    await init();
    const transaction = tx([STORES.barcodeMappings], "readonly");
    const row = await promisifyRequest(
      transaction.objectStore(STORES.barcodeMappings).get("global")
    );
    return row && Array.isArray(row.mappings) ? row.mappings : [];
  }

  async function saveSavedOperation(operation) {
    await init();
    const op = {
      id: operation.id || "op_" + Date.now(),
      ...operation,
      timestamp: operation.timestamp || Date.now(),
    };
    return enqueueWrite(() => {
      const transaction = tx([STORES.savedOperations], "readwrite");
      return promisifyRequest(transaction.objectStore(STORES.savedOperations).put(op));
    });
  }

  async function flushPendingWrites() {
    await writeChain;
  }

  async function importOperation(op) {
    await init();

    let excelData = op.excelData;
    if (typeof excelData === "string") {
      try {
        excelData = JSON.parse(excelData);
      } catch (e) {
        excelData = [];
      }
    }

    let scannedProducts = op.scannedProducts;
    if (typeof scannedProducts === "string") {
      try {
        scannedProducts = JSON.parse(scannedProducts);
      } catch (e) {
        scannedProducts = [];
      }
    }

    let remainingProducts = op.remainingProducts;
    if (typeof remainingProducts === "string") {
      try {
        remainingProducts = JSON.parse(remainingProducts);
      } catch (e) {
        remainingProducts = [];
      }
    }

    let remainingNotes = op.remainingNotes;
    if (typeof remainingNotes === "string") {
      try {
        remainingNotes = JSON.parse(remainingNotes);
      } catch (e) {
        remainingNotes = {};
      }
    }

    let barcodeMappings = [];
    if (op.editedBarcodes) {
      try {
        barcodeMappings =
          typeof op.editedBarcodes === "string"
            ? JSON.parse(op.editedBarcodes)
            : op.editedBarcodes;
      } catch (e) {
        barcodeMappings = [];
      }
    }

    if (Array.isArray(scannedProducts)) {
      scannedProducts.forEach((item) => {
        item.source = item.source || "scan";
      });
    }

    const sessionId = generateSessionId();
    const now = Date.now();

    const session = {
      sessionId,
      orderName: op.operationName || op.fileName || "Imported Operation",
      createdAt: now,
      updatedAt: now,
      excelData: excelData || [],
      scannedProducts: scannedProducts || [],
      remainingProducts: remainingProducts || [],
      browseModeScannedProducts: [],
      remainingNotes: remainingNotes || {},
      barcodeMappings,
      isActive: true,
    };

    const validated = validateSession(session);
    await saveSession(validated.session);
    removeLegacySessionKeys();
    console.log("Session restored:", sessionId);
    return validated.session;
  }

  async function importSessionData(importedSession) {
    const sessionId = generateSessionId();
    const now = Date.now();

    const session = {
      sessionId,
      orderName: importedSession.fileName || "Imported_Session",
      createdAt: now,
      updatedAt: now,
      excelData: importedSession.excelData || [],
      scannedProducts: importedSession.scannedProducts || [],
      remainingProducts: importedSession.remainingProducts || [],
      browseModeScannedProducts: [],
      remainingNotes: importedSession.remainingNotes || {},
      barcodeMappings: importedSession.editedBarcodes || [],
      settings: importedSession.settings || {},
      isActive: true,
    };

    const validated = validateSession(session);
    await saveSession(validated.session);
    removeLegacySessionKeys();
    return validated.session;
  }

  function hasLegacyLocalStorageSession() {
    const raw = localStorage.getItem("excelData");
    return !!(raw && raw !== "[]");
  }

  global.ProductInventoryDB = {
    init,
    migrateFromLocalStorage,
    saveSession,
    getSession,
    getActiveSession,
    getActiveSessionId,
    getLatestActiveSession,
    recoverLatestSession,
    clearActiveSession,
    clearAllSessions,
    isSessionCleared,
    markSessionCleared,
    clearSessionClearedFlag,
    saveBarcodeMappings,
    getBarcodeMappings,
    saveSavedOperation,
    importOperation,
    importSessionData,
    validateSession,
    flushPendingWrites,
    generateSessionId,
    setSaveStatusCallback(fn) {
      statusCallback = fn;
    },
    hasLegacyLocalStorageSession,
    removeLegacySessionKeys,
  };
})(window);
