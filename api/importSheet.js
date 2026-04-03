const admin = require("firebase-admin");
const { google } = require("googleapis");

if (!admin.apps.length) {
  const serviceAccountRaw = process.env.SERVICE_ACCOUNT_JSON;
  if (!serviceAccountRaw) {
    console.error("SERVICE_ACCOUNT_JSON is not configured in Vercel environment variables.");
  } else {
    const parsed = JSON.parse(serviceAccountRaw);
    if (parsed.private_key && String(parsed.private_key).includes("\\n")) {
      parsed.private_key = String(parsed.private_key).replace(/\\n/g, "\n");
    }
    admin.initializeApp({
      credential: admin.credential.cert(parsed),
    });
  }
}

const SPREADSHEET_ID = "1AmFRDCx8avKX_EWONaRuBxCZ5r0HpAKJaj3l9Vu1Tl0";

async function authenticateAndAuthorize(req, requiredRoles) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    const err = new Error("Missing auth token");
    err.status = 401;
    throw err;
  }
  const idToken = header.slice("Bearer ".length);
  const decoded = await admin.auth().verifyIdToken(idToken);
  const userSnap = await admin.firestore().collection("users").doc(decoded.uid).get();
  if (!userSnap.exists) {
    const err = new Error("User role not found");
    err.status = 403;
    throw err;
  }
  const role = String((userSnap.data() || {}).role || "").toLowerCase();
  if (!requiredRoles.includes(role)) {
    const err = new Error("Insufficient permissions");
    err.status = 403;
    throw err;
  }
  return { uid: decoded.uid, role };
}

module.exports = async (req, res) => {
  // CORS Setup for Vercel
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!admin.apps.length) {
       throw new Error("Firebase Admin not initialized. Check SERVICE_ACCOUNT_JSON.");
    }
    await authenticateAndAuthorize(req, ["admin", "user", "tracker"]);

    const sheetName = (req.body && req.body.sheetName ? String(req.body.sheetName) : "").trim();
    if (!sheetName) {
      return res.status(400).json({ error: "sheetName is required" });
    }

    const serviceAccountRaw = process.env.SERVICE_ACCOUNT_JSON;
    const credentials = JSON.parse(serviceAccountRaw);
    if (credentials.private_key && String(credentials.private_key).includes("\\n")) {
      credentials.private_key = String(credentials.private_key).replace(/\\n/g, "\n");
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheetsApi = google.sheets({ version: "v4", auth });

    const range = `'${sheetName.replace(/'/g, "''")}'`;
    const response = await sheetsApi.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range,
    });
    const values = response.data.values || [];
    if (!Array.isArray(values) || values.length === 0) {
      return res.status(404).json({ error: "Sheet not found or empty" });
    }
    return res.status(200).json({ sheetName, values });
  } catch (err) {
    console.error("importSheet failed", err);
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || "API error" });
  }
};
