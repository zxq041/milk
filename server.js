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
        console.log("Pomyślnie połączono z bazą danych MongoDB na Railway.");
    } catch (err) {
        console.error("Błąd połączenia z bazą danych:", err);
        process.exit(1);
    }
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// Strona główna dla klientów (teraz index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Aplikacja systemowa (teraz web.html)
app.get('/system', (req, res) => {
    res.sendFile(path.join(__dirname, 'web.html'));
});

// === API DLA REZERWACJI ===
app.post('/api/reservations', async (req, res) => {
    try {
        const newReservation = {
            tableId: req.body.selected_seat_value,
            tableName: req.body.selected_seat_display.replace('Wybrano: ', ''),
            name: req.body.name,
            phone: req.body.phone,
            date: req.body.date,
            guests: parseInt(req.body.guests, 10),
            createdAt: new Date(),
            status: 'pending'
        };
        await db.collection('reservations').insertOne(newReservation);
        res.status(201).json({ message: 'Rezerwacja została pomyślnie złożona! Oczekuj na potwierdzenie.' });
    } catch (err) {
        res.status(500).json({ message: 'Wystąpił błąd serwera podczas tworzenia rezerwacji.' });
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


// === POZOSTAŁE API (BEZ ZMIAN) ===
// ...
// (reszta kodu API, która już działa, pozostaje bez zmian)

connectToDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Serwer Milkshake App działa na porcie ${PORT}`);
    });
});
