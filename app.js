class DataExplorer {
    constructor() {
        this.initializeElements();
        this.setupEventListeners();
        this.currentData = null;
        this.db = null;
        this.SQL = null;
        this.pipeline = null;
        this.modelLoaded = false;
        this.initializeSQL();
    }

    initializeElements() {
        this.uploadArea = document.getElementById('uploadArea');
        this.fileInput = document.getElementById('fileInput');
        this.uploadBtn = document.getElementById('uploadBtn');
        this.status = document.getElementById('status');
        this.loading = document.getElementById('loading');
        this.chatSection = document.getElementById('chatSection');
        this.chatMessages = document.getElementById('chatMessages');
        this.chatInput = document.getElementById('chatInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.resultsSection = document.getElementById('resultsSection');
        this.resultsContainer = document.getElementById('resultsContainer');
    }

    async initializeSQL() {
        try {
            this.SQL = await initSqlJs({
                locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
            });
            console.log('SQL.js initialized');
        } catch (error) {
            console.error('Failed to initialize SQL.js:', error);
            this.showStatus('Failed to initialize database engine', 'error');
        }
    }

    async initializeAI() {
        if (this.modelLoaded) return;
        
        try {
            this.showStatus('Loading AI model (first time only, ~50MB)...', 'success');
            
            // Use a smaller, faster model for SQL generation
            this.pipeline = await window.Transformers.pipeline(
                'text-generation',
                'Xenova/CodeLlama-7b-Instruct-hf',
                {
                    quantized: true,
                    progress_callback: (progress) => {
                        if (progress.status === 'downloading') {
                            this.showStatus(`Downloading model: ${Math.round(progress.progress)}%`, 'success');
                        }
                    }
                }
            );
            
            this.modelLoaded = true;
            this.showStatus('AI model loaded successfully!', 'success');
            setTimeout(() => this.hideStatus(), 3000);
        } catch (error) {
            console.error('Failed to load AI model:', error);
            this.showStatus('Failed to load AI model. Using fallback query patterns.', 'error');
        }
    }

    setupEventListeners() {
        // File upload events
        this.uploadArea.addEventListener('click', () => this.fileInput.click());
        this.uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        this.uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.uploadArea.addEventListener('drop', this.handleDrop.bind(this));
        this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        this.uploadBtn.addEventListener('click', this.uploadFile.bind(this));

        // Chat events
        this.sendBtn.addEventListener('click', this.sendMessage.bind(this));
        this.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
    }

    handleDragOver(e) {
        e.preventDefault();
        this.uploadArea.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.fileInput.files = files;
            this.handleFileSelect();
        }
    }

    handleFileSelect() {
        const file = this.fileInput.files[0];
        if (file) {
            this.uploadBtn.style.display = 'inline-block';
            this.uploadArea.querySelector('.upload-text').textContent = `Selected: ${file.name}`;
        }
    }

    async uploadFile() {
        const file = this.fileInput.files[0];
        if (!file) return;

        this.showLoading(true);
        this.hideStatus();

        try {
            const data = await this.parseFile(file);
            await this.createTableFromData(data, file.name);
            
            this.showStatus(`Successfully loaded ${data.length} rows with columns: ${this.currentData.schema.join(', ')}`, 'success');
            this.chatSection.style.display = 'block';
            this.chatInput.focus();
            
            // Initialize AI model in background
            this.initializeAI();
            
        } catch (error) {
            this.showStatus(`Upload failed: ${error.message}`, 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async parseFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        
        if (ext === 'csv') {
            return this.parseCSV(file);
        } else if (ext === 'xlsx' || ext === 'xls') {
            return this.parseExcel(file);
        } else {
            throw new Error('Unsupported file type. Please upload CSV or Excel files.');
        }
    }

    parseCSV(file) {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    if (results.errors.length > 0) {
                        reject(new Error('CSV parsing error: ' + results.errors[0].message));
                    } else {
                        resolve(results.data);
                    }
                },
                error: reject
            });
        });
    }

    async parseExcel(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);
                    resolve(jsonData);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    async createTableFromData(data, filename) {
        if (!data || data.length === 0) {
            throw new Error('No data found in file');
        }

        // Create new database
        this.db = new this.SQL.Database();
        
        const tableName = 'user_data';
        const columns = Object.keys(data[0]);
        
        this.currentData = {
            tableName,
            schema: columns,
            rowCount: data.length
        };

        // Create table
        const columnDefs = columns.map(col => `"${col}" TEXT`).join(', ');
        this.db.run(`CREATE TABLE ${tableName} (${columnDefs})`);

        // Insert data
        const placeholders = columns.map(() => '?').join(', ');
        const stmt = this.db.prepare(`INSERT INTO ${tableName} VALUES (${placeholders})`);
        
        for (const row of data) {
            const values = columns.map(col => row[col] || null);
            stmt.run(values);
        }
        stmt.free();
    }

    async sendMessage() {
        const question = this.chatInput.value.trim();
        if (!question) return;

        // Add user message to chat
        this.addMessage(question, 'user');
        this.chatInput.value = '';

        this.showLoading(true);

        try {
            const sqlQuery = await this.generateSQLFromQuestion(question);
            const results = this.executeQuery(sqlQuery);
            
            // Add AI response to chat
            this.addMessage(`I found ${results.length} results. Here's what I executed: \`${sqlQuery}\``, 'ai');
            
            // Show results table
            this.displayResults(results, sqlQuery);
            
        } catch (error) {
            this.addMessage(`Sorry, I encountered an error: ${error.message}`, 'ai');
        } finally {
            this.showLoading(false);
        }
    }

    async generateSQLFromQuestion(question) {
        // Try AI model first if available
        if (this.modelLoaded && this.pipeline) {
            try {
                return await this.generateSQLWithAI(question);
            } catch (error) {
                console.warn('AI generation failed, falling back to patterns:', error);
            }
        }
        
        // Fallback to pattern matching
        return this.generateSQLWithPatterns(question);
    }

    async generateSQLWithAI(question) {
        const prompt = `Generate a SQLite query for this question about a table called "user_data" with columns: ${this.currentData.schema.join(', ')}.

Question: "${question}"

Rules:
- Return only the SQL query, no explanations
- Use double quotes for column names
- Table name is "user_data"
- Keep it simple and focused

SQL:`;

        const result = await this.pipeline(prompt, {
            max_new_tokens: 100,
            temperature: 0.1,
            do_sample: false
        });
        
        let sql = result[0].generated_text.replace(prompt, '').trim();
        sql = sql.split('\n')[0]; // Take first line
        sql = sql.replace(/;$/, ''); // Remove trailing semicolon
        
        return sql;
    }

    generateSQLWithPatterns(question) {
        const q = question.toLowerCase();
        const tableName = 'user_data';
        const columns = this.currentData.schema;
        
        // Pattern matching for common queries
        if (q.includes('first') || q.includes('top')) {
            const num = this.extractNumber(q) || 10;
            return `SELECT * FROM ${tableName} LIMIT ${num}`;
        }
        
        if (q.includes('count') && q.includes('group')) {
            const column = this.findColumnInQuestion(q);
            if (column) {
                return `SELECT "${column}", COUNT(*) as count FROM ${tableName} GROUP BY "${column}"`;
            }
        }
        
        if (q.includes('average') || q.includes('avg')) {
            const column = this.findColumnInQuestion(q);
            if (column) {
                return `SELECT AVG("${column}") as average FROM ${tableName}`;
            }
        }
        
        if (q.includes('sum')) {
            const column = this.findColumnInQuestion(q);
            if (column) {
                return `SELECT SUM("${column}") as total FROM ${tableName}`;
            }
        }
        
        if (q.includes('unique') || q.includes('distinct')) {
            const column = this.findColumnInQuestion(q);
            if (column) {
                return `SELECT DISTINCT "${column}" FROM ${tableName}`;
            }
        }
        
        if (q.includes('greater than') || q.includes('>')) {
            const column = this.findColumnInQuestion(q);
            const value = this.extractNumber(q);
            if (column && value) {
                return `SELECT * FROM ${tableName} WHERE "${column}" > ${value}`;
            }
        }
        
        if (q.includes('sort') || q.includes('order')) {
            const column = this.findColumnInQuestion(q);
            const desc = q.includes('desc') || q.includes('descending') ? 'DESC' : 'ASC';
            if (column) {
                return `SELECT * FROM ${tableName} ORDER BY "${column}" ${desc}`;
            }
        }
        
        // Default: show all data
        return `SELECT * FROM ${tableName} LIMIT 100`;
    }

    findColumnInQuestion(question) {
        const columns = this.currentData.schema;
        for (const col of columns) {
            if (question.toLowerCase().includes(col.toLowerCase())) {
                return col;
            }
        }
        return columns[0]; // Default to first column
    }

    extractNumber(text) {
        const match = text.match(/\d+/);
        return match ? parseInt(match[0]) : null;
    }

    executeQuery(sql) {
        try {
            const stmt = this.db.prepare(sql);
            const results = [];
            
            while (stmt.step()) {
                const row = stmt.getAsObject();
                results.push(row);
            }
            
            stmt.free();
            return results;
        } catch (error) {
            throw new Error(`SQL Error: ${error.message}`);
        }
    }

    addMessage(text, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        
        if (sender === 'ai') {
            messageDiv.innerHTML = `<strong>AI Assistant:</strong> ${text}`;
        } else {
            messageDiv.innerHTML = `<strong>You:</strong> ${text}`;
        }
        
        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    displayResults(results, query) {
        if (!results || results.length === 0) {
            this.resultsContainer.innerHTML = '<p>No results found.</p>';
            this.resultsSection.style.display = 'block';
            return;
        }

        const columns = Object.keys(results[0]);
        
        let tableHTML = `
            <div style="margin-bottom: 10px;">
                <strong>SQL Query:</strong> <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">${query}</code>
            </div>
            <table class="results-table">
                <thead>
                    <tr>
                        ${columns.map(col => `<th>${col}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
                    ${results.map(row => `
                        <tr>
                            ${columns.map(col => `<td>${row[col] || ''}</td>`).join('')}
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;

        this.resultsContainer.innerHTML = tableHTML;
        this.resultsSection.style.display = 'block';
        
        // Scroll to results
        this.resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    showLoading(show) {
        this.loading.style.display = show ? 'block' : 'none';
    }

    showStatus(message, type) {
        this.status.textContent = message;
        this.status.className = `status ${type}`;
        this.status.style.display = 'block';
    }

    hideStatus() {
        this.status.style.display = 'none';
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new DataExplorer();
});