require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets from public/
app.use(express.static(path.join(__dirname, 'public')));

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'SplitWise AI',
    version: '1.0.0',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString()
  });
});

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
        { name: 'Snacks & Cold Drinks', price: 1200, assignedTo: ['You (Harsh)', 'Siddharth', 'Pooja', 'Ananya'] },
        { name: 'Parking & Entry Passes', price: 600, assignedTo: ['You (Harsh)', 'Siddharth', 'Pooja', 'Ananya'] }
      ],
      aiConfidence: '99.1%',
      payer: 'Siddharth',
      settlements: [
        { from: 'You (Harsh)', to: 'Siddharth', amount: 2470 },
        { from: 'Pooja', to: 'Siddharth', amount: 2470 },
        { from: 'Ananya', to: 'Siddharth', amount: 1500 }
      ]
    }
  ]);
});

// Fallback to index.html for root navigation
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  SplitWise AI server running on http://localhost:${PORT}`);
  console.log(`  Gemini Vision API: ${process.env.GEMINI_API_KEY ? 'Active' : 'Missing API Key'}`);
  console.log(`====================================================`);
});

module.exports = app;
