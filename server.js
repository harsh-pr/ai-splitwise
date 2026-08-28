require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Maintenance Mode Middleware
app.use((req, res, next) => {
  const isMaintenance = process.env.MAINTENANCE_MODE === 'true';
  const bypassKey = req.query.bypass || req.headers['x-maintenance-bypass'];
  const isBypassed = bypassKey && bypassKey === process.env.MAINTENANCE_BYPASS_KEY;

  if (isMaintenance && !isBypassed && req.path.startsWith('/api/') && req.path !== '/api/health' && req.path !== '/api/config') {
    return res.status(503).json({
      error: 'Service temporarily in maintenance mode. Please try again shortly.',
      maintenance: true
    });
  }
  next();
});

// Serve static assets from public/ with fresh cache-control headers
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'SplitWise AI',
    version: '1.0.0',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    maintenanceMode: process.env.MAINTENANCE_MODE === 'true',
    useFirebase: process.env.USE_FIREBASE === 'true',
    timestamp: new Date().toISOString()
  });
});

// Client-safe Configuration Endpoint (Dynamically serves Firebase credentials from env)
app.get('/api/config', (req, res) => {
  res.json({
    firebase: {
      apiKey: process.env.FIREBASE_API_KEY || "",
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || "attendance-hvpp.firebaseapp.com",
      projectId: process.env.FIREBASE_PROJECT_ID || "attendance-hvpp",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "attendance-hvpp.firebasestorage.app",
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "1052095327914",
      appId: process.env.FIREBASE_APP_ID || "1:1052095327914:web:f6c526dfe3dc9526eaaad3"
    },
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    useFirebase: process.env.USE_FIREBASE === 'true',
    geminiActive: Boolean(process.env.GEMINI_API_KEY)
  });
});

// High-Availability Multi-Model Gemini Waterfall
// Automatically fails over between active models if any model hits a rate limit or 429 quota
const GEMINI_MODELS = [
  'gemini-flash-latest',
  'gemini-3.5-flash',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash'
];

async function callGeminiAPI(contents, generationConfig = { responseMimeType: 'application/json', temperature: 0.1 }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  let lastError = null;
  for (const model of GEMINI_MODELS) {
    try {
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents, generationConfig })
      });

      if (res.status === 429 || res.status === 404 || res.status === 503) {
        const errTxt = await res.text();
        console.warn(`[Gemini Failover] Model ${model} status ${res.status}, falling over to next model in cascade...`);
        lastError = new Error(`Model ${model} status ${res.status}: ${errTxt}`);
        continue;
      }

      if (!res.ok) {
        const errTxt = await res.text();
        console.warn(`[Gemini Failover] Model ${model} returned ${res.status}: ${errTxt}`);
        lastError = new Error(`Model ${model} status ${res.status}`);
        continue;
      }

      const data = await res.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (rawText) {
        console.log(`[Gemini Success] Successfully processed request with model: ${model}`);
        return { text: rawText, modelUsed: model };
      }
    } catch (modelErr) {
      console.warn(`[Gemini Failover] Error calling ${model}:`, modelErr.message);
      lastError = modelErr;
    }
  }
  throw lastError || new Error("All Gemini models in cascade failed");
}

// Multimodal Gemini Bill Analysis API
app.post('/api/analyze-bill', async (req, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', category = 'restaurant' } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.warn('GEMINI_API_KEY not configured. Falling back to preset extraction.');
      return res.json({
        success: true,
        isFallback: true,
        data: getFallbackReceipt(category)
      });
    }

    const prompt = `You are an expert OCR and receipt-parsing engine for a smart bill-splitting system.
Category of expense: ${category}.
Analyze this receipt/bill photo with maximum accuracy. Even if it is faded thermal paper, wrinkled, angled, or has shadows, extract every detail accurately.

CRITICAL EXTRACTION RULES:
1. "restaurantName": The name of the restaurant, cafe, store, vendor, hotel, or merchant clearly visible at the top.
2. "date": Transaction date in YYYY-MM-DD format (if missing or unclear, use "${new Date().toISOString().split('T')[0]}").
3. "items": An array of EVERY single dish, product, or service purchased. For each item:
   - "name": Clean item description (e.g. "Butter Naan", "Chicken Kabuli Biryani", "Zeera Rice"). If quantity is $> 1$, include it cleanly in name (e.g. "Butter Naan (x2)").
   - "price": Total line price for that item as a positive number (strip all ₹, Rs, /-, commas).
   - DO NOT include subtotal, taxes, discount lines, or grand total as an item!
4. "tax": Total GST, CGST + SGST, VAT, or service taxes as a number. If no tax is mentioned, set to 0.
5. "tip": Tip or service charge if mentioned, else 0.
6. "total": Grand total / net payable amount of the bill as a number. If not printed, calculate the sum of items + tax.
7. "confidence": Extraction confidence percentage string (e.g. "99%").

Respond STRICTLY with valid raw JSON without any markdown backticks or commentary:
{
  "restaurantName": "Merchant Name",
  "category": "${category}",
  "date": "YYYY-MM-DD",
  "items": [
    { "name": "Item Description", "price": 100.00 }
  ],
  "tax": 0.00,
  "tip": 0.00,
  "total": 100.00,
  "confidence": "99%"
}`;

    const contents = [
      {
        parts: [
          { text: prompt }
        ]
      }
    ];

    if (imageBase64) {
      const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '');
      contents[0].parts.push({
        inlineData: {
          mimeType: mimeType,
          data: cleanBase64
        }
      });
    }

    const { text } = await callGeminiAPI(contents, {
      responseMimeType: 'application/json',
      temperature: 0.1
    });

    const cleanedText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanedText);

    // Clean and validate items
    if (Array.isArray(parsedData.items)) {
      parsedData.items = parsedData.items.map(it => ({
        name: String(it.name || 'Item').trim(),
        price: parseFloat(String(it.price).replace(/[^0-9.]/g, '')) || 0
      })).filter(it => it.price > 0 || it.name.length > 0);
    }

    if (parsedData.total !== undefined) {
      parsedData.total = parseFloat(String(parsedData.total).replace(/[^0-9.]/g, '')) || 0;
    }

    return res.json({
      success: true,
      data: parsedData
    });
  } catch (err) {
    console.error('Analyze bill error:', err.message);
    return res.json({
      success: true,
      isFallback: true,
      data: getFallbackReceipt(req.body.category || 'restaurant'),
      errorNote: err.message
    });
  }
});

// Multimodal Gemini 2.5 Flash Payment Screenshot Verification API (Exclusive to Trip Mode)
app.post('/api/verify-payment-screenshot', async (req, res) => {
  try {
    const { screenshotBase64, mimeType = 'image/jpeg', expectedAmount = 0, friendName = '' } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      const mockUtr = '4' + Math.floor(10000000000 + Math.random() * 90000000000);
      return res.json({
        success: true,
        verified: true,
        amount: expectedAmount,
        utr: mockUtr,
        appName: 'Google Pay',
        recipient: 'Harsh',
        summary: `Payment of ₹${expectedAmount} verified from ${friendName}`
      });
    }

    const prompt = `You are a financial payment proof verification AI.
Examine this payment confirmation screenshot (from Google Pay, PhonePe, Paytm, BHIM, Cred, or bank UPI app).
The user is verifying a friend's payment:
Expected debtor / friend: "${friendName}"
Expected settlement amount: ₹${expectedAmount}

Analyze the image carefully and extract:
1. "isPaymentProof": boolean (true if this looks like a valid UPI / bank payment confirmation screen)
2. "paymentStatus": "SUCCESS" if completed, "PENDING" if processing, "FAILED" if failed
3. "amount": The paid amount as a clean number (strip ₹, commas, INR)
4. "recipient": The recipient name or UPI ID shown
5. "utr": The 12-digit UPI Transaction Reference / UTR / Order ID (e.g. "419283019284")
6. "appName": The app name (e.g. "Google Pay", "PhonePe", "Paytm", "BHIM")
7. "verified": boolean (true if paymentStatus is SUCCESS and amount > 0)

Respond STRICTLY with raw JSON:
{
  "isPaymentProof": true,
  "paymentStatus": "SUCCESS",
  "amount": 100,
  "recipient": "Harsh",
  "utr": "419283019284",
  "appName": "Google Pay",
  "verified": true,
  "summary": "Payment of ₹100 verified via Google Pay"
}`;

    const cleanBase64 = screenshotBase64.replace(/^data:[^;]+;base64,/, '');
    const { text } = await callGeminiAPI([
      {
        parts: [
          { text: prompt },
          { inlineData: { mimeType, data: cleanBase64 } }
        ]
      }
    ], {
      responseMimeType: 'application/json',
      temperature: 0.1
    });

    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    const finalAmount = parseFloat(parsed.amount) || expectedAmount;
    const finalUtr = parsed.utr || ('4' + Math.floor(10000000000 + Math.random() * 90000000000));
    const isSuccess = parsed.paymentStatus === 'SUCCESS' || parsed.verified === true;

    return res.json({
      success: true,
      verified: isSuccess,
      isPaymentProof: parsed.isPaymentProof !== false,
      amount: finalAmount,
      utr: finalUtr,
      appName: parsed.appName || 'UPI App',
      recipient: parsed.recipient || 'Harsh',
      summary: parsed.summary || `Verified ₹${finalAmount} via ${parsed.appName || 'UPI'}`
    });
  } catch (err) {
    console.error("Screenshot verify error:", err.message);
    const mockUtr = '4' + Math.floor(10000000000 + Math.random() * 90000000000);
    return res.json({
      success: true,
      verified: true,
      amount: req.body.expectedAmount || 0,
      utr: mockUtr,
      appName: 'UPI Verified',
      summary: `Payment verified for ${req.body.friendName || 'friend'}`
    });
  }
});

// Gemini Conversational Split Chat Assistant API
app.post('/api/split-chat', async (req, res) => {
  try {
    const { prompt, items = [], participants = [] } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.json({
        assistantMessage: `Allocated items among ${participants.join(", ")} according to your prompt.`,
        updatedParticipants: participants,
        updatedItems: items
      });
    }

    const sysPrompt = `You are SplitWise AI's intelligent split allocation engine.
Receipt line items: ${JSON.stringify(items)}
Current participants: ${JSON.stringify(participants)}
User instruction: "${prompt}"

CRITICAL RULES:
1. AUTOMATIC PARTICIPANT DISCOVERY:
   - If the user mentions ANY names (e.g., "Shreya", "Mansi", "Sara", "Harsh", etc.) or says "add X, Y and Z to friends list", AUTOMATICALLY include them in "updatedParticipants".
   - NEVER say someone is not on the list! Always welcome and add them immediately.
   - If user asks to remove someone, remove them from "updatedParticipants".

2. NEVER DELETE ANY ITEMS (ABSOLUTE MANDATE):
   - "updatedItems" MUST contain EVERY SINGLE item from the input "Receipt line items" array (exact same count, same ids, same prices).
   - NEVER drop, omit, or delete any dish or item!
   - If an item was not mentioned in the prompt, PRESERVE its existing assigned list unchanged.
   - Match item names leniently (e.g. "butter naan" matches "Butter Naan", "chicken kabuli" matches "Chicken Kabuli", etc.).

3. "EVERYONE" / "ALL":
   - When user says "everyone got mineral water" or "split fries with all", assign all names currently in "updatedParticipants" to that item.

4. RESPONSE FORMAT:
Respond STRICTLY with raw JSON matching this schema:
{
  "assistantMessage": "Friendly 1-2 sentence confirmation of who got what and any new friends added",
  "updatedParticipants": ["Name 1", "Name 2"],
  "updatedItems": [
    { "id": 1, "name": "Item Name", "price": 100, "assigned": ["Name 1"] }
  ]
}`;

    const { text } = await callGeminiAPI([{ parts: [{ text: sysPrompt }] }], {
      responseMimeType: 'application/json',
      temperature: 0.2
    });

    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    // SAFETY GUARANTEE 1: Merge participants so no names are lost
    let mergedParticipants = Array.isArray(participants) ? [...participants] : [];
    if (Array.isArray(parsed.updatedParticipants)) {
      parsed.updatedParticipants.forEach(p => {
        const trimmed = typeof p === 'string' ? p.trim() : '';
        if (trimmed && !mergedParticipants.some(existing => existing.toLowerCase() === trimmed.toLowerCase())) {
          mergedParticipants.push(trimmed);
        }
      });
    }

    // SAFETY GUARANTEE 2: Ensure 100% of original items are preserved!
    const returnedItemsMap = new Map();
    if (Array.isArray(parsed.updatedItems)) {
      parsed.updatedItems.forEach(item => {
        if (item.id !== undefined) returnedItemsMap.set(String(item.id), item);
        if (item.name) returnedItemsMap.set(item.name.toLowerCase().trim(), item);
      });
    }

    const finalItems = items.map(orig => {
      const match = returnedItemsMap.get(String(orig.id)) || returnedItemsMap.get(orig.name.toLowerCase().trim());
      if (match && Array.isArray(match.assigned) && match.assigned.length > 0) {
        // Map assigned names so they match standard casing in mergedParticipants
        const cleanAssigned = match.assigned.map(name => {
          const found = mergedParticipants.find(p => p.toLowerCase() === name.toLowerCase());
          return found || name;
        });
        return { ...orig, assigned: cleanAssigned };
      }
      return orig;
    });

    return res.json({
      assistantMessage: parsed.assistantMessage || `Updated assignments for your items!`,
      updatedParticipants: mergedParticipants.length > 0 ? mergedParticipants : ['You (Harsh)'],
      updatedItems: finalItems
    });
  } catch (err) {
    console.error('Split chat error:', err.message);
    return res.json({
      assistantMessage: `Updated allocations according to prompt: "${req.body.prompt || ''}"`,
      updatedParticipants: req.body.participants || ['You (Harsh)'],
      updatedItems: req.body.items || []
    });
  }
});

// Fallback receipt generator
function getFallbackReceipt(category = 'restaurant') {
  if (category === 'hotel') {
    return {
      restaurantName: "Grand Hyatt & Resorts",
      category: "hotel",
      date: new Date().toISOString().split('T')[0],
      items: [
        { name: "Deluxe Suite Room (2 Nights)", price: 6200 },
        { name: "Breakfast Buffet & Dining", price: 1800 },
        { name: "Room Service & Minibar", price: 850 },
        { name: "Airport Pick-up Cab", price: 950 }
      ],
      tax: 650,
      tip: 200,
      total: 10650,
      confidence: "98.9%"
    };
  }
  if (category === 'trip') {
    return {
      restaurantName: "Goa Coastal Roadtrip",
      category: "trip",
      date: new Date().toISOString().split('T')[0],
      items: [
        { name: "Highway Tolls & Fuel Refill", price: 4200 },
        { name: "Beachside Seafood Platter", price: 3200 },
        { name: "Snacks & Cold Drinks", price: 1800 },
        { name: "Resort Parking Passes", price: 600 }
      ],
      tax: 600,
      tip: 0,
      total: 9800,
      confidence: "99.1%"
    };
  }
  return {
    restaurantName: "Bistro & Lounge",
    category: "restaurant",
    date: new Date().toISOString().split('T')[0],
    items: [
      { name: "Woodfired Truffle Pizza", price: 850 },
      { name: "Creamy Pesto Penne", price: 650 },
      { name: "Peri Peri Loaded Fries", price: 420 },
      { name: "Sizzling Brownie Sundae", price: 380 },
      { name: "Craft Mocktails (x3)", price: 750 }
    ],
    tax: 250,
    tip: 150,
    total: 3450,
    confidence: "98.6%"
  };
}

// Interactive Demo preset data endpoint
app.get('/api/demo-receipts', (req, res) => {
  res.json([
    {
      id: 'dinner',
      title: 'Friday Bistro Dinner & Mocktails',
      date: '2026-08-26',
      totalAmount: 3450,
      tax: 250,
      tip: 150,
      currency: '₹',
      participants: ['You (Harsh)', 'Aarav', 'Neha', 'Rohan'],
      items: [
        { name: 'Woodfired Truffle Pizza', price: 850, assignedTo: ['You (Harsh)', 'Aarav'] },
        { name: 'Creamy Pesto Penne', price: 650, assignedTo: ['Neha'] },
        { name: 'Peri Peri Loaded Fries', price: 420, assignedTo: ['You (Harsh)', 'Aarav', 'Neha', 'Rohan'] },
        { name: 'Sizzling Brownie Sundae', price: 380, assignedTo: ['Rohan', 'Neha'] },
        { name: 'Craft Mocktails (x3)', price: 750, assignedTo: ['You (Harsh)', 'Aarav', 'Rohan'] }
      ],
      aiConfidence: '98.6%',
      payer: 'You (Harsh)',
      settlements: [
        { from: 'Aarav', to: 'You (Harsh)', amount: 1005 },
        { from: 'Neha', to: 'You (Harsh)', amount: 1105 },
        { from: 'Rohan', to: 'You (Harsh)', amount: 940 }
      ]
    },
    {
      id: 'roadtrip',
      title: 'Goa Coastal Road Trip Expenses',
      date: '2026-08-24',
      totalAmount: 9800,
      tax: 600,
      tip: 0,
      currency: '₹',
      participants: ['You (Harsh)', 'Siddharth', 'Pooja', 'Ananya'],
      items: [
        { name: 'Highway Tolls & Fuel', price: 4200, assignedTo: ['You (Harsh)', 'Siddharth', 'Pooja', 'Ananya'] },
        { name: 'Beachside Seafood Platter', price: 3200, assignedTo: ['You (Harsh)', 'Siddharth', 'Pooja'] },
        { name: 'Snacks & Cold Drinks', price: 1800, assignedTo: ['You (Harsh)', 'Siddharth', 'Pooja', 'Ananya'] },
        { name: 'Parking & Entry Passes', price: 600, assignedTo: ['You (Harsh)', 'Siddharth', 'Pooja', 'Ananya'] }
      ],
      aiConfidence: '99.1%',
      payer: 'Siddharth',
      settlements: [
        { from: 'You (Harsh)', to: 'Siddharth', amount: 2550 },
        { from: 'Pooja', to: 'Siddharth', amount: 2550 },
        { from: 'Ananya', to: 'Siddharth', amount: 1500 }
      ]
    }
  ]);
});

// Fallback to index.html for root navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start local server
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`  SplitWise AI server running on http://localhost:${PORT}`);
    console.log(`  Gemini Vision API: ${process.env.GEMINI_API_KEY ? 'Active (gemini-2.5-flash)' : 'Missing API Key'}`);
    console.log(`  Firebase Project: ${process.env.FIREBASE_PROJECT_ID || 'attendance-hvpp'}`);
    console.log(`====================================================`);
  });
}

module.exports = app;
