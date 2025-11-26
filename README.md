# Femtai Fantasies

React + TypeScript card collection app with Express/Node.js backend. Features browsing, purchasing, profiles, age-gate, and trading.

## Quick Start

### 1. Install Dependencies

From the project root or frontend directory:
```bash
cd frontend
npm install
```

### 2. Start the Backend Server

In one terminal, from the frontend directory:
```bash
cd frontend
npm run server:server
```

The server will start on `http://localhost:3001` and you'll see:
- ✅ Database loaded successfully
- 🚀 Server running on http://localhost:3001
- 📡 API endpoints available at http://localhost:3001/api
- 💚 Health check: http://localhost:3001/health

### 3. Start the Frontend

In another terminal, from the frontend directory:
```bash
cd frontend
npm run server
```

The frontend will start on `http://localhost:5173` (or the next available port).

## Project Structure

```
FemtaiFantasies/
├── frontend/          # React frontend
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── pages/      # Page components
│   │   ├── services/   # API client
│   │   ├── store/      # Zustand state stores
│   │   └── types.ts    # TypeScript types
│   └── package.json
├── server/             # Express backend
│   ├── data/          # Data persistence layer
│   ├── routes/        # API route handlers
│   ├── middleware/    # Express middleware
│   ├── types.ts       # Shared backend types
│   └── index.ts       # Server entry point
└── data/              # JSON data files (created automatically)
    ├── cards.json
    ├── sets.json
    ├── users.json
    └── trades.json
```

## API Endpoints

All endpoints are prefixed with `/api`:

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login

### Cards
- `GET /api/cards` - List all cards
- `GET /api/cards/:id` - Get card by ID

### Sets
- `GET /api/sets` - List all sets
- `GET /api/sets/:id` - Get set by ID

### Profile
- `GET /api/profile/:userId` - Get user profile
- `PUT /api/profile/:userId` - Update profile (requires `x-user-id` header)

### Purchase
- `POST /api/purchase/card/:cardId` - Purchase a card (requires `x-user-id` header)
- `POST /api/purchase/set/:setId` - Purchase a set (requires `x-user-id` header)

### Trade
- `GET /api/trade` - List user's trades (requires `x-user-id` header)
- `POST /api/trade` - Create trade proposal (requires `x-user-id` header)
- `POST /api/trade/:tradeId/respond` - Accept/decline trade (requires `x-user-id` header)

### Health Check
- `GET /health` - Server health check

## Data Persistence

Data is stored in JSON files in the `data/` directory at the project root. The database auto-seeds with sample cards and sets on first run if empty.

## Environment Variables

- `PORT` - Server port (default: 3001)
- `VITE_API_URL` - Frontend API URL (default: http://localhost:3001/api)

## Troubleshooting

### Server won't start
- Make sure you're running `npm run server:server` from the `frontend/` directory
- Check that port 3001 is not already in use
- Verify all dependencies are installed: `npm install`

### Frontend can't connect to backend
- Ensure the backend server is running first
- Check that `VITE_API_URL` in frontend points to the correct backend URL
- Verify CORS settings in `server/index.ts` include your frontend URL

### Database errors
- The `data/` directory will be created automatically
- If you get permission errors, check file/directory permissions
- Try deleting the `data/` directory to reset the database

## Development Notes

- The server uses hot-reload with `tsx watch`
- Frontend uses Vite's hot module replacement
- All routes are logged to the console for debugging
- Error handling includes detailed console logs
