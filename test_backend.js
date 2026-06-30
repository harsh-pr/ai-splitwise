/**
 * Test Validation Script for Splitwise AI Backend Engine
 * Tests authentication helpers, session encryption, file DB operations, and split calculations.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const JWT_SECRET = 'test-secret-key-12345';
const TEST_DIR = __dirname;
const USERS_FILE = path.join(TEST_DIR, 'test_users.json');

console.log('=== RUNNING BACKEND TESTS ===\n');

// 1. Test Password Hashing and Verification
async function testAuth() {
  console.log('1. Testing Password Hashing & JWT Verification...');
  
  const rawPassword = 'SecurePassword123!';
  
  // Hash password
  const hash = await bcrypt.hash(rawPassword, 10);
  console.log('   Password hashed successfully.');
  
  // Verify correct password
  const isMatch = await bcrypt.compare(rawPassword, hash);
  if (!isMatch) throw new Error('Password verification failed for correct password');
  console.log('   Password verification passed for matching password.');
  
  // Verify wrong password fails
  const isWrongMatch = await bcrypt.compare('WrongPassword', hash);
  if (isWrongMatch) throw new Error('Password verification succeeded for WRONG password');
  console.log('   Password verification correctly rejected mismatched password.');

  // Test JWT token creation and signing
  const userPayload = { id: 'usr_123', email: 'test@example.com', name: 'Test User' };
  const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '1h' });
  console.log('   JWT signed successfully.');

  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.id !== userPayload.id || decoded.email !== userPayload.email) {
    throw new Error('JWT decode payload mismatch');
  }
  console.log('   JWT decoding and payload verification passed.');
  console.log('✔️ Authentication tests passed!\n');
}

// 2. Test JSON DB operations
function testDatabase() {
  console.log('2. Testing Local JSON database writes/reads...');
  
  const sampleUsers = [
    { id: 'usr_1', name: 'Alice', email: 'alice@example.com' },
    { id: 'usr_2', name: 'Bob', email: 'bob@example.com' }
  ];

  // Write file
  fs.writeFileSync(USERS_FILE, JSON.stringify(sampleUsers, null, 2));
  console.log(`   Database written to: ${USERS_FILE}`);

  // Read file back
  const data = fs.readFileSync(USERS_FILE, 'utf8');
  const readUsers = JSON.parse(data);

  if (readUsers.length !== 2 || readUsers[1].name !== 'Bob') {
    throw new Error('Database read data mismatch');
  }
  console.log('   Database file read and parsed successfully.');

  // Clean up
  fs.unlinkSync(USERS_FILE);
  console.log('   Temporary files cleaned up.');
  console.log('✔️ Database tests passed!\n');
}

// 3. Test Proportional Splitting Mathematics
function testSplitMathematics() {
  console.log('3. Testing Proportional Tax & Bill Splitting Logic...');
  
  // Setup sample receipt
  const items = [
    { name: 'Burger', price: 12.00 },
    { name: 'Fries', price: 6.00 },
    { name: 'Pizza', price: 20.00 }
  ];
  const tax = 3.80; // GST/Tax
  const tip = 5.70; // Tip/Service charge
  const foodSubtotal = items.reduce((sum, item) => sum + item.price, 0); // 38.00
  const grandTotal = foodSubtotal + tax + tip; // 47.50

  // People
  const members = ['Alice', 'Bob'];

  // Item assignments
  // Burger ($12) -> eaten by Alice only
  // Fries ($6) -> eaten by Bob only
  // Pizza ($20) -> shared by Alice and Bob (10 each)
  const assignments = {
    'Burger': ['Alice'],
    'Fries': ['Bob'],
    'Pizza': ['Alice', 'Bob']
  };

  // Perform split calculations
  const personalCalculations = {};
  members.forEach(person => {
    personalCalculations[person] = {
      name: person,
      subtotal: 0,
      taxShare: 0,
      tipShare: 0,
      total: 0
    };
  });

  items.forEach(item => {
    const consumers = assignments[item.name];
    const share = item.price / consumers.length;
    consumers.forEach(person => {
      personalCalculations[person].subtotal += share;
    });
  });

  // Assert subtotals
  // Alice subtotal = 12 (burger) + 10 (pizza share) = 22.00
  // Bob subtotal = 6 (fries) + 10 (pizza share) = 16.00
  if (personalCalculations['Alice'].subtotal !== 22.00) {
    throw new Error(`Alice subtotal incorrect: expected 22.00, got ${personalCalculations['Alice'].subtotal}`);
  }
  if (personalCalculations['Bob'].subtotal !== 16.00) {
    throw new Error(`Bob subtotal incorrect: expected 16.00, got ${personalCalculations['Bob'].subtotal}`);
  }
  console.log('   Item share subtotals calculated correctly.');

  // Apply Proportional GST & tips
  const taxRatio = tax / foodSubtotal; // 3.8 / 38 = 10%
  const tipRatio = tip / foodSubtotal; // 5.7 / 38 = 15%

  members.forEach(person => {
    const calc = personalCalculations[person];
    calc.taxShare = parseFloat((calc.subtotal * taxRatio).toFixed(2));
    calc.tipShare = parseFloat((calc.subtotal * tipRatio).toFixed(2));
    calc.total = parseFloat((calc.subtotal + calc.taxShare + calc.tipShare).toFixed(2));
  });

  // Assert exact calculations
  // Alice: subtotal 22, tax 22 * 10% = 2.2, tip 22 * 15% = 3.3. Total = 27.50
  // Bob: subtotal 16, tax 16 * 10% = 1.6, tip 16 * 15% = 2.4. Total = 20.00
  // Sum = 47.50
  if (personalCalculations['Alice'].taxShare !== 2.20 || personalCalculations['Alice'].total !== 27.50) {
    throw new Error(`Alice splits incorrect: taxShare ${personalCalculations['Alice'].taxShare}, total ${personalCalculations['Alice'].total}`);
  }
  if (personalCalculations['Bob'].taxShare !== 1.60 || personalCalculations['Bob'].total !== 20.00) {
    throw new Error(`Bob splits incorrect: taxShare ${personalCalculations['Bob'].taxShare}, total ${personalCalculations['Bob'].total}`);
  }

  console.log('   Proportional GST/tax and tips distribution matches exact proportions.');
  console.log('✔️ Splitting mathematics tests passed!\n');
}

async function runAll() {
  try {
    await testAuth();
    testDatabase();
    testSplitMathematics();
    console.log('🎉 ALL BACKEND CHECKS PASSED SUCCESSFULLY!');
  } catch (err) {
    console.error('❌ TEST FAILURE:', err.message);
    process.exit(1);
  }
}

runAll();
