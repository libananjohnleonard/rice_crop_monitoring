# Rice Monitoring - PostgreSQL Setup

## 1. Create the schema

Run the schema against your `rice_monitoring` database:

```powershell
psql -U postgres -d rice_monitoring -f schema.sql
```

Adjust `-U postgres` if you use a different username.

## 2. Configure the API server

Copy the example env file and edit with your PostgreSQL credentials:

```powershell
copy server\.env.example server\.env
```

Edit `server/.env`:

```
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/rice_monitoring
```

Replace `your_password` with your actual PostgreSQL password.

## 3. Install dependencies

```powershell
# Root (frontend)
npm install

# API server
cd server
npm install
cd ..
```

## 4. Run the app

**Terminal 1 – API server**

```powershell
cd server
npm start
```

**Terminal 2 – Frontend**

```powershell
npm run dev
```

Open http://localhost:5173. The frontend proxies `/api` to the backend.
