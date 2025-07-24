const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;
const DB_PATH = path.join(__dirname, 'database.json');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Główna aplikacja
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Pomocnicze funkcje Bazy Danych ---
const readDB = () => JSON.parse(fs.readFileSync(DB_PATH));
const writeDB = (data) => fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));

const ROLES_HIERARCHY = ["Właściciel", "Menager", "Szef Kuchni", "Kucharz", "Pomoc Kuchenna", "Kelner", "Praktykant"];

// === API ===

// NOWA ŚCIEŻKA DO RESETOWANIA GODZIN
app.delete('/api/work/user/:id', (req, res) => {
    const db = readDB();
    const userId = parseInt(req.params.id, 10);
    
    const initialLength = db.workSessions.length;
    db.workSessions = db.workSessions.filter(session => session.userId !== userId);
    
    if (db.workSessions.length < initialLength) {
        writeDB(db);
        res.status(200).json({ message: 'Godziny pracy pracownika zostały zresetowane.' });
    } else {
        res.status(404).json({ message: 'Nie znaleziono godzin pracy dla tego pracownika.' });
    }
});


// --- Reszta API bez zmian ---
// --- Logowanie i Sesje ---
app.post('/api/login', (req, res) => {
    const { login } = req.body;
    const db = readDB();
    const user = db.users.find(u => u.login === login);
    if (user) {
        if (!db.activeSessions.includes(user.login)) {
            db.activeSessions.push(user.login);
            writeDB(db);
        }
        res.json(user);
    } else {
        res.status(401).json({ message: 'Nieprawidłowy login' });
    }
});

app.post('/api/logout', (req, res) => {
    const { login } = req.body;
    const db = readDB();
    db.activeSessions = db.activeSessions.filter(activeLogin => activeLogin !== login);
    writeDB(db);
    res.status(200).json({ message: 'Wylogowano pomyślnie.' });
});

// --- Dane ---
app.get('/api/data', (req, res) => {
    const db = readDB();
    res.json({
        products: db.products,
        categories: db.categories,
        orders: db.orders,
        holidays: db.holidays,
        users: db.users,
        workSessions: db.workSessions,
        activeSessions: db.activeSessions
    });
});

// --- Pracownicy ---
app.post('/api/users', (req, res) => {
    const db = readDB();
    const newUser = req.body;

    if (db.users.some(u => u.login === newUser.login)) {
        return res.status(409).json({ message: 'Ten login jest już zajęty.' });
    }

    newUser.id = Date.now();
    db.users.push(newUser);
    writeDB(db);
    res.status(201).json({ message: 'Pracownik dodany!', users: db.users });
});

app.put('/api/users/:id', (req, res) => {
    const db = readDB();
    const userId = parseInt(req.params.id, 10);
    const updatedData = req.body;

    const userIndex = db.users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
        return res.status(404).json({ message: 'Nie znaleziono pracownika.' });
    }

    db.users[userIndex] = { ...db.users[userIndex], ...updatedData };
    writeDB(db);
    res.status(200).json({ message: 'Dane pracownika zaktualizowane!', user: db.users[userIndex] });
});

// --- Produkty ---
app.post('/api/products', (req, res) => {
    const db = readDB();
    const newProduct = { ...req.body, id: Date.now() };
    db.products.push(newProduct);
    writeDB(db);
    res.status(201).json({ message: 'Produkt dodany!', products: db.products });
});

// --- Zamówienia ---
app.post('/api/orders', (req, res) => {
    const db = readDB();
    const newOrder = { ...req.body, id: Date.now(), date: new Date().toISOString() };
    db.orders.push(newOrder);
    writeDB(db);
    res.status(201).json({ message: 'Zamówienie zostało zapisane w systemie.' });
});

// --- Czas Pracy ---
app.post('/api/work/start', (req, res) => {
    const { userId } = req.body;
    const db = readDB();
    const newSession = {
        id: Date.now(),
        userId: userId,
        startTime: new Date().toISOString(),
        endTime: null,
        totalHours: 0
    };
    db.workSessions.push(newSession);
    writeDB(db);
    res.status(201).json({ message: 'Rozpoczęto pracę.', session: newSession });
});

app.post('/api/work/stop', (req, res) => {
    const { userId, sessionId } = req.body;
    const db = readDB();
    
    const sessionIndex = db.workSessions.findIndex(s => s.id === sessionId && s.userId === userId && !s.endTime);
    if (sessionIndex === -1) {
        return res.status(404).json({ message: "Nie znaleziono aktywnej sesji pracy." });
    }
    
    const session = db.workSessions[sessionIndex];
    session.endTime = new Date().toISOString();
    const start = new Date(session.startTime);
    const end = new Date(session.endTime);
    const diffMs = end - start;
    session.totalHours = diffMs / (1000 * 60 * 60);

    writeDB(db);
    res.status(200).json({ message: 'Zakończono pracę.', session: session });
});


// PRAWIDŁOWA WERSJA NA SERWER:
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`Serwer Milkshake App działa na porcie ${PORT}`);
});
