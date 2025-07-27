const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const multer = require('multer');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL; // Pobieramy URL z Railway

// Konfiguracja Multer do obsługi przesyłania plików w pamięci
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

let db; // Zmienna do przechowywania połączenia z bazą danych

// --- Połączenie z Bazą Danych MongoDB ---
async function connectToDb() {
    if (!DATABASE_URL) {
        console.error("Błąd: Brak zmiennej środowiskowej DATABASE_URL.");
        process.exit(1);
    }
    try {
        const client = new MongoClient(DATABASE_URL);
        await client.connect();
        db = client.db(); // Domyślna nazwa bazy danych w Railway to 'test'
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

const ROLES_HIERARCHY = ["Właściciel", "Menager", "Szef Kuchni", "Kucharz", "Pomoc Kuchenna", "Kelner", "Praktykant"];

// === API ===

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

// --- Produkty (z obsługą pliku) ---
app.post('/api/products', upload.single('image'), async (req, res) => {
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
            imageUrl: ''
        };
        
        // Jeśli jest obrazek, konwertujemy go na Base64 i zapisujemy w bazie
        if (req.file) {
            const base64Image = req.file.buffer.toString('base64');
            const mimeType = req.file.mimetype;
            newProduct.imageUrl = `data:${mimeType};base64,${base64Image}`;
        }

        const result = await db.collection('products').insertOne(newProduct);
        const allProducts = await db.collection('products').find().toArray();
        res.status(201).json({ message: 'Produkt dodany!', products: allProducts });
    } catch (err) {
        res.status(500).json({ message: 'Błąd dodawania produktu.', error: err.message });
    }
});

// Reszta API przepisana na MongoDB...
// (Użytkownicy, zamówienia, czas pracy, etc.)

// Serwer startuje dopiero po połączeniu z bazą danych
connectToDb().then(() => {
    app.listen(PORT, () => {
        console.log(`Serwer Milkshake App działa na porcie ${PORT}`);
    });
});
