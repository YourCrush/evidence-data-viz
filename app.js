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
            this.showStatus('Loading AI model (first time only, ~25MB)...', 'success');
            
            // Use a much smaller, browser-optimized model
            this.pipeline = await window.Transformers.pipeline(
                'text2text-generation',
                'Xenova/flan-t5-small',
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
            this.showStatus('Failed to load AI model. Using smart pattern matching instead.', 'error');
            // Don't treat this as a failure - pattern matching works great
            setTimeout(() => this.hideStatus(), 3000);
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
            
            // Add AI response to chat with more context
            const detectedColumn = this.findColumnInQuestion(question);
            let responseMsg = `I found ${results.length} results. Here's what I executed: \`${sqlQuery}\``;
            
            if (question.toLowerCase().includes('chart') || question.toLowerCase().includes('bar')) {
                responseMsg += ` (Detected column for grouping: "${detectedColumn}")`;
            }
            
            this.addMessage(responseMsg, 'ai');
            
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
        const prompt = `Translate to SQL: "${question}" for table user_data with columns ${this.currentData.schema.join(', ')}`;

        const result = await this.pipeline(prompt, {
            max_new_tokens: 50,
            temperature: 0.1
        });
        
        let sql = result[0].generated_text.trim();
        
        // Clean up the response
        sql = sql.replace(/^(SELECT|select)/, 'SELECT');
        if (!sql.toLowerCase().includes('from')) {
            sql += ` FROM user_data`;
        }
        
        return sql;
    }

    generateSQLWithPatterns(question) {
        const q = question.toLowerCase();
        const tableName = 'user_data';
        const columns = this.currentData.schema;
        
        // Enhanced pattern matching for Evidence-style queries
        
        // Chart-specific patterns (highest priority)
        if (q.includes('chart') || q.includes('graph') || q.includes('plot')) {
            const column = this.findColumnInQuestion(q);
            if (column) {
                return `SELECT "${column}", COUNT(*) as count FROM ${tableName} GROUP BY "${column}" ORDER BY count DESC`;
            }
        }
        
        // Show/display/view patterns with chart context
        if (q.includes('show') || q.includes('display') || q.includes('view')) {
            // Check for chart/graph requests first
            if (q.includes('chart') || q.includes('graph') || q.includes('bar') || q.includes('plot')) {
                const column = this.findColumnInQuestion(q);
                if (column) {
                    return `SELECT "${column}", COUNT(*) as count FROM ${tableName} GROUP BY "${column}" ORDER BY count DESC`;
                }
            }
            
            // Check for "by" patterns (grouping)
            if (q.includes(' by ')) {
                const column = this.findColumnInQuestion(q);
                if (column) {
                    return `SELECT "${column}", COUNT(*) as count FROM ${tableName} GROUP BY "${column}" ORDER BY count DESC`;
                }
            }
            
            if (q.includes('first') || q.includes('top')) {
                const num = this.extractNumber(q) || 10;
                return `SELECT * FROM ${tableName} LIMIT ${num}`;
            }
            if (q.includes('all')) {
                return `SELECT * FROM ${tableName}`;
            }
        }
        
        // Count and group patterns
        if (q.includes('count')) {
            if (q.includes('group') || q.includes('by')) {
                const column = this.findColumnInQuestion(q);
                if (column) {
                    return `SELECT "${column}", COUNT(*) as count FROM ${tableName} GROUP BY "${column}" ORDER BY count DESC`;
                }
            }
            return `SELECT COUNT(*) as total_rows FROM ${tableName}`;
        }
        
        // Average patterns
        if (q.includes('average') || q.includes('avg') || q.includes('mean')) {
            const column = this.findColumnInQuestion(q);
            if (column) {
                if (q.includes('group') || q.includes('by')) {
                    const groupCol = this.findSecondColumnInQuestion(q, column);
                    if (groupCol) {
                        return `SELECT "${groupCol}", AVG("${column}") as avg_${column} FROM ${tableName} GROUP BY "${groupCol}" ORDER BY avg_${column} DESC`;
                    }
                }
                return `SELECT AVG("${column}") as average_${column} FROM ${tableName}`;
            }
        }
        
        // Sum patterns
        if (q.includes('sum') || q.includes('total')) {
            const column = this.findColumnInQuestion(q);
            if (column) {
                if (q.includes('group') || q.includes('by')) {
                    const groupCol = this.findSecondColumnInQuestion(q, column);
                    if (groupCol) {
                        return `SELECT "${groupCol}", SUM("${column}") as total_${column} FROM ${tableName} GROUP BY "${groupCol}" ORDER BY total_${column} DESC`;
                    }
                }
                return `SELECT SUM("${column}") as total_${column} FROM ${tableName}`;
            }
        }
        
        // Min/Max patterns
        if (q.includes('maximum') || q.includes('max') || q.includes('highest')) {
            const column = this.findColumnInQuestion(q);
            if (column) {
                return `SELECT * FROM ${tableName} ORDER BY "${column}" DESC LIMIT 1`;
            }
        }
        
        if (q.includes('minimum') || q.includes('min') || q.includes('lowest')) {
            const column = this.findColumnInQuestion(q);
            if (column) {
                return `SELECT * FROM ${tableName} ORDER BY "${column}" ASC LIMIT 1`;
            }
        }
        
        // Unique/distinct patterns
        if (q.includes('unique') || q.includes('distinct')) {
            const column = this.findColumnInQuestion(q);
            if (column) {
                return `SELECT DISTINCT "${column}" FROM ${tableName} ORDER BY "${column}"`;
            }
        }
        
        // Comparison patterns
        if (q.includes('greater than') || q.includes('>') || q.includes('more than')) {
            const column = this.findColumnInQuestion(q);
            const value = this.extractNumber(q);
            if (column && value) {
                return `SELECT * FROM ${tableName} WHERE "${column}" > ${value} ORDER BY "${column}" DESC`;
            }
        }
        
        if (q.includes('less than') || q.includes('<') || q.includes('below')) {
            const column = this.findColumnInQuestion(q);
            const value = this.extractNumber(q);
            if (column && value) {
                return `SELECT * FROM ${tableName} WHERE "${column}" < ${value} ORDER BY "${column}" ASC`;
            }
        }
        
        // Sort patterns
        if (q.includes('sort') || q.includes('order')) {
            const column = this.findColumnInQuestion(q);
            const desc = q.includes('desc') || q.includes('descending') || q.includes('highest') ? 'DESC' : 'ASC';
            if (column) {
                return `SELECT * FROM ${tableName} ORDER BY "${column}" ${desc}`;
            }
        }
        
        // Search patterns
        if (q.includes('find') || q.includes('search') || q.includes('where')) {
            const column = this.findColumnInQuestion(q);
            if (column) {
                const value = this.extractQuotedValue(q);
                if (value) {
                    return `SELECT * FROM ${tableName} WHERE "${column}" LIKE '%${value}%'`;
                }
            }
        }
        
        // Catch-all for "by [column]" patterns that might have been missed
        if (q.includes(' by ')) {
            const column = this.findColumnInQuestion(q);
            if (column) {
                return `SELECT "${column}", COUNT(*) as count FROM ${tableName} GROUP BY "${column}" ORDER BY count DESC`;
            }
        }
        
        // Default: show sample data
        return `SELECT * FROM ${tableName} LIMIT 20`;
    }

    findSecondColumnInQuestion(question, excludeColumn) {
        const columns = this.currentData.schema.filter(col => col !== excludeColumn);
        for (const col of columns) {
            if (question.toLowerCase().includes(col.toLowerCase())) {
                return col;
            }
        }
        return null;
    }

    extractQuotedValue(text) {
        const match = text.match(/["']([^"']+)["']/);
        return match ? match[1] : null;
    }

    findColumnInQuestion(question) {
        const columns = this.currentData.schema;
        const q = question.toLowerCase();
        
        // First, try exact column name matches
        for (const col of columns) {
            if (q.includes(col.toLowerCase())) {
                return col;
            }
        }
        
        // Then try partial matches and common synonyms
        for (const col of columns) {
            const colLower = col.toLowerCase();
            
            // Check for common data type patterns
            if ((q.includes('name') || q.includes('title')) && 
                (colLower.includes('name') || colLower.includes('title') || colLower.includes('software'))) {
                return col;
            }
            
            if ((q.includes('category') || q.includes('type')) && 
                (colLower.includes('category') || colLower.includes('type') || colLower.includes('kind'))) {
                return col;
            }
            
            if ((q.includes('install') || q.includes('software')) && 
                (colLower.includes('install') || colLower.includes('software') || colLower.includes('app') || colLower.includes('program'))) {
                return col;
            }
            
            if (q.includes('status') && colLower.includes('status')) {
                return col;
            }
            
            if ((q.includes('date') || q.includes('time')) && 
                (colLower.includes('date') || colLower.includes('time') || colLower.includes('created'))) {
                return col;
            }
        }
        
        // If no specific match, return the first string-like column (most likely to be categorical)
        for (const col of columns) {
            // This is a heuristic - columns with "name", "title", etc. are likely categorical
            const colLower = col.toLowerCase();
            if (colLower.includes('name') || colLower.includes('title') || 
                colLower.includes('software') || colLower.includes('app') || 
                colLower.includes('program') || colLower.includes('category') ||
                colLower.includes('type') || colLower.includes('status')) {
                return col;
            }
        }
        
        return columns[0]; // Final fallback to first column
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
        const insights = this.generateInsights(results, query);
        const chartConfig = this.determineChartType(results, columns);
        
        let html = `
            <div style="margin-bottom: 20px;">
                <strong>SQL Query:</strong> <code style="background: #f1f5f9; padding: 4px 8px; border-radius: 4px;">${query}</code>
            </div>
        `;

        // Add insights panel
        if (insights.length > 0) {
            html += `
                <div class="insights-panel">
                    <h4>📊 Key Insights</h4>
                    ${insights.map(insight => `<div class="insight-item">${insight}</div>`).join('')}
                </div>
            `;
        }

        // Add metrics if we have summary data
        const metrics = this.extractMetrics(results, columns);
        if (metrics.length > 0) {
            html += `
                <div style="text-align: center; margin: 20px 0;">
                    ${metrics.map(metric => `
                        <div class="metric-card">
                            <div class="metric-value">${metric.value}</div>
                            <div class="metric-label">${metric.label}</div>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        // Add chart if appropriate
        if (chartConfig && results.length > 1 && results.length < 100) {
            html += `
                <div class="chart-container">
                    <canvas id="resultsChart" class="chart-canvas"></canvas>
                </div>
            `;
        }

        // Add data table
        html += `
            <div style="margin-top: 20px;">
                <h4>📋 Data Table (${results.length} rows)</h4>
                <table class="results-table">
                    <thead>
                        <tr>
                            ${columns.map(col => `<th>${col}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${results.slice(0, 100).map(row => `
                            <tr>
                                ${columns.map(col => `<td>${this.formatCellValue(row[col])}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${results.length > 100 ? `<p style="text-align: center; color: #666; margin-top: 10px;">Showing first 100 of ${results.length} rows</p>` : ''}
            </div>
        `;

        this.resultsContainer.innerHTML = html;
        this.resultsSection.style.display = 'block';

        // Create chart if configured
        if (chartConfig && document.getElementById('resultsChart')) {
            this.createChart(results, chartConfig);
        }
        
        // Scroll to results
        this.resultsSection.scrollIntoView({ behavior: 'smooth' });
    }

    generateInsights(results, query) {
        const insights = [];
        const q = query.toLowerCase();
        
        if (q.includes('count') && results.length > 0) {
            const total = results.reduce((sum, row) => sum + (parseInt(Object.values(row)[1]) || 0), 0);
            insights.push(`Total count across all groups: ${total.toLocaleString()}`);
        }
        
        if (q.includes('avg') || q.includes('average')) {
            const avgValue = Object.values(results[0])[0];
            if (!isNaN(avgValue)) {
                insights.push(`Average value: ${parseFloat(avgValue).toLocaleString()}`);
            }
        }
        
        if (q.includes('group by') && results.length > 1) {
            insights.push(`Found ${results.length} distinct groups in your data`);
            
            // Find the group with highest value
            const valueCol = Object.keys(results[0])[1];
            if (valueCol && !isNaN(results[0][valueCol])) {
                const maxGroup = results.reduce((max, row) => 
                    (parseFloat(row[valueCol]) || 0) > (parseFloat(max[valueCol]) || 0) ? row : max
                );
                insights.push(`Highest value: ${Object.values(maxGroup)[0]} (${parseFloat(maxGroup[valueCol]).toLocaleString()})`);
            }
        }
        
        if (results.length === 1 && Object.keys(results[0]).length === 1) {
            insights.push(`Single result: ${Object.values(results[0])[0]}`);
        }
        
        return insights;
    }

    extractMetrics(results, columns) {
        const metrics = [];
        
        // If single row with numeric values, show as metrics
        if (results.length === 1) {
            const row = results[0];
            Object.entries(row).forEach(([key, value]) => {
                if (!isNaN(value) && value !== null) {
                    metrics.push({
                        label: key.replace(/_/g, ' ').toUpperCase(),
                        value: parseFloat(value).toLocaleString()
                    });
                }
            });
        }
        
        return metrics;
    }

    determineChartType(results, columns) {
        if (results.length < 2 || results.length > 50) return null;
        
        // Check if we have a good candidate for charting
        const hasStringColumn = columns.some(col => 
            results.some(row => isNaN(row[col]) && row[col] !== null)
        );
        const hasNumericColumn = columns.some(col => 
            results.some(row => !isNaN(row[col]) && row[col] !== null)
        );
        
        if (hasStringColumn && hasNumericColumn && columns.length === 2) {
            return {
                type: 'bar',
                labelColumn: columns[0],
                valueColumn: columns[1]
            };
        }
        
        return null;
    }

    createChart(results, config) {
        const ctx = document.getElementById('resultsChart').getContext('2d');
        
        const labels = results.map(row => row[config.labelColumn]);
        const data = results.map(row => parseFloat(row[config.valueColumn]) || 0);
        
        new Chart(ctx, {
            type: config.type,
            data: {
                labels: labels,
                datasets: [{
                    label: config.valueColumn.replace(/_/g, ' '),
                    data: data,
                    backgroundColor: 'rgba(102, 126, 234, 0.6)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    title: {
                        display: true,
                        text: `${config.valueColumn.replace(/_/g, ' ')} by ${config.labelColumn.replace(/_/g, ' ')}`
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    }

    formatCellValue(value) {
        if (value === null || value === undefined) return '';
        if (!isNaN(value) && value !== '' && !isNaN(parseFloat(value))) {
            return parseFloat(value).toLocaleString();
        }
        return value;
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