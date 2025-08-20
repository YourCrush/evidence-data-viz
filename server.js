const express = require('express');
const multer = require('multer');
const csv = require('csv-parser');
const xlsx = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const { Ollama } = require('ollama');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 3001;

// Initialize Ollama client
const ollama = new Ollama({ host: 'http://localhost:11434' });

// In-memory database
let db = new sqlite3.Database(':memory:');
let currentTableSchema = null;
let currentTableName = null;

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

app.use(express.json());
app.use(express.static('public'));

// File upload endpoint
app.post('/upload', upload.single('datafile'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const data = await parseFile(file);
        await createTableFromData(data, file.originalname);

        // Clean up uploaded file
        fs.unlinkSync(file.path);

        res.json({
            success: true,
            tableName: currentTableName,
            schema: currentTableSchema,
            rowCount: data.length
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({ error: error.message });
    }
});

// AI query endpoint
app.post('/ai-query', async (req, res) => {
    try {
        const { question } = req.body;

        if (!currentTableSchema) {
            return res.status(400).json({ error: 'No data uploaded yet' });
        }

        const sqlQuery = await generateSQLFromQuestion(question);
        const results = await executeQuery(sqlQuery);

        res.json({
            question,
            sqlQuery,
            results,
            schema: currentTableSchema
        });
    } catch (error) {
        console.error('AI query error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Parse different file types
async function parseFile(file) {
    const ext = path.extname(file.originalname).toLowerCase();

    if (ext === '.csv') {
        return parseCSV(file.path);
    } else if (ext === '.xlsx' || ext === '.xls') {
        return parseExcel(file.path);
    } else {
        throw new Error('Unsupported file type. Please upload CSV or Excel files.');
    }
}

function parseCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (data) => results.push(data))
            .on('end', () => resolve(results))
            .on('error', reject);
    });
}

function parseExcel(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(worksheet);
}

// Create SQLite table from data
async function createTableFromData(data, filename) {
    if (data.length === 0) {
        throw new Error('No data found in file');
    }

    currentTableName = 'user_data';
    const columns = Object.keys(data[0]);
    currentTableSchema = columns;

    // Drop existing table if it exists
    await new Promise((resolve, reject) => {
        db.run(`DROP TABLE IF EXISTS ${currentTableName}`, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // Create table with dynamic columns
    const columnDefs = columns.map(col => `"${col}" TEXT`).join(', ');
    await new Promise((resolve, reject) => {
        db.run(`CREATE TABLE ${currentTableName} (${columnDefs})`, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });

    // Insert data
    const placeholders = columns.map(() => '?').join(', ');
    const stmt = db.prepare(`INSERT INTO ${currentTableName} VALUES (${placeholders})`);

    for (const row of data) {
        const values = columns.map(col => row[col] || null);
        stmt.run(values);
    }
    stmt.finalize();
}

// Generate SQL from natural language using Ollama
async function generateSQLFromQuestion(question) {
    const prompt = `You are a SQL expert. Given this table schema and user question, generate a SQLite query.

Table: ${currentTableName}
Columns: ${currentTableSchema.join(', ')}

User Question: "${question}"

Rules:
- Only return the SQL query, no explanations
- Use SQLite syntax
- Table name is "${currentTableName}"
- Column names should be quoted with double quotes
- Keep queries simple and focused on the user's question
- Use appropriate aggregations, filters, and sorting

SQL Query:`;

    try {
        const response = await ollama.generate({
            model: 'codellama:7b',
            prompt: prompt,
            stream: false
        });

        // Clean up the response to extract just the SQL
        let sql = response.response.trim();
        sql = sql.replace(/```sql\n?/g, '').replace(/```\n?/g, '');
        sql = sql.split('\n')[0]; // Take first line if multiple

        return sql;
    } catch (error) {
        console.error('Ollama error:', error);
        throw new Error('AI service unavailable. Make sure Ollama is running locally.');
    }
}

// Execute SQL query
function executeQuery(sql) {
    return new Promise((resolve, reject) => {
        db.all(sql, (err, rows) => {
            if (err) {
                reject(new Error(`SQL Error: ${err.message}`));
            } else {
                resolve(rows);
            }
        });
    });
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Make sure Ollama is running: ollama serve');
    console.log('And pull the model: ollama pull codellama:7b');
});