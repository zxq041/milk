const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
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

// === API ===

// --- Produkty ---
app.post('/api/products', upload.single('imageFile'), async (req, res) => {
    try {
        const newProduct = {
            name: req.body.name, category: req.body.category, pricePerUnit: parseFloat(req.body.pricePerUnit),
            unit: req.body.unit, demand: parseInt(req.body.demand, 10), packageSize: parseFloat(req.body.packageSize),
            orderTime: req.body.orderTime, supplier: req.body.supplier, altSupplier: req.body.altSupplier,
            scheduleDays: JSON.parse(req.body.scheduleDays), imageUrl: ''
        };
        if (req.file) {
            newProduct.imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        }
        await db.collection('products').insertOne(newProduct);
        const allProducts = await db.collection('products').find().toArray();
        res.status(201).json({ message: 'Produkt dodany!', products: allProducts });
    } catch (err) {
        res.status(500).json({ message: 'Błąd dodawania produktu.', error: err.message });
    }
});

// NOWA FUNKCJA: Aktualizacja produktu
app.put('/api/products/:id', upload.single('imageFile'), async (req, res) => {
    try {
        const productId = req.params.id;
        const updatedData = {
            name: req.body.name, category: req.body.category, pricePerUnit: parseFloat(req.body.pricePerUnit),
            unit: req.body.unit, demand: parseInt(req.body.demand, 10), packageSize: parseFloat(req.body.packageSize),
            orderTime: req.body.orderTime, supplier: req.body.supplier, altSupplier: req.body.altSupplier,
            scheduleDays: JSON.parse(req.body.scheduleDays)
        };
        
        if (req.file) {
            updatedData.imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        }

        const result = await db.collection('products').updateOne({ _id: new ObjectId(productId) }, { $set: updatedData });
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Nie znaleziono produktu.' });
        }
        const allProducts = await db.collection('products').find().toArray();
        res.status(200).json({ message: 'Produkt zaktualizowany!', products: allProducts });
    } catch (err) {
        res.status(500).json({ message: 'Błąd aktualizacji produktu.', error: err.message });
    }
});

// NOWA FUNKCJA: Usuwanie produktu
app.delete('/api/products/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        const result = await db.collection('products').deleteOne({ _id: new ObjectId(productId) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ message: 'Nie znaleziono produktu.' });
        }
        const allProducts = await db.collection('products').find().toArray();
        res.status(200).json({ message: 'Produkt usunięty!', products: allProducts });
    } catch (err) {
        res.status(500).json({ message: 'Błąd usuwania produktu.', error: err.message });
    }
});


// --- Pozostałe funkcje API (bez zmian) ---
app.get('/api/data', async (req, res) => {
    try {
        const [users, products, categories, orders, holidays, workSessions, activeSessionsDoc] = await Promise.all([
            db.collection('users').find().toArray(), db.collection('products').find().toArray(),
            db.collection('categories').find().toArray(), db.collection('orders').find().toArray(),
            db.collection('holidays').find().toArray(), db.collection('workSessions').find().toArray(),
            db.collection('activeSessions').findOne({})
        ]);
        res.json({ users, products, categories, orders, holidays: holidays.map(h => h.date), workSessions, activeSessions: activeSessionsDoc?.sessions || [] });
    } catch (err) { res.status(500).json({ message: 'Błąd pobierania danych z bazy.', error: err.message }); }
});
app.post('/api/login', async (req, res) => {
    try {
        const { login } = req.body;
        const user = await db.collection('users').findOne({ login });
        if (user) {
            await db.collection('activeSessions').updateOne({}, { $addToSet: { sessions: user.login } }, { upsert: true });
            res.json(user);
        } else { res.status(401).json({ message: 'Nieprawidłowy login' }); }
    } catch (err) { res.status(500).json({ message: "Błąd serwera.", error: err.message }); }
});
app.post('/api/logout', async (req, res) => {
    try {
        const { login } = req.body;
        await db.collection('activeSessions').updateOne({}, { $pull: { sessions: login } });
        res.status(200).json({ message: 'Wylogowano pomyślnie.' });
    } catch (err) { res.status(500).json({ message: "Błąd serwera.", error: err.message }); }
});
app.post('/api/orders', async (req, res) => {
    try {
        const newOrder = { ...req.body, id: Date.now(), date: new Date().toISOString() };
        await db.collection('orders').insertOne(newOrder);
        res.status(201).json({ message: 'Zamówienie zostało zapisane w systemie.' });
    } catch (err) { res.status(500).json({ message: "Błąd serwera.", error: err.message }); }
});
app.delete('/api/orders/all', async (req, res) => {
    try {
        await db.collection('orders').deleteMany({});
        res.status(200).json({ message: 'Wszystkie zamówienia zostały usunięte.' });
    } catch (err) { res.status(500).json({ message: "Błąd serwera.", error: err.message }); }
});
// ... reszta API (użytkownicy, czas pracy) bez zmian


connectToDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Serwer Milkshake App działa na porcie ${PORT}`);
    });
});
