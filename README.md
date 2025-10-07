# Travel Scam Alert - Everyone Should Be Safe Everywhere

An interactive web platform that visualizes travel scams worldwide using AI-powered analysis, voice assistance, and real-time data from Reddit communities. The platform combines 3D globe visualization with intelligent voice queries to help travelers stay safe anywhere in the world.

## 🎯 Overview

Travel Scam Alert serves as a public service to help prevent financial loss and personal harm from travel-related fraudulent activities. The platform provides:

### Core Features

- **🌍 3D Interactive Globe**: Real-time visualization of scam hotspots across the world with risk-based color coding
- **🎤 AI Voice Assistant**: Natural conversation interface powered by VAPI to query scam data hands-free
- **🤖 AI Analysis**: LLM-powered scam pattern recognition, categorization, and prevention tips generation
- **📊 Real-time Statistics**: Live dashboard showing trending scams, high-risk locations, and community insights
- **🔐 Secure Authentication**: Google and GitHub OAuth integration for personalized experience
- **🗺️ Location Intelligence**: Smart geocoding and country mapping for accurate scam location tracking
- **📧 Email Alerts**: Automated prevention tips delivery for specific travel destinations

## ✨ Features

### ✅ Currently Implemented

#### 🌐 Visualization & Interface

- **3D Interactive Globe**: Real-time scam visualization using `react-globe.gl` with Three.js
- **Risk-based Color Coding**: Visual indicators (green/amber/red) based on scam frequency
- **Country Highlighting**: Click-to-focus on specific countries with detailed scam data
- **Responsive Design**: Mobile-friendly interface with device detection
- **Dark Theme**: Eye-friendly UI optimized for extended usage

#### 🎤 Voice Assistant (VAPI Integration)

- **Natural Language Queries**: Ask about scams in any country using voice
- **Real-time Data Retrieval**: Server-side tool calls for accurate scam information
- **Smart Country Mapping**: Handles country aliases (e.g., "Turkey" → "Türkiye")
- **Conversation History**: Visual transcript with user/assistant distinction
- **Processing Feedback**: Loading indicators during data fetching

#### 🤖 AI-Powered Analysis

- **Scam Categorization**: Automatic classification (accommodation, fake tickets, romance, etc.)
- **Warning Signal Detection**: Pattern recognition for common scam indicators
- **Prevention Tips Generation**: Context-aware safety recommendations
- **Transcript Cleaning**: LLM-powered conversation optimization
- **Risk Assessment**: Automated risk level calculation based on report frequency

#### 🔐 Authentication & User Management

- **OAuth Integration**: Google and GitHub login via Convex Auth
- **User Profiles**: Avatar upload, name management, and preferences
- **Session Management**: Secure token-based authentication
- **Profile Editing**: Real-time profile updates with validation

#### 📊 Data Management

- **Reddit Scraping**: Automated collection from travel and scam subreddits (`r/scams`, `r/travelscams`, `r/digitalnomad`, `r/solotravel`, `r/travel`)
- **Firecrawl Integration**: Advanced web scraping with pagination support
- **Convex Database**: Real-time NoSQL database with optimized indexes
- **Geocoding Service**: Automatic location resolution for scam reports
- **Location Statistics**: Aggregated data by country and city

#### 📧 Notifications & Communication

- **Email Integration**: Resend API for transactional emails
- **Prevention Tips Delivery**: Send country-specific safety tips via email
- **Authentication Emails**: Magic link and verification emails

### 🚧 Future Enhancements

- **Community Reporting**: User-submitted scam reports with verification
- **Multi-language Support**: Localization for global accessibility
- **Mobile Apps**: Native iOS and Android applications
- **Advanced Analytics**: Trend analysis and predictive modeling
- **Social Sharing**: Share scam alerts on social media

## 📋 Prerequisites

Before running this application, ensure you have:

- **Node.js 22+** or **Bun** runtime
- **Convex** account and project ([dashboard.convex.dev](https://dashboard.convex.dev))
- **Firecrawl API** key for web scraping ([firecrawl.com](https://firecrawl.dev))
- **VAPI** account and API keys for voice assistant ([vapi.ai](https://vapi.ai))
- **LLM API** access (OpenAI, Anthropic, or compatible)
- **OAuth Credentials** (Google and/or GitHub)
- **Resend API** key for email notifications ([resend.com](https://resend.com))
- **Git** for version control

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

## 🛣️ Application Routes

### Available Pages

- **`/`** - Main application with 3D globe and voice assistant
- **`/auth/signin`** - Authentication page (Google/GitHub OAuth)
- **`/auth/magic-link`** - Magic link verification page
- **`/privacy`** - Privacy policy
- **`/terms`** - Terms of service

### API Endpoints

- **`POST /api/http/vapi/tool-call`** - VAPI webhook for voice assistant tool calls
- **Convex Functions** - Real-time queries and mutations via Convex client

## 🔧 Environment Variables

Create a `.env.local` file with the following configuration:

### Required Variables

```bash
# Convex - Backend database and functions
PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud

# Authentication - OAuth providers
AUTH_GOOGLE_ID=your_google_client_id
AUTH_GOOGLE_SECRET=your_google_client_secret
AUTH_GITHUB_ID=your_github_client_id
AUTH_GITHUB_SECRET=your_github_client_secret

# AI/LLM - For scam analysis
LLM_API_KEY=your_openai_api_key
LLM_API_MODEL=gpt-4o-mini  # or your preferred model
LLM_API_URL=https://api.openai.com/v1  # optional, for custom endpoints

# VAPI - Voice assistant
PUBLIC_VAPI_PUBLIC_KEY=your_vapi_public_key
PUBLIC_VAPI_ASSISTANT_ID=your_vapi_assistant_id  # optional, uses inline config if not set

# Email - Notifications
RESEND_API_KEY=your_resend_api_key

# Web Scraping - Data collection
FIRECRAWL_API_KEY=your_firecrawl_api_key

# Application
SITE_URL=https://yoursite.com  # Your deployed URL
```

### Optional Variables

```bash
# Mapbox - For advanced mapping features (not currently used)
MAPBOX_ACCESS_TOKEN=your_mapbox_token

# Self-hosted Convex (advanced)
CONVEX_SELF_HOSTED_URL=
CONVEX_SELF_HOSTED_ADMIN_KEY=
```

> **Note**: See `.env.local.example` for the complete template with all available options.

## 🏗️ Architecture

### Backend (Convex)

```
/convex/
├── _generated/          # Auto-generated Convex types and APIs
├── schema.ts            # Database schema (scamStories, locationStats, users)
├── scams.ts             # Scam queries and mutations
├── users.ts             # User management functions
├── auth.ts              # Authentication configuration
├── auth.config.ts       # OAuth provider setup
├── aiAnalyzer.ts        # LLM-powered scam analysis
├── geocoding.ts         # Location resolution service
├── reddit.ts            # Reddit scraping functions
├── vapiTools.ts         # Voice assistant tool handlers
├── http.ts              # HTTP endpoints (VAPI webhook)
├── resend/              # Email templates and functions
└── scrape/
    └── firecrawl.ts     # Web scraping integration
```

### Frontend (React + TypeScript)

```
/src/
├── pages/
│   ├── App/             # Main application with globe
│   ├── Auth/            # Authentication pages
│   ├── Privacy/         # Privacy policy
│   └── Terms/           # Terms of service
├── features/
│   ├── auth/            # Auth components (UserMenu, EditProfile)
│   └── voice/           # Voice assistant integration
├── shared/
│   ├── components/      # Reusable UI components
│   └── styles/          # Global styles and Tailwind config
└── index.tsx            # Application entry point
```

### Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS
- **Build Tool**: Rsbuild (Rspack-based)
- **Backend**: Convex (serverless functions + database)
- **3D Visualization**: react-globe.gl + Three.js
- **Voice AI**: VAPI (voice assistant platform)
- **LLM**: OpenAI GPT-4o-mini (or compatible)
- **Authentication**: Convex Auth (OAuth + Magic Links)
- **Email**: Resend API
- **Web Scraping**: Firecrawl API

## 📡 API Reference

### Convex Queries (Client-side)

```typescript
// Get scam stories with pagination
const stories = useQuery(api.scams.getScamStories, { limit: 100 });

// Get location statistics
const stats = useQuery(api.scams.getLocationStats, {});

// Get trending scams
const trending = useQuery(api.scams.getTrendingScams, {});

// Get current user
const user = useQuery(api.users.getCurrentUser);
```

### Convex Actions (Server-side)

```typescript
// Send prevention tips email
await sendPreventionTipsEmailAction({ country: "Singapore" });

// Clean AI transcript
const cleaned = await cleanTranscriptAction({ transcript: "..." });

// Trigger Reddit scraping
await scrapeAction({ subreddit: "scams" });
```

### HTTP Endpoints

- **`POST /api/http/vapi/tool-call`** - VAPI webhook for voice assistant tool execution
  - Handles `queryScamsByLocation` tool calls
  - Returns scam data for requested country
  - Supports country alias mapping

## ⚙️ Configuration

### VAPI Voice Assistant Setup

**Option 1: Dashboard Assistant (Recommended)**

1. Create assistant at [vapi.ai/dashboard](https://vapi.ai/dashboard)
2. Configure tool `queryScamsByLocation` with:
   - Server URL: `https://yoursite.com/api/http/vapi/tool-call`
   - Request Start Message: "Let me check the scam data for that location..."
3. Set `PUBLIC_VAPI_ASSISTANT_ID` in `.env.local`

**Option 2: Inline Configuration**

- Leave `PUBLIC_VAPI_ASSISTANT_ID` empty
- Configuration in `VoiceAssistantIntegrated.tsx` will be used
- Automatically includes tool definitions and system prompts

### Database Schema Customization

**Main Tables:**

- `scamStories` - Individual scam reports with AI analysis
- `locationStats` - Aggregated statistics by location
- `users` - User profiles and authentication

**Adding Indexes:**

```typescript
// In convex/schema.ts
export default defineSchema({
  scamStories: defineTable({
    // ... fields
  })
    .index("by_country", ["country"])
    .index("by_processed", ["isProcessed"]),
});
```

### Scraping Configuration

**Reddit Sources:**

Edit `convex/reddit.ts` to add/remove subreddits:

```typescript
const SUBREDDITS = ["scams", "travelscams", "digitalnomad", "solotravel", "travel"];
```

**AI Analysis:**

Configure LLM behavior in `convex/aiAnalyzer.ts`:

- Adjust prompts for better categorization
- Modify warning signal detection patterns
- Customize prevention tips generation

## 📊 Data Collection

### Reddit Scraping

**Automated Collection:**

```bash
# Trigger scraping via Convex CLI
npx convex run reddit:scrapeRedditStories

# Or via Convex dashboard: Functions -> reddit:scrapeRedditStories -> Run
```

**Process Flow:**

1. Firecrawl scrapes target subreddits
2. Raw data stored in Convex
3. AI analyzer processes each story:
   - Categorizes scam type
   - Extracts warning signals
   - Generates prevention tips
   - Calculates risk level
4. Geocoding resolves locations
5. Statistics aggregated by country

**Monitored Subreddits:**

- `r/scams` - General scam reports
- `r/travelscams` - Travel-specific scams
- `r/digitalnomad` - Remote work scams
- `r/solotravel` - Solo traveler experiences
- `r/travel` - General travel discussions

### Manual Data Import

Import existing scam data:

```bash
# Import from JSON file
npx convex run scams:importFromJson --jsonFile ./data/scams.json
```

## 🚀 Development Scripts

```bash
# Development
npm run dev              # Start frontend dev server (port 3000)
npx convex dev           # Start Convex backend (port 8787)

# Building
npm run build            # Production build
npm run preview          # Preview production build

# Code Quality
npm run typecheck        # TypeScript type checking
npm run lint             # Biome linting + typecheck
npm run format:biome     # Auto-format code with Biome

# Database
npx convex dashboard      # Open Convex dashboard
npx convex deploy        # Deploy to production
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

- **TypeScript**: Use strict typing for all new code
- **Code Style**: Follow Biome formatting (run `npm run format:biome`)
- **Testing**: Run `npm run typecheck` before committing
- **Documentation**: Update README and inline comments for API changes
- **Commit Messages**: Use conventional commits (e.g., `feat:`, `fix:`, `docs:`)
- **Rate Limits**: Respect API rate limits when adding data sources

### Areas for Contribution

- **🌐 Frontend**: Improve UI/UX, add visualizations, enhance accessibility
- **🤖 AI Analysis**: Improve scam detection algorithms and categorization
- **📊 Data Sources**: Add new scam report sources (with proper attribution)
- **🎤 Voice Assistant**: Enhance conversation flows and add new capabilities
- **🌍 Localization**: Add multi-language support
- **📱 Mobile**: Build native iOS/Android apps
- **📖 Documentation**: Improve guides, tutorials, and API docs

### Reporting Issues

- Use GitHub Issues for bugs and feature requests
- Provide detailed reproduction steps
- Include environment details (OS, browser, Node version)
- Add screenshots or screen recordings for UI issues
- Check existing issues before creating new ones

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## 🆘 Support

- **Issues**: Report bugs and request features via [GitHub Issues](https://github.com/your-org/scam.web.id/issues)
- **Security**: Report security vulnerabilities privately to the maintainers
- **Community**: Join discussions and share ideas with other contributors

## 🙏 Acknowledgments

### Technologies

- **[Convex](https://convex.dev)** - Real-time database, authentication, and serverless functions
- **[VAPI](https://vapi.ai)** - Voice AI assistant platform
- **[Firecrawl](https://firecrawl.com)** - Web scraping and data extraction
- **[OpenAI](https://openai.com)** - LLM for scam analysis and categorization
- **[Resend](https://resend.com)** - Email delivery service
- **[React Globe.gl](https://github.com/vasturiano/react-globe.gl)** - 3D globe visualization
- **[Three.js](https://threejs.org)** - 3D graphics library
- **[Rsbuild](https://rsbuild.dev)** - Fast Rust-based build tool

### Data Sources

- **Reddit Communities**: Volunteer-contributed scam reports from travel and safety subreddits
- **Community Contributors**: Thank you to everyone who shares their experiences to help others stay safe

### Open Source

This project is built with and inspired by the open source community. Special thanks to all contributors who help improve scam detection and prevention.

---

## ⚠️ Disclaimer

> **Important**: This platform aggregates and analyzes publicly available information to help prevent scams. While we strive for accuracy and comprehensiveness:
>
> - Information may be incomplete or outdated
> - Always verify through official channels before taking action
> - Use your judgment and common sense when traveling
> - Report scams to local authorities when appropriate
> - This is not legal or financial advice
>
> **Stay safe, stay informed, and help others by sharing your experiences responsibly.**
