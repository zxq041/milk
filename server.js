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

// Endpoint do jednorazowego wgrania danych z database.json
app.get('/api/seed-database', async (req, res) => {
    try {
        const dataRaw = await fs.readFile(path.join(__dirname, 'database.json'), 'utf-8');
        const data = JSON.parse(dataRaw);
        const collections = await db.listCollections().toArray();
        for (const collection of collections) {
            await db.collection(collection.name).drop();
        }
        if (data.users && data.users.length > 0) await db.collection('users').insertMany(data.users);
        if (data.categories && data.categories.length > 0) await db.collection('categories').insertMany(data.categories);
        if (data.products && data.products.length > 0) await db.collection('products').insertMany(data.products);
        if (data.holidays && data.holidays.length > 0) await db.collection('holidays').insertMany(data.holidays.map(h => ({ date: h })));
        await db.collection('activeSessions').insertOne({ sessions: [] });
        res.status(200).send("<h1>Baza danych została pomyślnie zainicjowana!</h1>");
    } catch (err) {
        res.status(500).json({ message: "Wystąpił błąd.", error: err.message });
    }
});

// === PEŁNE I POPRAWNE API ===

// --- Logowanie i Sesje ---
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
        res.status(500).json({ message: "Błąd serwera podczas logowania.", error: err.message });
    }
});

app.post('/api/logout', async (req, res) => {
    try {
        const { login } = req.body;
        await db.collection('activeSessions').updateOne({}, { $pull: { sessions: login } });
        res.status(200).json({ message: 'Wylogowano pomyślnie.' });
    } catch (err) {
        res.status(500).json({ message: "Błąd serwera podczas wylogowywania.", error: err.message });
    }
});

// --- Pobieranie wszystkich danych ---
app.get('/api/data', async (req, res) => {
    try {
        const [users, products, categories, orders, holidays, workSessions, activeSessionsDoc] = await Promise.all([
            db.collection('users').find().toArray(),
            db.collection('products').find().toArray(),
            db.collection('categories').find().toArray(),
            db.collection('orders').find().toArray(),
            db.collection('holidays').find().toArray(),
            db.collection('workSessions').find().toArray(),
            db.collection('activeSessions').findOne({})
        ]);
        res.json({ users, products, categories, orders, holidays: holidays.map(h => h.date), workSessions, activeSessions: activeSessionsDoc?.sessions || [] });
    } catch (err) {
        res.status(500).json({ message: 'Błąd pobierania danych z bazy.', error: err.message });
    }
});

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


// --- Pracownicy ---
app.post('/api/users', async (req, res) => {
    try {
        const newUser = req.body;
        const existingUser = await db.collection('users').findOne({ login: newUser.login });
        if (existingUser) {
            return res.status(409).json({ message: 'Ten login jest już zajęty.' });
        }
        await db.collection('users').insertOne({ ...newUser, id: Date.now() });
        const allUsers = await db.collection('users').find().toArray();
        res.status(201).json({ message: 'Pracownik dodany!', users: allUsers });
    } catch (err) {
        res.status(500).json({ message: "Błąd serwera podczas dodawania pracownika.", error: err.message });
    }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { _id, ...updatedData } = req.body;
        const result = await db.collection('users').updateOne({ id: userId }, { $set: updatedData });
        if (result.matchedCount === 0) {
            return res.status(404).json({ message: 'Nie znaleziono pracownika.' });
        }
        res.status(200).json({ message: 'Dane pracownika zaktualizowane!' });
    } catch (err) {
         res.status(500).json({ message: "Błąd serwera podczas aktualizacji pracownika.", error: err.message });
    }
});

// --- Zamówienia ---
app.post('/api/orders', async (req, res) => {
    try {
        const newOrder = { ...req.body, id: Date.now(), date: new Date().toISOString() };
        await db.collection('orders').insertOne(newOrder);
        res.status(201).json({ message: 'Zamówienie zostało zapisane w systemie.' });
    } catch (err) {
        res.status(500).json({ message: "Błąd serwera podczas składania zamówienia.", error: err.message });
    }
});

app.delete('/api/orders/all', async (req, res) => {
    try {
        await db.collection('orders').deleteMany({});
        res.status(200).json({ message: 'Wszystkie zamówienia zostały usunięte.' });
    } catch (err) {
        res.status(500).json({ message: "Błąd serwera podczas usuwania zamówień.", error: err.message });
    }
});

// --- Czas Pracy ---
app.post('/api/work/start', async (req, res) => {
    try {
        const { userId } = req.body;
        const newSession = { id: Date.now(), userId, startTime: new Date().toISOString(), endTime: null, totalHours: 0 };
        await db.collection('workSessions').insertOne(newSession);
        res.status(201).json({ message: 'Rozpoczęto pracę.', session: newSession });
    } catch (err) {
         res.status(500).json({ message: "Błąd serwera.", error: err.message });
    }
});

app.post('/api/work/stop', async (req, res) => {
    try {
        const { userId, sessionId } = req.body;
        const session = await db.collection('workSessions').findOne({ id: sessionId, userId: userId, endTime: null });
        if (!session) {
            return res.status(404).json({ message: "Nie znaleziono aktywnej sesji pracy." });
        }
        const endTime = new Date();
        const startTime = new Date(session.startTime);
        const totalHours = (endTime - startTime) / (1000 * 60 * 60);
        await db.collection('workSessions').updateOne({ _id: session._id }, { $set: { endTime: endTime.toISOString(), totalHours: totalHours } });
        const updatedSession = await db.collection('workSessions').findOne({ _id: session._id });
        res.status(200).json({ message: 'Zakończono pracę.', session: updatedSession });
    } catch (err) {
        res.status(500).json({ message: "Błąd serwera.", error: err.message });
    }
});

app.delete('/api/work/user/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        await db.collection('workSessions').deleteMany({ userId: userId });
        res.status(200).json({ message: 'Godziny pracy pracownika zostały zresetowane.' });
    } catch (err) {
        res.status(500).json({ message: "Błąd serwera.", error: err.message });
    }
});

connectToDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Serwer Milkshake App działa na porcie ${PORT}`);
    });
});
