# SplitWise AI ⚡
> Intelligent Expense Sharing & Multimodal Receipt Splitting (Java College Mini Project)

SplitWise AI is an AI-powered expense splitting and debt optimization platform. It combines Google Gemini Multimodal Vision to automatically read and itemize paper bills and UPI receipts with a Java Greedy Cash-Flow Minimization Engine that simplifies group debts into the minimum possible transfers.

---

## 🌟 Key Features

- **Multimodal AI Receipt Scanner:** Upload receipts or snap photos; Google Gemini extracts items, prices, and taxes.
- **Java Cash-Flow Engine:** Greedy priority-queue algorithm $O(V \log V)$ to collapse complex circular debts into minimal direct payments.
- **Item-Level Assignment:** Easily assign specific items, shared platters, or split equally among select friends.
- **Proportional Taxes & Tips:** Automatically and fairly distributes GST, VAT, and tips based on consumed items.
- **1-Click Live Demo Mode:** Seamless evaluation with preloaded sample receipts for quick demonstrations.

---

## 🏗️ Project Architecture

```
splitwise-ai-app/
├── public/                 # Modern Glassmorphic Frontend
│   ├── index.html          # Semantic Landing Page & App Entry
│   ├── landing.css         # Responsive Dark Theme & Design Tokens
│   └── landing.js          # Interactive Presets, Simulator & Demo Modal
├── src/                    # Java Core Algorithmic Engine
│   └── com/splitwise/
│       └── DebtSimplifier.java # Cash-Flow Minimization Engine
├── server.js               # Node.js / Express Web Server & REST API
├── package.json            # Scripts and Dependencies
└── .env                    # Environment Config & Gemini API Key
```

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js**: v18+ (tested on Node v24)
- **Java**: Java 17+ or Java 25 LTS (`javac` and `java`)

### 2. Installation
```bash
npm install
```

### 3. Run Java Debt Engine Demo
```bash
npm run compile-java
npm run run-java-demo
```

### 4. Start Local Web Server
```bash
npm start
```
Open **`http://localhost:3000`** in your browser to view the landing page and test the interactive simulator.

---

## 🧠 Java Debt Simplification Algorithm

The debt minimization algorithm runs in $O(V \log V)$ where $V$ is the number of participants:
1. Calculates the net balance for each participant ($Net = Received - Paid$).
2. Separates participants into two priority queues: **Debtors** (negative balance) and **Creditors** (positive balance).
3. Greedily matches the maximum debtor with the maximum creditor, settling the minimum of both balances and updating the queues until all balances reach zero.
