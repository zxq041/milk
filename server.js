const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const multer = require('multer'); // Do obsługi plików
const path = require('path');
const fs = require('fs').promises;
const app = express();

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

// Konfiguracja Multer do przechowywania plików w pamięci serwera
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

// Reszta API...
// Endpoint do jednorazowego wgrania danych z database.json
app.get('/api/seed-database', async (req, res) => {
    try {
        console.log("Rozpoczynam seedowanie bazy danych...");
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
        
        console.log("Seedowanie zakończone pomyślnie.");
        res.status(200).send("<h1>Baza danych została pomyślnie zainicjowana!</h1>");
    } catch (err) {
        console.error("Błąd podczas seedowania:", err);
        res.status(500).json({ message: "Wystąpił błąd podczas inicjalizacji bazy danych.", error: err.message });
    }
});

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

app.get('/api/data', async (req, res) => {
    try {
        const collections = {
            users: db.collection('users').find().toArray(),
            products: db.collection('products').find().toArray(),
            categories: db.collection('categories').find().toArray(),
            orders: db.collection('orders').find().toArray(),
            holidays: db.collection('holidays').find().toArray(),
            workSessions: db.collection('workSessions').find().toArray(),
            activeSessionsDoc: db.collection('activeSessions').findOne({})
        };
        
        const data = await Promise.all(Object.values(collections));
        
        res.json({
            users: data[0],
            products: data[1],
            categories: data[2],
            orders: data[3],
            holidays: data[4].map(h => h.date),
            workSessions: data[5],
            activeSessions: data[6]?.sessions || []
        });
    } catch (err) {
        res.status(500).json({ message: 'Błąd pobierania danych z bazy.', error: err.message });
    }
});

// ZAKTUALIZOWANA FUNKCJA DODAWANIA PRODUKTU
app.post('/api/products', upload.single('imageFile'), async (req, res) => {
    try {
        const newProduct = {
            name: req.body.name,
            category: req.body.category,
            pricePerUnit: parseFloat(req.body.pricePerUnit),
            unit: req.body.unit,
            demand: parseInt(req.body.demand, 10),
            packageSize: parseFloat(req.body.packageSize),
            orderTime: req.body.orderTime,
            supplier: req.body.supplier,
            altSupplier: req.body.altSupplier,
            scheduleDays: JSON.parse(req.body.scheduleDays),
            imageUrl: '' // Domyślnie puste
        };
        
        // Jeśli przesłano plik, konwertujemy go na Data URL (Base64)
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


// Reszta API bez zmian...

connectToDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Serwer Milkshake App działa na porcie ${PORT}`);
    });
});
