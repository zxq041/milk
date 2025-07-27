const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises; // Używamy fs.promises
const app = express();

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

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
        console.log("Pomyślnie połączono z bazą danych MongoDB na Railway.");
    } catch (err) {
        console.error("Błąd połączenia z bazą danych:", err);
        process.exit(1);
    }
}

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// =================================================================
// == TYMCZASOWA FUNKCJA DO WGRYWANIA DANYCH - KROK 4 ==============
// =================================================================
app.get('/api/seed-database', async (req, res) => {
    try {
        console.log("Rozpoczynam seedowanie bazy danych...");
        const dataRaw = await fs.readFile(path.join(__dirname, 'database.json'), 'utf-8');
        const data = JSON.parse(dataRaw);

        // Czyszczenie starych kolekcji
        const collections = await db.listCollections().toArray();
        for (const collection of collections) {
            await db.collection(collection.name).drop();
            console.log(`Usunięto kolekcję: ${collection.name}`);
        }

        // Wgrywanie nowych danych
        if (data.users && data.users.length > 0) await db.collection('users').insertMany(data.users);
        if (data.categories && data.categories.length > 0) await db.collection('categories').insertMany(data.categories);
        if (data.products && data.products.length > 0) await db.collection('products').insertMany(data.products);
        if (data.orders && data.orders.length > 0) await db.collection('orders').insertMany(data.orders);
        if (data.holidays && data.holidays.length > 0) await db.collection('holidays').insertMany(data.holidays.map(h => ({ date: h })));
        
        console.log("Seedowanie zakończone pomyślnie.");
        res.status(200).send("<h1>Baza danych została pomyślnie zainicjowana!</h1><p>Możesz teraz wrócić do głównej aplikacji. Pamiętaj, aby usunąć ten endpoint z pliku server.js!</p>");
    } catch (err) {
        console.error("Błąd podczas seedowania:", err);
        res.status(500).json({ message: "Wystąpił błąd podczas inicjalizacji bazy danych.", error: err.message });
    }
});
// =================================================================
// == KONIEC FUNKCJI DO WGRYWANIA DANYCH ===========================
// =================================================================

// Tutaj reszta Twojego API... (bez zmian)
app.get('/api/data', async (req, res) => {
    try {
        const [users, products, categories, orders, holidays, workSessions, activeSessions] = await Promise.all([
            db.collection('users').find().toArray(),
            db.collection('products').find().toArray(),
            db.collection('categories').find().toArray(),
            db.collection('orders').find().toArray(),
            db.collection('holidays').find().toArray(),
            db.collection('workSessions').find().toArray(),
            db.collection('activeSessions').find().toArray()
        ]);
        res.json({ users, products, categories, orders, holidays, workSessions, activeSessions: activeSessions[0]?.sessions || [] });
    } catch (err) {
        res.status(500).json({ message: 'Błąd pobierania danych z bazy.', error: err.message });
    }
});


connectToDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Serwer Milkshake App działa na porcie ${PORT}`);
    });
});
