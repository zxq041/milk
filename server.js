const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const multer = require('multer');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 50 * 1024 * 1024 } });

let db;

async function connectToDb() {
    if (!DATABASE_URL) {
        console.error("Błąd: Brak zmiennej środowiskowej DATABASE_URL.");
        process.exit(1);
    }
    try {
        const client = new MongoClient(DATABASE_URL);
        await client.connect();
        db = client.db();
        console.log("Pomyślnie połączono z bazą danych MongoDB.");
    } catch (err) {
        console.error("Błąd połączenia z bazą danych:", err);
        process.exit(1);
    }
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// === API ===

app.post('/api/login', async (req, res) => {
    try {
        const { login } = req.body;
        const user = await db.collection('users').findOne({ login });
        if (user) {
            await db.collection('activeSessions').updateOne({}, { $addToSet: { sessions: user.login } }, { upsert: true });
            res.json(user);
        } else {
            res.status(401).json({ message: 'Nieprawidłowy login' });
        }
    } catch (err) {
        res.status(500).json({ message: "Błąd serwera." });
    }
});

app.get('/api/data', async (req, res) => {
    try {
        const [users, products, categories, orders, holidays, workSessions, activeSessionsDoc, reservations] = await Promise.all([
            db.collection('users').find().toArray(),
            db.collection('products').find().toArray(),
            db.collection('categories').find().toArray(),
            db.collection('orders').find().toArray(),
            db.collection('holidays').find().toArray(),
            db.collection('workSessions').find().toArray(),
            db.collection('activeSessions').findOne({}),
            db.collection('reservations').find().toArray()
        ]);
        res.json({ users, products, categories, orders, holidays, workSessions, reservations, activeSessions: activeSessionsDoc?.sessions || [] });
    } catch (err) {
        res.status(500).json({ message: 'Błąd pobierania danych.' });
    }
});

app.get('/api/reservations', async (req, res) => {
    try {
        const { date } = req.query;
        let query = {};
        if (date) {
            query = { date: date };
        }
        const reservations = await db.collection('reservations').find(query).sort({ createdAt: -1 }).toArray();
        res.json(reservations);
    } catch (err) {
        res.status(500).json({ message: 'Błąd pobierania rezerwacji.' });
    }
});

app.delete('/api/reservations/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.collection('reservations').deleteOne({ _id: new ObjectId(id) });
        if(result.deletedCount === 0) return res.status(404).json({ message: "Nie znaleziono rezerwacji." });
        res.status(200).json({ message: 'Rezerwacja została usunięta.' });
    } catch (err) {
        res.status(500).json({ message: "Błąd podczas usuwania rezerwacji." });
    }
});


connectToDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Serwer działa na porcie ${PORT}`);
    });
});
