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

// NOWA FUNKCJA DO TWORZENIA LOGÓW
async function createLog(userLogin, action, details = '') {
    if (!db) return;
    try {
        await db.collection('logs').insertOne({
            timestamp: new Date(),
            user: userLogin,
            action: action,
            details: details
        });
    } catch (err) {
        console.error("Błąd podczas tworzenia logu:", err);
    }
}


app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });
app.get('/system', (req, res) => { res.sendFile(path.join(__dirname, 'web.html')); });

// === API ===

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
    } catch (err) { res.status(500).json({ message: "Błąd serwera.", error: err.message }); }
});

app.post('/api/logout', async (req, res) => {
    try {
        const { login } = req.body;
        await db.collection('activeSessions').updateOne({}, { $pull: { sessions: login } });
        await createLog(login, 'Wylogowano z panelu');
        res.status(200).json({ message: 'Wylogowano pomyślnie.' });
    } catch (err) { res.status(500).json({ message: "Błąd serwera.", error: err.message }); }
});

app.get('/api/data', async (req, res) => {
    try {
        const [users, products, categories, orders, holidays, workSessions, activeSessionsDoc, reservations, logs] = await Promise.all([
            db.collection('users').find().toArray(), db.collection('products').find().toArray(),
            db.collection('categories').find().toArray(), db.collection('orders').find().toArray(),
            db.collection('holidays').find().toArray(), db.collection('workSessions').find().toArray(),
            db.collection('activeSessions').findOne({}), db.collection('reservations').find().toArray(),
            db.collection('logs').find().sort({ timestamp: -1 }).limit(100).toArray() // Pobieramy 100 najnowszych logów
        ]);
        res.json({ users, products, categories, orders, reservations, logs,
            holidays: holidays.map(h => h.date),
            workSessions, activeSessions: activeSessionsDoc?.sessions || []
        });
    } catch (err) { res.status(500).json({ message: 'Błąd pobierania danych z bazy.', error: err.message }); }
});

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

        await db.collection('products').updateOne({ _id: new ObjectId(productId) }, { $set: updatedData });
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
        if (result.deletedCount === 0) return res.status(404).json({ message: 'Nie znaleziono produktu.' });
        
        await createLog(req.body.currentUserLogin, 'Usunięto produkt', `Nazwa: ${productToDelete.name}`);

        const allProducts = await db.collection('products').find().toArray();
        res.status(200).json({ message: 'Produkt usunięty!', products: allProducts });
    } catch (err) { res.status(500).json({ message: 'Błąd usuwania produktu.', error: err.message }); }
});

app.post('/api/users', async (req, res) => {
    try {
        const newUser = req.body;
        const existingUser = await db.collection('users').findOne({ login: newUser.login });
        if (existingUser) return res.status(409).json({ message: 'Ten login jest już zajęty.' });
        
        await db.collection('users').insertOne({ ...newUser, id: Date.now() });
        await createLog(req.body.currentUserLogin, 'Dodano pracownika', `Login: ${newUser.login}`);

        const allUsers = await db.collection('users').find().toArray();
        res.status(201).json({ message: 'Pracownik dodany!', users: allUsers });
    } catch (err) { res.status(500).json({ message: "Błąd serwera.", error: err.message }); }
});

app.put('/api/users/:id', async (req, res) => {
    try {
        const userId = parseInt(req.params.id, 10);
        const { _id, ...updatedData } = req.body;
        
        await db.collection('users').updateOne({ id: userId }, { $set: updatedData });
        await createLog(req.body.currentUserLogin, 'Zaktualizowano pracownika', `Login: ${updatedData.login}`);
        
        res.status(200).json({ message: 'Dane pracownika zaktualizowane!' });
    } catch (err) { res.status(500).json({ message: "Błąd serwera.", error: err.message }); }
});

app.post('/api/orders', async (req, res) => {
    try {
        const newOrder = { ...req.body, id: Date.now(), date: new Date().toISOString() };
        await db.collection('orders').insertOne(newOrder);
        await createLog(req.body.user.login, 'Złożono zamówienie', `Suma: ${newOrder.totalPrice.toFixed(2)} zł`);
        res.status(201).json({ message: 'Zamówienie zostało zapisane w systemie.' });
    } catch (err) { res.status(500).json({ message: "Błąd serwera.", error: err.message }); }
});

// ... reszta API bez zmian w logice, ale warto by było dodać logowanie...

connectToDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Serwer Milkshake App działa na porcie ${PORT}`);
    });
});
