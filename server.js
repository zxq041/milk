// ============== 1. IMPORT PAKIETÓW ==============
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const multer = require('multer');

// ============== 2. KONFIGURACJA APLIKACJI ==============
const app = express();
const PORT = process.env.PORT || 3000;
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// ============== 3. MIDDLEWARE ==============
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============== 4. POŁĄCZENIE Z BAZĄ DANYCH MONGODB ==============
console.log("DIAGNOSTYKA: Próba połączenia z bazą danych...");
mongoose.connect(process.env.MONGO_URL)
    .then(() => console.log('✅ DIAGNOSTYKA: Połączono pomyślnie z bazą danych MongoDB!'))
    .catch(err => {
        console.error('❌ DIAGNOSTYKA: KRYTYCZNY BŁĄD połączenia z MongoDB:', err);
        process.exit(1);
    });

// ============== 5. SCHEMATY I MODELE DANYCH (MONGOOSE) ==============
const EmployeeSchema = new mongoose.Schema({ name: { type: String, required: true }, login: { type: String, required: true, unique: true }, position: { type: String, required: true }, workplace: { type: String, required: true }, hourlyRate: { type: Number, required: true } }, { timestamps: true });
const Employee = mongoose.model('Employee', EmployeeSchema);
// ... reszta schematów bez zmian ...


// ============== 6. ENDPOINTY API (TRASY) ==============
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// --- ZAKTUALIZOWANY, SPECJALNY ENDPOINT DO TWORZENIA/RESETOWANIA ADMINÓW ---
app.get('/api/setup-admins', asyncHandler(async (req, res) => {
    console.log("--- DIAGNOSTYKA: Uruchomiono endpoint /api/setup-admins ---");
    try {
        const defaultUsers = [
            { name: 'Gracjan - Admin', login: 'Admin33201', position: 'Właściciel', workplace: 'Wszystkie', hourlyRate: 100 },
            { name: 'Marcin', login: '0051', position: 'Właściciel', workplace: 'Wszystkie', hourlyRate: 100 }
        ];
        
        const loginsToDelete = ['Admin33201', '0051'];
        console.log(`DIAGNOSTYKA: Krok 1 - Próba usunięcia kont: ${loginsToDelete.join(', ')}`);
        const deleteResult = await Employee.deleteMany({ login: { $in: loginsToDelete } });
        console.log(`DIAGNOSTYKA: Usunięto ${deleteResult.deletedCount} istniejących kont adminów.`);

        console.log("DIAGNOSTYKA: Krok 2 - Próba utworzenia kont na nowo.");
        const insertResult = await Employee.insertMany(defaultUsers);
        console.log(`DIAGNOSTYKA: Utworzono ${insertResult.length} nowych kont adminów.`);

        res.status(200).json({ message: 'Konta adminów zostały zresetowane i utworzone na nowo.', created: insertResult.length });
    } catch (error) {
        console.error("❌ DIAGNOSTYKA: Błąd w /api/setup-admins:", error);
        res.status(500).json({ message: 'Błąd podczas resetowania kont adminów.', error: error.message });
    }
    console.log("--- DIAGNOSTYKA: Zakończono endpoint /api/setup-admins ---");
}));


// --- Trasa logowania (odporna na wielkość liter) ---
app.post('/api/login', asyncHandler(async (req, res) => {
    console.log("--- DIAGNOSTYKA: Uruchomiono endpoint /api/login ---");
    const { login } = req.body;
    console.log(`DIAGNOSTYKA: Otrzymano próbę logowania dla loginu: "${login}"`);
    
    if (!login) {
        console.log("DIAGNOSTYKA: Błąd - login nie został podany.");
        return res.status(400).json({ message: 'Login jest wymagany.' });
    }

    const query = { login: new RegExp('^' + login + '$', 'i') };
    console.log("DIAGNOSTYKA: Wyszukiwanie w bazie danych z zapytaniem:", query);
    
    const employee = await Employee.findOne(query);

    if (!employee) {
        console.log(`DIAGNOSTYKA: Nie znaleziono użytkownika dla loginu "${login}". Zwracam błąd.`);
        return res.status(401).json({ message: 'Nieprawidłowy login.' });
    }
    
    console.log("✅ DIAGNOSTYKA: Znaleziono użytkownika:", employee);
    res.status(200).json(employee);
    console.log("--- DIAGNOSTYKA: Zakończono endpoint /api/login ---");
}));

// --- (Reszta tras API bez zmian) ---
// ...

// ============== 7. SERWOWANIE FRONT-ENDU ==============
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/system', (req, res) => res.sendFile(path.join(__dirname, 'web.html')));

// ============== 8. OBSŁUGA BŁĘDÓW ==============
app.use((err, req, res, next) => { console.error(err.stack); res.status(500).json({ message: 'Coś poszło nie tak na serwerze!' }); });

// ============== 9. URUCHOMIENIE SERWERA ==============
app.listen(PORT, () => console.log(`🚀 Serwer nasłuchuje na porcie ${PORT}`));
