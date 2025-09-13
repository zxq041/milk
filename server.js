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
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 } // 50 MB
});

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

// Strona główna dla klientów
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Aplikacja systemowa (panel admina)
app.get('/system', (req, res) => {
    res.sendFile(path.join(__dirname, 'web.html'));
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
            await createLog(login, 'Zalogowano do panelu');
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
        await createLog(login, 'Wylogowano z panelu');
        res.status(200).json({ message: 'Wylogowano pomyślnie.' });
    } catch (err) {
        res.status(500).json({ message: "Błąd serwera podczas wylogowywania.", error: err.message });
    }
});

// --- Pobieranie wszystkich danych ---
app.get('/api/data', async (req, res) => {
    try {
        const [users, products, categories, orders, holidays, workSessions, activeSessionsDoc, reservations, logs] = await Promise.all([
            db.collection('users').find().toArray(),
            db.collection('products').find().toArray(),
            db.collection('categories').find().toArray(),
            db.collection('orders').find().toArray(),
            db.collection('holidays').find().toArray(),
            db.collection('workSessions').find().toArray(),
            db.collection('activeSessions').findOne({}),
            db.collection('reservations').find().toArray(),
            db.collection('logs').find().sort({ timestamp: -1 }).limit(100).toArray()
        ]);
        res.json({
            users, products, categories, orders, reservations, logs,
            holidays: holidays.map(h => h.date),
            workSessions,
            activeSessions: activeSessionsDoc?.sessions || []
        });
    } catch (err) {
        res.status(500).json({ message: 'Błąd pobierania danych z bazy.', error: err.message });
    }
});

// --- Rezerwacje ---
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
        if (date) { query = { date: date }; }
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


// --- Produkty ---
app.post('/api/products', upload.single('imageFile'), async (req, res) => {
    try {
        const newProduct = {
            name: req.body.name, category: req.body.category, pricePerUnit: parseFloat(req.body.pricePerUnit),
            unit: req.body.unit, demand: parseInt(req.body.demand, 10), packageSize: parseFloat(req.body.packageSize),
            orderTime: req.body.orderTime, supplier: req.body.supplier, altSupplier: req.body.altSupplier,
            scheduleDays: JSON.parse(req.body.scheduleDays), imageUrl: ''
        };
        if (req.file) { newProduct.imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`; }
        await db.collection('products').insertOne(newProduct);
        await createLog(req.body.currentUserLogin, 'Dodano produkt', `Nazwa: ${newProduct.name}`);
        const allProducts = await db.collection('products').find().toArray();
        res.status(201).json({ message: 'Produkt dodany!', products: allProducts });
    } catch (err) { res.status(500).json({ message: 'Błąd dodawania produktu.', error: err.message }); }
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
        if (req.file) { updatedData.imageUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`; }
        const result = await db.collection('products').updateOne({ _id: new ObjectId(productId) }, { $set: updatedData });
        if (result.matchedCount === 0) { return res.status(404).json({ message: 'Nie znaleziono produktu.' }); }
        await createLog(req.body.currentUserLogin, 'Zaktualizowano produkt', `ID: ${productId}, Nazwa: ${updatedData.name}`);
        const allProducts = await db.collection('products').find().toArray();
        res.status(200).json({ message: 'Produkt zaktualizowany!', products: allProducts });
    } catch (err) { res.status(500).json({ message: 'Błąd aktualizacji produktu.', error: err.message }); }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        const productId = req.params.id;
        const productToDelete = await db.collection('products').findOne({ _id: new ObjectId(productId) });
        const result = await db.collection('products').deleteOne({ _id: new ObjectId(productId) });
        if (result.deletedCount === 0) { return res.status(404).json({ message: 'Nie znaleziono produktu.' }); }
        await createLog(req.body.currentUserLogin, 'Usunięto produkt', `Nazwa: ${productToDelete.name}`);
        const allProducts = await db.collection('products').find().toArray();
        res.status(200).json({ message: 'Produkt usunięty!', products: allProducts });
    } catch (err) { res.status(500).json({ message: 'Błąd usuwania produktu.', error: err.message }); }
});

// --- Pracownicy ---
app.post('/api/users', async (req, res) => {
    try {
        const { currentUserLogin, ...newUser } = req.body;
        const existingUser = await db.collection('users').findOne({ login: newUser.login });
        if (existingUser) { return res.status(409).json({ message: 'Ten login jest już zajęty.' }); }
        await db.collection('users').insertOne({ ...newUser, id: Date.now() });
        await createLog(currentUserLogin, 'Dodano pracownika', `Login: ${newUser.login}`);
        const allUsers = await db.collection('users').find().toArray();
        res.status(201).json({ message: 'Pracownik dodany!', users: allUsers });
    } catch (err) { res.status(500).json({ message: "Błąd serwera.", error: err.message }); }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { _id, currentUserLogin, ...updatedData } = req.body;
        const result = await db.collection('users').updateOne({ id: userId }, { $set: updatedData });
        if (result.matchedCount === 0) { return res.status(404).json({ message: 'Nie znaleziono pracownika.' }); }
        await createLog(currentUserLogin, 'Zaktualizowano pracownika', `Login: ${updatedData.login}`);
        res.status(200).json({ message: 'Dane pracownika zaktualizowane!' });
    } catch (err) { res.status(500).json({ message: "Błąd serwera.", error: err.message }); }
});

// --- Zamówienia ---
app.post('/api/orders', async (req, res) => {
    try {
        const newOrder = { ...req.body, id: Date.now(), date: new Date().toISOString() };
        await db.collection('orders').insertOne(newOrder);
        await createLog(req.body.user.login, 'Złożono zamówienie', `Suma: ${newOrder.totalPrice.toFixed(2)} zł`);
        res.status(201).json({ message: 'Zamówienie zostało zapisane w systemie.' });
    } catch (err) { res.status(500).json({ message: "Błąd serwera.", error: err.message }); }
});

app.delete('/api/orders/all', async (req, res) => {
    try {
        await db.collection('orders').deleteMany({});
        await createLog(req.body.currentUserLogin, 'Zresetowano wszystkie zamówienia');
        res.status(200).json({ message: 'Wszystkie zamówienia zostały usunięte.' });
    } catch (err) { res.status(500).json({ message: "Błąd serwera.", error: err.message }); }
});

// --- Czas Pracy ---
app.post('/api/work/start', async (req, res) => {
    try {
        const { userId, currentUserLogin } = req.body;
        const user = await db.collection('users').findOne({ id: userId });
        const newSession = { id: Date.now(), userId, startTime: new Date().toISOString(), endTime: null, totalHours: 0 };
        await db.collection('workSessions').insertOne(newSession);
        await createLog(currentUserLogin || 'Kiosk', 'Rozpoczęto pracę', `Pracownik: ${user.name}`);
        res.status(201).json({ message: 'Rozpoczęto pracę.', session: newSession });
    } catch (err) { res.status(500).json({ message: "Błąd serwera.", error: err.message }); }
});

app.post('/api/work/stop', async (req, res) => {
    try {
        const { userId, sessionId, currentUserLogin } = req.body;
        const session = await db.collection('workSessions').findOne({ id: sessionId, userId: userId, endTime: null });
        if (!session) { return res.status(404).json({ message: "Nie znaleziono aktywnej sesji pracy." }); }
        const user = await db.collection('users').findOne({ id: userId });
        const endTime = new Date();
        const startTime = new Date(session.startTime);
        const totalHours = (endTime - startTime) / (1000 * 60 * 60);
        await db.collection('workSessions').updateOne({ _id: session._id }, { $set: { endTime: endTime.toISOString(), totalHours: totalHours } });
        await createLog(currentUserLogin || 'Kiosk', 'Zakończono pracę', `Pracownik: ${user.name}`);
        const updatedSession = await db.collection('workSessions').findOne({ _id: session._id });
        res.status(200).json({ message: 'Zakończono pracę.', session: updatedSession });
    } catch (err) { res.status(500).json({ message: "Błąd serwera.", error: err.message }); }
});

app.delete('/api/work/user/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { currentUserLogin, resetFor } = req.body;
        await db.collection('workSessions').deleteMany({ userId: userId });
        await createLog(currentUserLogin, 'Zresetowano godziny pracownika', `Pracownik: ${resetFor}`);
        res.status(200).json({ message: 'Godziny pracy pracownika zostały zresetowane.' });
    } catch (err) { res.status(500).json({ message: "Błąd serwera.", error: err.message }); }
});

connectToDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Serwer Milkshake App działa na porcie ${PORT}`);
    });
});
