# AI Data Explorer

A client-side web application that allows users to upload datasets and explore them using natural language queries powered by browser-based AI. Perfect for GitHub Pages hosting!

## 🌟 Features

- **100% Client-Side**: Runs entirely in your browser - no server required!
- **GitHub Pages Ready**: Deploy directly to GitHub Pages with zero configuration
- **File Upload**: Support for CSV and Excel files (.xlsx, .xls)
- **Browser-Based AI**: Uses Transformers.js with CodeLlama for query generation
- **Natural Language Queries**: Ask questions in plain English about your data
- **Privacy First**: Your data never leaves your device
- **Real-time Results**: Instant SQL generation and data visualization
- **In-Memory Processing**: Data is stored temporarily in browser SQLite

## 🚀 Quick Start

### Option 1: GitHub Pages (Recommended)

1. Fork this repository
2. Go to Settings → Pages
3. Select "Deploy from a branch" and choose `main`
4. Your site will be available at `https://yourusername.github.io/ai-data-explorer`

### Option 2: Local Development

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ai-data-explorer.git
   cd ai-data-explorer
   ```

2. Serve the files locally:
   ```bash
   # Using Python
   python -m http.server 8000
   
   # Or using Node.js
   npx serve .
   
   # Or any other static file server
   ```

3. Open `http://localhost:8000` in your browser

## 📖 Usage

1. **Upload Data**: Drag and drop or click to upload a CSV or Excel file
2. **Wait for AI Model**: On first use, the AI model (~50MB) will download automatically
3. **Ask Questions**: Use the chat interface to ask questions like:
   - "Show me the first 10 rows"
   - "What's the average sales by region?"
   - "Find all records where price is greater than 100"
   - "Group by category and count the items"

4. **View Results**: The AI will generate SQL queries and display results in a table

## 💡 Example Questions

- "Show me the top 10 records"
- "What's the average of [column name]?"
- "Group the data by [column] and count"
- "Find records where [column] is greater than [value]"
- "Sort by [column] in descending order"
- "Show unique values in [column]"

## 🛠 Technical Details

- **Frontend**: Vanilla JavaScript with modern CSS
- **Database**: SQL.js (SQLite compiled to WebAssembly)
- **AI Model**: CodeLlama via Transformers.js (WebAssembly)
- **File Processing**: PapaParse for CSV, SheetJS for Excel
- **Hosting**: Static files only - works on any web server

## 🏗 Architecture

1. User uploads file → Browser parses and stores in WebAssembly SQLite
2. User asks question → Browser-based AI generates SQL query
3. Query executes in browser → Results displayed in table format

Everything happens client-side - no data transmission, maximum privacy!

## 🔧 Customization

The application uses a hybrid approach for query generation:

1. **AI-First**: Tries to use the CodeLlama model for intelligent query generation
2. **Pattern Fallback**: Falls back to pattern matching for common queries if AI fails
3. **Smart Patterns**: Recognizes keywords like "average", "count", "group by", etc.

You can extend the pattern matching in the `generateSQLWithPatterns()` method.

## 📱 Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support  
- **Safari**: Full support (iOS 16.4+)
- **Mobile**: Works on modern mobile browsers

## 🚨 Limitations

- **Model Size**: First load downloads ~50MB AI model (cached afterward)
- **Memory**: Large datasets (>100MB) may cause performance issues
- **AI Accuracy**: Query generation depends on model understanding
- **File Size**: Browser memory limits apply to uploaded files

## 🔒 Privacy & Security

- **No Data Transmission**: Everything runs locally in your browser
- **No Tracking**: No analytics, cookies, or external requests (except CDN libraries)
- **Temporary Storage**: Data is only stored in browser memory during session
- **Open Source**: Full transparency - inspect the code yourself

## 🚀 Deployment to GitHub Pages

1. Fork this repository
2. Enable GitHub Pages in repository settings
3. Choose "Deploy from a branch" and select `main`
4. Your site will be live at `https://yourusername.github.io/repository-name`

No build process needed - just static files!

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test locally
5. Submit a pull request

## 📄 License

MIT License - feel free to use this project for any purpose!

## 🙏 Acknowledgments

- [Transformers.js](https://huggingface.co/docs/transformers.js) for browser-based AI
- [SQL.js](https://sql.js.org/) for WebAssembly SQLite
- [PapaParse](https://www.papaparse.com/) for CSV parsing
- [SheetJS](https://sheetjs.com/) for Excel file support