const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const admin = require('firebase-admin');
// Initialize Firebase Admin SDK if using Firestore
if (process.env.USE_FIREBASE === 'true') {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  var db = admin.firestore();
}
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET; if (!JWT_SECRET) { console.error('Missing JWT_SECRET env variable'); process.exit(1); }

// Create data directories and database files only if not using Firebase (local development)
const dataDir = path.join(__dirname, 'data');
const uploadsDir = path.join(dataDir, 'uploads');
const USERS_FILE = path.join(dataDir, 'users.json');
const HISTORY_FILE = path.join(dataDir, 'history.json');
const CONFIG_FILE = path.join(dataDir, 'config.json');

if (process.env.USE_FIREBASE !== 'true') {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([]));
  }
  if (!fs.existsSync(HISTORY_FILE)) {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([]));
  }
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({}));
  }
}

// Helper functions for file DB operations
// Unified data access: file system (default) or Firestore (when USE_FIREBASE=true)
async function readJSON(file) {
  if (process.env.USE_FIREBASE === 'true') {
    // Map file paths to Firestore collections
    const colMap = {
      [USERS_FILE]: 'users',
      [HISTORY_FILE]: 'history',
      [CONFIG_FILE]: 'config'
    };
    const collection = colMap[file];
    if (!collection) return [];
    const snapshot = await db.collection(collection).get();
    const docs = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      data.id = doc.id;
      docs.push(data);
    });
    return docs;
  } else {
    try {
      const data = fs.readFileSync(file, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.error(`Error reading ${file}:`, e);
      return [];
    }
  }
}

async function writeJSON(file, data) {
  if (process.env.USE_FIREBASE === 'true') {
    const colMap = {
      [USERS_FILE]: 'users',
      [HISTORY_FILE]: 'history',
      [CONFIG_FILE]: 'config'
    };
    const collection = colMap[file];
    if (!collection) return false;
    const batch = db.batch();
    // Clear existing docs in the collection
    const existing = await db.collection(collection).listDocuments();
    existing.forEach(docRef => batch.delete(docRef));
    // Add new docs
    data.forEach(item => {
      const docRef = db.collection(collection).doc(item.id || undefined);
      batch.set(docRef, item);
    });
    await batch.commit();
    return true;
  } else {
    try {
      fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error(`Error writing ${file}:`, e);
      return false;
    }
  }
}

function standardizeDate(dateStr) {
  if (!dateStr) return 'Unavailable';
  
  dateStr = dateStr.trim();
  
  // If it matches unknown or unavailable variations
  if (/unknown|unavailable|none|n\/a/i.test(dateStr)) {
    return 'Unavailable';
  }
  
  // Standard format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Match DD-MM-YYYY, MM/DD/YYYY, etc.
  const parts = dateStr.split(/[-/.]/);
  if (parts.length === 3) {
    let day, month, year;
    
    if (parts[0].length === 4) {
      // YYYY-MM-DD or YYYY-DD-MM
      year = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      const p2 = parseInt(parts[2], 10);
      if (p1 > 12) {
        day = p1;
        month = p2;
      } else {
        month = p1;
        day = p2;
      }
    } else if (parts[2].length === 4) {
      // DD-MM-YYYY or MM-DD-YYYY
      year = parseInt(parts[2], 10);
      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      if (p0 > 12) {
        day = p0;
        month = p1;
      } else if (p1 > 12) {
        month = p0;
        day = p1;
      } else {
        // Ambiguous. Default to DD-MM-YYYY (most common in non-US standard)
        day = p0;
        month = p1;
      }
    } else if (parts[2].length === 2) {
      // 2 digit year
      const year2Digit = parseInt(parts[2], 10);
      year = year2Digit + (year2Digit > 50 ? 1900 : 2000);
      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      day = p0;
      month = p1;
    }
    
    if (year && month && day) {
      const y = year.toString();
      const m = month.toString().padStart(2, '0');
      const d = day.toString().padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  
  // Final fallback
  try {
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
  } catch (e) {}
  
  return 'Unavailable';
}

// Use memory storage to process files without saving them to the server disk
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadsDir));

// Authentication Middleware
function authenticate(req, res, next) {
  const token = req.cookies.session_token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.clearCookie('session_token');
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }
}

// Auth API endpoints
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Missing registration details' });
  }

  const users = await readJSON(USERS_FILE);
  if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: 'User already exists with this email' });
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      id: 'usr_' + Math.random().toString(36).substr(2, 9),
      email: email.toLowerCase(),
      name,
      passwordHash,
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    await writeJSON(USERS_FILE, users);

    const token = jwt.sign({ id: newUser.id, email: newUser.email, name: newUser.name }, JWT_SECRET, { expiresIn: '7d' });
    
    // Set secure HttpOnly cookie
    res.cookie('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.json({ id: newUser.id, email: newUser.email, name: newUser.name });
  } catch (err) {
    return res.status(500).json({ error: 'Server error during registration' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const users = await readJSON(USERS_FILE);
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user || !user.passwordHash) {
    return res.status(400).json({ error: 'Invalid email or password' });
  }

  try {
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    return res.json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    return res.status(500).json({ error: 'Server error during login' });
  }
});


app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('session_token');
  return res.json({ success: true });
});

app.get('/api/auth/config', (req, res) => {
  return res.json({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    firebaseConfig: {
      apiKey: process.env.FIREBASE_API_KEY || process.env.VITE_FIREBASE_API_KEY || null,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || process.env.VITE_FIREBASE_AUTH_DOMAIN || null,
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || null,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || process.env.VITE_FIREBASE_STORAGE_BUCKET || null,
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || null,
      appId: process.env.FIREBASE_APP_ID || process.env.VITE_FIREBASE_APP_ID || null
    }
  });
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    const users = await readJSON(USERS_FILE);
    const user = users.find(u => u.id === req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      googleId: user.googleId || null,
      googleEmail: user.googleEmail || null
    });
  } catch (err) {
    return res.status(500).json({ error: 'Server error retrieving profile' });
  }
});

app.post('/api/auth/google', async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'Firebase ID Token is required' });
  }

  let decodedToken;
  try {
    if (process.env.USE_FIREBASE === 'true' && admin.apps.length > 0) {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } else {
      // Local development fallback: decode JWT without signature verification
      decodedToken = jwt.decode(idToken);
      if (!decodedToken) {
        return res.status(400).json({ error: 'Invalid ID Token format' });
      }
      decodedToken.uid = decodedToken.user_id || decodedToken.sub || 'usr_mock_' + Math.random().toString(36).substr(2, 9);
    }
  } catch (err) {
    console.error('Firebase token verification error:', err);
    return res.status(401).json({ error: 'Unauthorized: Invalid Firebase ID token' });
  }

  const googleId = decodedToken.uid;
  const email = decodedToken.email;
  const name = decodedToken.name || decodedToken.email.split('@')[0];

  if (!email || !googleId) {
    return res.status(400).json({ error: 'Invalid token payload' });
  }

  try {
    const users = await readJSON(USERS_FILE);
    // Find user by Firebase UID/Google ID or Email
    let user = users.find(u => u.googleId === googleId);
    if (!user) {
      user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (user) {
        user.googleId = googleId;
        await writeJSON(USERS_FILE, users);
      } else {
        user = {
          id: 'usr_' + Math.random().toString(36).substr(2, 9),
          email: email.toLowerCase(),
          name: name,
          googleId: googleId,
          createdAt: new Date().toISOString()
        };
        users.push(user);
        await writeJSON(USERS_FILE, users);
      }
    }

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' || req.headers['x-forwarded-proto'] === 'https',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return res.json({ id: user.id, email: user.email, name: user.name, googleId: user.googleId });
  } catch (err) {
    return res.status(500).json({ error: 'Server error during Firebase login' });
  }
});

app.post('/api/auth/link-google', authenticate, async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'Firebase ID Token is required' });
  }

  let decodedToken;
  try {
    if (process.env.USE_FIREBASE === 'true' && admin.apps.length > 0) {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } else {
      decodedToken = jwt.decode(idToken);
      if (!decodedToken) {
        return res.status(400).json({ error: 'Invalid ID Token format' });
      }
      decodedToken.uid = decodedToken.user_id || decodedToken.sub || 'usr_linked_123';
    }
  } catch (err) {
    console.error('Firebase token verification error:', err);
    return res.status(401).json({ error: 'Unauthorized: Invalid Firebase ID token' });
  }

  const googleId = decodedToken.uid;
  const email = decodedToken.email;

  try {
    const users = await readJSON(USERS_FILE);
    // Check if this Google account is already linked to ANOTHER user
    const otherLinkedUser = users.find(u => u.googleId === googleId && u.id !== req.user.id);
    if (otherLinkedUser) {
      return res.status(400).json({ error: 'This Google account is already linked to another Splitwise AI user' });
    }

    const user = users.find(u => u.id === req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.googleId = googleId;
    user.googleEmail = email;
    await writeJSON(USERS_FILE, users);

    return res.json({ success: true, googleId: user.googleId, googleEmail: user.googleEmail });
  } catch (err) {
    return res.status(500).json({ error: 'Server error linking Google account' });
  }
});



// Bill Analysis API using Gemini
app.post('/api/analyze-bill', authenticate, upload.single('billImage'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  const relativeImagePath = '';

  // Custom API key configuration: Use the user's hardcoded key by default
  const apiKey = process.env.GEMINI_API_KEY; if (!apiKey) { console.log('No GEMINI_API_KEY found, running receipt mockup extraction'); /* fallback handling below */ }

  if (!apiKey) {
    console.log('No GEMINI_API_KEY found, running receipt mockup extraction');
    // Return high quality mock extraction when API key is missing
    const mockData = getMockReceiptData();
    mockData.imagePath = relativeImagePath;
    return res.json({ ...mockData, isMock: true });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    // Use gemini-2.5-flash as default, fallback to gemini-1.5-flash
    let model;
    try {
      model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json' }
      });
    } catch (e) {
      model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        generationConfig: { responseMimeType: 'application/json' }
      });
    }

    const imageHelper = {
      inlineData: {
        data: req.file.buffer.toString('base64'),
        mimeType: req.file.mimetype
      }
    };

    const prompt = `Analyze this restaurant receipt image and extract the following details. 
    You must format your response strictly as a JSON object with this exact structure:
    {
      "restaurantName": "Name of the restaurant or shop (string)",
      "date": "Date of transaction in YYYY-MM-DD format. Look for formats like DD-MM-YYYY, MM/DD/YYYY, DD/MM/YY, etc. and standardize to YYYY-MM-DD (string, if not readable use current date)",
      "items": [
        { "name": "Item description (string)", "price": 0.00 (number) }
      ],
      "tax": 0.00 (number, total tax / GST / VAT amount),
      "tip": 0.00 (number, service charge or tip amount),
      "total": 0.00 (number, grand total billing amount)
    }
    Double check item names and ensure prices are parsed as floating-point numbers. Include individual food items and drinks. Do not group them unless they are grouped on the receipt. Ensure response contains ONLY the raw JSON block without markdown formatting or code block wrappers.`;

    const result = await model.generateContent([prompt, imageHelper]);

    const responseText = result.response.text();
    const extractedData = JSON.parse(responseText.trim());

    // Validate structure and format
    const validatedData = {
      restaurantName: extractedData.restaurantName || 'Unknown Restaurant',
      date: standardizeDate(extractedData.date),
      items: Array.isArray(extractedData.items) ? extractedData.items.map(item => ({
        name: item.name || 'Unnamed Item',
        price: parseFloat(item.price) || 0
      })) : [],
      tax: parseFloat(extractedData.tax) || 0,
      tip: parseFloat(extractedData.tip) || 0,
      total: parseFloat(extractedData.total) || 0,
      imagePath: relativeImagePath
    };

    return res.json(validatedData);

  } catch (err) {
    console.error('Gemini API Extraction Error:', err);
    // Return high quality mockup fallback but let user know AI failed
    const mockData = getMockReceiptData();
    mockData.imagePath = relativeImagePath;
    return res.json({ 
      ...mockData, 
      isMock: true, 
      error: 'AI Extraction failed. Showing mock receipt contents. Please review and edit items.' 
    });
  }
});

// Helper for Mock receipts
function getMockReceiptData() {
  const restaurants = [
    { name: 'Bella Italia Ristorante', items: [{ name: 'Margherita Pizza', price: 14.50 }, { name: 'Lasagna Classica', price: 16.90 }, { name: 'Garlic Bread', price: 5.50 }, { name: 'Red Wine (Glass)', price: 8.00 }, { name: 'Tiramisu', price: 7.50 }], tax: 4.60, tip: 6.00 },
    { name: 'Green Garden Bistro', items: [{ name: 'Quinoa Avocado Bowl', price: 12.80 }, { name: 'Crispy Falafel Salad', price: 11.50 }, { name: 'Fresh Orange Juice', price: 4.50 }, { name: 'Vegan Chocolate Cake', price: 6.90 }], tax: 2.85, tip: 4.00 },
    { name: 'Gourmet Burger Kitchen', items: [{ name: 'Classic Beef Burger', price: 13.99 }, { name: 'Sweet Potato Fries', price: 4.50 }, { name: 'Craft IPA Beer', price: 6.50 }, { name: 'Double Cheese Upgrade', price: 2.00 }, { name: 'Chocolate Milkshake', price: 5.99 }], tax: 2.65, tip: 3.50 }
  ];
  const chosen = restaurants[Math.floor(Math.random() * restaurants.length)];
  const date = new Date().toISOString().split('T')[0];
  const subtotal = chosen.items.reduce((acc, item) => acc + item.price, 0);
  const total = parseFloat((subtotal + chosen.tax + chosen.tip).toFixed(2));
  return {
    restaurantName: chosen.name,
    date: date,
    items: chosen.items,
    tax: chosen.tax,
    tip: chosen.tip,
    total: total
  };
}

// History API Endpoints
app.get('/api/history', authenticate, async (req, res) => {
  const history = await readJSON(HISTORY_FILE);
  // Get history for the logged in user, sort by creation date descending, limit to 10
  const userHistory = history
    .filter(entry => entry.userId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10);
  return res.json(userHistory);
});

app.post('/api/history', authenticate, async (req, res) => {
  const newEntry = req.body;
  if (!newEntry.restaurantName || !newEntry.items || !newEntry.people) {
    return res.status(400).json({ error: 'Missing entry details' });
  }

  const history = await readJSON(HISTORY_FILE);
  
  // Format entry
  const entry = {
    id: newEntry.id || 'bill_' + Math.random().toString(36).substr(2, 9),
    userId: req.user.id,
    restaurantName: newEntry.restaurantName,
    splitType: newEntry.splitType || 'Restaurant Bill',
    date: newEntry.date || new Date().toISOString().split('T')[0],
    imagePath: newEntry.imagePath,
    items: newEntry.items,
    tax: parseFloat(newEntry.tax) || 0,
    tip: parseFloat(newEntry.tip) || 0,
    total: parseFloat(newEntry.total) || 0,
    people: newEntry.people,
    itemAssignments: newEntry.itemAssignments,
    splits: newEntry.splits,
    createdAt: newEntry.createdAt || new Date().toISOString()
  };

  // If entry exists (editing), update it. Otherwise push.
  const existingIndex = history.findIndex(h => h.id === entry.id && h.userId === req.user.id);
  if (existingIndex > -1) {
    history[existingIndex] = entry;
  } else {
    history.push(entry);
  }

  await writeJSON(HISTORY_FILE, history);
  return res.json(entry);
});

app.delete('/api/history/:id', authenticate, async (req, res) => {
  const entryId = req.params.id;
  let history = await readJSON(HISTORY_FILE);
  const initialLength = history.length;
  
  // Keep files that don't match or belong to another user
  history = history.filter(entry => !(entry.id === entryId && entry.userId === req.user.id));
  
  if (history.length === initialLength) {
    return res.status(404).json({ error: 'Entry not found' });
  }
  
  await writeJSON(HISTORY_FILE, history);
  return res.json({ success: true });
});

// Migrate existing users to Firebase Authentication on startup
async function migrateUsersToFirebaseAuth() {
  if (process.env.USE_FIREBASE !== 'true') return;
  try {
    const users = await readJSON(USERS_FILE);
    let updated = false;
    for (let user of users) {
      if (!user.email) continue;
      
      try {
        const firebaseUser = await admin.auth().getUserByEmail(user.email);
        if (!user.googleId) {
          user.googleId = firebaseUser.uid;
          updated = true;
          console.log(`[Migration] Linked existing Firebase Auth user ${user.email} to DB profile`);
        }
      } catch (err) {
        if (err.code === 'auth/user-not-found') {
          // Standard Bcrypt hashes are not natively compatible with Firebase Auth imports without complex salt configurations.
          // Let users Register (Sign Up) with their password, which will create the Firebase Auth user,
          // and then match/link them automatically via their email.
        } else {
          console.error(`[Migration] Error checking Firebase user ${user.email}:`, err);
        }
      }
    }

    // Clean up any previously imported unlinked users in Firebase Auth so they can Register cleanly
    for (let user of users) {
      if (user.email && !user.googleId) {
        try {
          const firebaseUser = await admin.auth().getUserByEmail(user.email);
          await admin.auth().deleteUser(firebaseUser.uid);
          console.log(`[Cleanup] Deleted unlinked imported Firebase user ${user.email}`);
        } catch (err) {
          // User not found in Firebase Auth, safe to ignore
        }
      }
    }

    if (updated) {
      await writeJSON(USERS_FILE, users);
    }
  } catch (err) {
    console.error('[Migration] Error during Firebase migration utility:', err);
  }
}

// Run user migration on startup if using Firebase
if (process.env.USE_FIREBASE === 'true') {
  migrateUsersToFirebaseAuth().catch(console.error);
}

// Start the server
// Start server only in local development. Vercel provides its own handler.
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Splitwise AI Server running on http://localhost:${PORT}`);
  });
}
module.exports = app;
