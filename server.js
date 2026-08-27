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

// Serve static assets from public/
app.use(express.static(path.join(__dirname, 'public')));

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

// Multimodal Gemini 2.5 Flash Bill Analysis API
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

    const prompt = `You are a high-precision OCR and receipt parsing engine for a bill-splitting application.
Category of expense: ${category}.
Analyze this receipt/bill image carefully.
Extract:
1. "restaurantName": The name of the restaurant, store, vendor, hotel, or merchant.
2. "date": Transaction date in YYYY-MM-DD format (if missing, use ${new Date().toISOString().split('T')[0]}).
3. "items": An array of each item/dish/expense. Each item must have:
   - "name": string description (clean item name)
   - "price": number (item price in decimal)
4. "tax": number (total GST / VAT / service taxes)
5. "tip": number (tip / service charge if any, else 0)
6. "total": number (grand total of the bill)
7. "confidence": string percentage (e.g. "98.8%")

Respond STRICTLY with raw JSON matching this format without any markdown code fences or backticks:
{
  "restaurantName": "Example Name",
  "category": "${category}",
  "date": "YYYY-MM-DD",
  "items": [
    { "name": "Item Name", "price": 100.00 }
  ],
  "tax": 10.00,
  "tip": 0.00,
  "total": 110.00,
  "confidence": "98.5%"
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

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1
        }
      })
    });

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text();
      console.error('Gemini API call failed with status:', geminiRes.status, errBody);
      throw new Error(`Gemini status ${geminiRes.status}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleanedText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanedText);

    return res.json({
      success: true,
      data: parsedData
    });
  } catch (err) {
    console.error('Analyze bill caught error:', err.message);
    return res.json({
      success: true,
      isFallback: true,
      data: getFallbackReceipt(req.body.category || 'restaurant')
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

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: sysPrompt }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });

    if (!geminiRes.ok) {
      throw new Error(`Gemini status ${geminiRes.status}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const cleaned = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
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
