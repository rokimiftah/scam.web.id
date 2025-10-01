# Travel Scam Alert - Everyone Should Be Safe Everywhere

A focused web scraping platform that collects scam-related comments and discussions from Reddit communities. Currently focused on extracting scam incident reports from various subreddit feeds using Firecrawl, with data stored in a Convex database for analysis and future expansion.

## 🎯 Overview

Travel Scam Alert - Everyone Should Be Safe Everywhere serves as a public service to help prevent financial loss and personal harm from fraudulent activities. The platform focuses on:

### Current Implementation

- **Reddit Scraping**: Automated collection of scam reports from Reddit communities
- **Firecrawl Integration**: Web scraping technology for structured data extraction
- **Data Storage**: Convex database for storing scraped scam comments and discussions
- **JSON Export**: Structured output for analysis and potential future visualization

### Future Vision (Not Yet Implemented)

- Travel scam detection and prevention
- Community-driven scam database
- AI-assisted scam pattern recognition
- Real-time scam monitoring from social media
- User authentication and collaborative reporting
- Interactive visualization and alerts

## ✨ Features

### ✅ Currently Implemented

- **Reddit Integration**: Automated collection from scam-related subreddits (`r/scams`, `r/travelscams`, `r/digitalnomad`, `r/solotravel`, `r/travel`)
- **Firecrawl Integration**: Advanced web scraping for structured data extraction
- **Convex Database**: Real-time database storage of scraped content
- **JSON Output**: Structured data export for further processing

### 🚧 Future Features (Planned)

- **Authentication System**: Secure login via Google/GitHub OAuth and password reset
- **AI Analysis**: LLM-powered scam pattern recognition and categorization
- **User Interface**: Modern React dashboard with data visualization
- **Interactive Globe**: 3D scam location mapping
- **Real-time Collaboration**: Multi-user scam reporting and verification

## 📋 Prerequisites

Before running this scraping application, ensure you have:

- Node.js 18+ or Bun runtime
- A Convex account and project
- Firecrawl API key for web scraping
- Git for version control

## 🚀 Installation & Setup

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd Travel Scam Alert - Everyone Should Be Safe Everywhere

# Using Bun (recommended)
bun install

# Or using npm
npm install --legacy-peer-deps
```

### 2. Environment Configuration

Copy the environment template and fill in your API keys:

```bash
cp .env.local.example .env.local
```

See the **Environment Variables** section below for detailed configuration.

### 3. Convex Setup

Initialize and start your Convex backend:

```bash
npx convex dev
```

### 4. Development Server

```bash
bun run dev
# or
npm run dev
```

### 5. Running the Scraper

Once the development servers are running:

```bash
# Run the Reddit scraper
npx convex run reddit:scrape

# Or trigger scraping via HTTP endpoint
curl -X POST http://localhost:8787/api/http/scrape/reddit \
  -H "Authorization: Bearer YOUR_SECRET_TOKEN"
```

## 🛣️ Currently Available

### Data Access

- **Convex Functions**: Direct database access for scraped data
- **HTTP Endpoints**: API endpoints for triggering scrapes (when implemented)

### Current Architecture

- **Backend**: Convex functions for data management and scraping
- **Database**: Convex for storing scraped Reddit comments
- **Scraping**: Firecrawl integration for Reddit data collection

> **Note**: Authentication and user-facing UI are planned for future implementation.

## 🔧 Environment Variables

Create a `.env.local` file and configure the following minimal variables:

### Convex Configuration

```bash
# Convex backend URL - get from https://dashboard.convex.dev
PUBLIC_CONVEX_URL=https://your-convex-deployment-url.convex.cloud
```

### Web Scraping

```bash
# Firecrawl API key - get from https://firecrawl.com
FIRECRAWL_API_KEY=your_firecrawl_api_key
```

> **Note**: Refer to `.env.local.example` for the complete template. Most environment variables are for future expansion.

## 🏗️ Current Architecture

### Backend (Convex Only)

```
/convex/
├── _generated/           # Auto-generated Convex types and APIs
├── schema.ts            # Database schema definition
├── scams.ts             # Scam data management
├── reddit.ts            # Reddit scraping functions
└── scrape/
    └── firecrawl.ts     # Firecrawl integration
```

### Frontend (Basic React)

```
/src/
├── app/
│   └── App.tsx          # Main app component
├── shared/
│   └── styles/          # Basic Tailwind CSS styling
└── index.tsx            # Application entry point
```

### Configuration

```
/rsbuild.config.ts        # Build configuration
/tsconfig.json           # TypeScript configuration
/biome.json             # Code formatting
/.env.local             # Environment variables
```

## 📡 Current API Endpoints

### Convex Functions

- `scams.getAll` - Retrieve all scraped scam comments from database
- `scams.getById` - Get specific scam comment by ID
- `reddit.scrape` - Trigger Reddit scraping to collect new scam comments

### Data Storage

- **Database**: Convex stores scraped data in JSON format
- **Schema**: Defined in `convex/schema.ts` for scraped comment structure
- **Export**: Data accessible via Convex query functions

## ⚙️ Configuration

For the current scraping implementation:

### Scraping Settings

- **Reddit Sources**: Configure target subreddits in `convex/reddit.ts`
- **Firecrawl Parameters**: Adjust scraping behavior in `convex/scrape/firecrawl.ts`
- **Data Filtering**: Modify what data gets extracted from Reddit comments

### Database Schema

- **Schema Definition**: Update data structure in `convex/schema.ts`
- **Index Configuration**: Add database indexes for better query performance

## 📊 Scraping Implementation

### Reddit Scraping

Current implementation uses Firecrawl to extract scam comments from Reddit communities:

- **Target Subreddits**: `r/scams`, `r/travelscams`, `r/digitalnomad`, `r/solotravel`, `r/travel`
- **Data Extraction**: Comment threads, user reports, timestamps, and metadata
- **Storage**: JSON formatted data stored in Convex database
- **Access**: Query through Convex functions for analysis

### Reddit Story Scraper

> **Note**: The repository references scripts that may not be included in this distribution.

Automated scam report collection from Reddit subreddits:

- **Sources**: `r/scams`, `r/travelscams`, `r/digitalnomad`, `r/solotravel`, `r/travel`
- **Method**: RSS feed parsing (no API key required)
- **Output**: Sanitized stories with keywords and metadata
- **Storage**: JSON files for import into the application

### Advanced HTML Scraping

For comprehensive story analysis with comments and pagination:

**Requirements**:

- Convex HTTP endpoints running (`npx convex dev`)
- Environment variables in shell:
  - `CONVEX_HTTP_URL=http://localhost:8787/api/http`
  - `INGEST_SECRET=your_shared_secret`
  - `PAGE_LIMIT=10` (optional, default: 10)
  - `COMMENTS_LIMIT=20` (optional, default: 20)
  - `THROTTLE_MS=700` (optional, default: 700ms)

**AI Analysis Configuration**:

- Set `OPENAI_API_KEY` in Convex environment
- Optional: `OPENAI_API_BASE`, `OPENAI_MODEL` (defaults to `gpt-4o-mini`)

## 🚀 Available Scripts

```bash
# Development
npm run dev              # Start React development server
npx convex dev           # Start Convex backend

# Building
npm run build            # Production build
npm run preview          # Preview production build
```

## 🤝 Contributing

We welcome contributions to improve scam detection and user safety! Here's how you can help:

### How to Contribute

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/your-feature-name`
3. **Commit** changes: `git commit -m 'Add some feature'`
4. **Push** to branch: `git push origin feature/your-feature-name`
5. **Open** a Pull Request

### Development Guidelines

- Use TypeScript for type safety
- Follow Biome formatting standards
- Add tests for new features
- Update documentation for API changes
- Respect rate limits when adding new data sources

### Reporting Issues

- Use the issue tracker for bugs and feature requests
- Include detailed reproduction steps
- Specify your environment (OS, browser, etc.)
- Add screenshots for UI issues

### Adding New Data Sources

When contributing new scraping sources:

- Ensure compliance with terms of service
- Implement rate limiting to prevent abuse
- Add appropriate error handling
- Include data sanitization
- Test with AI analysis pipeline

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🆘 Support & Contact

- **Issues**: [GitHub Issues](https://github.com/your-org/Travel Scam Alert - Everyone Should Be Safe Everywhere/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/Travel Scam Alert - Everyone Should Be Safe Everywhere/discussions)
- **Security**: For security vulnerabilities, please email security@Travel Scam Alert - Everyone Should Be Safe Everywhere

## 🙏 Acknowledgments

- **Convex**: Real-time database and authentication platform
- **Vercel**: Hosting and deployment platform
- **OpenAI**: AI analysis capabilities
- **Reddit Community**: Source of scam reports and user stories
- **Open Source Contributors**: Community improvements and bug fixes

---

> **Disclaimer**: This platform aggregates publicly available information to help prevent scams. While we strive for accuracy, always verify information through official channels before taking action.
