# Splitwise AI

![GitHub](https://img.shields.io/github/license/harsh-pr/ai-splitwise)
![Node.js](https://img.shields.io/badge/Node.js-18.x-brightgreen)

## Overview

**Splitwise AI** is a lightweight web service that helps users analyse restaurant receipts, extract structured data using Google Gemini, and manage bill‑splitting history. It provides a simple authentication system, an AI‑powered receipt analysis endpoint, and CRUD operations for bill history.

## Table of Contents
- [Features](#features)
- [Demo](#demo)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the Server](#running-the-server)
- [API Endpoints](#api-endpoints)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Features
- **User Authentication** – Register, login, logout using JWT stored in HTTP‑only cookies.
- **Receipt Analysis** – Upload a receipt image; the server calls Google Gemini to return JSON with restaurant name, date, items, tax, tip, and total.
- **Bill History** – Store, retrieve, update and delete past analyses for each authenticated user.
- **Environment‑Based Secrets** – All secrets (`JWT_SECRET`, `GEMINI_API_KEY`) are loaded from environment variables; no secrets are committed to the repository.

## Demo
You can try the API locally after following the installation steps. See the `public/` folder for a simple front‑end that interacts with the back‑end.

## Prerequisites
- **Node.js** ≥ 18 (recommended LTS)
- **npm** (comes with Node.js)
- A **Google Gemini API key** – sign up at https://ai.google.dev/gemini-api

## Installation
```bash
# Clone the repository
git clone https://github.com/harsh-pr/ai-splitwise.git
cd ai-splitwise

# Install dependencies
npm install
```

## Configuration
Create a `.env` file in the project root (it is already ignored by `.gitignore`). Example:
```dotenv
PORT=3000
JWT_SECRET=your‑very‑strong‑jwt‑secret
GEMINI_API_KEY=YOUR_GEMINI_API_KEY
```
> **Important** – never commit the `.env` file. The repository contains a `.gitignore` that excludes it.

## Running the Server
```bash
# Development mode (auto‑restart on changes)
npm run dev   # if a dev script is defined, otherwise:
node server.js
```
The server will start at `http://localhost:3000` (or the port you set).

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register a new user (email, password, name). |
| `POST` | `/api/auth/login` | Login and receive an HTTP‑only session cookie. |
| `POST` | `/api/auth/logout` | Clear the session cookie. |
| `GET`  | `/api/auth/me` | Get the current authenticated user. |
| `POST` | `/api/analyze-bill` | Upload a receipt image (`multipart/form-data`). Returns structured JSON. |
| `GET`  | `/api/history` | Get the latest 10 bill entries for the logged‑in user. |
| `POST` | `/api/history` | Save a new bill entry (or edit an existing one). |
| `DELETE` | `/api/history/:id` | Delete a bill entry by its ID. |

All protected routes require the `session_token` cookie set by the login endpoint.

## Project Structure
```
ai-splitwise/
├─ data/                # JSON “database” files (ignored by Git)
│   ├─ users.json
│   ├─ history.json
│   └─ config.json
├─ public/              # Front‑end assets (HTML/CSS/JS)
├─ server.js            # Express server and API implementation
├─ package.json
├─ .gitignore
└─ README.md            # <-- you are here
```

## Contributing
Contributions are welcome! Please follow these steps:
1. Fork the repository.
2. Create a feature branch (`git checkout -b feature/awesome-feature`).
3. Make your changes, ensuring you add corresponding tests if applicable.
4. Run `npm test` (if tests are defined) and lint the code.
5. Submit a pull request describing your changes.

Remember to keep all secrets out of the code base; add any new files that should be ignored to `.gitignore`.

## License
This project is licensed under the **MIT License** – see the `LICENSE` file for details.
