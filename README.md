# AskTheDocs

> AI-powered documentation assistant that crawls and indexes documentation in real-time to provide accurate, hallucination-free answers.

AskTheDocs just add chatbot to all documentations by allowing you to attach any documentation URL and get instant, contextual answers backed by actual documentation content.

## Features

### Real-time Documentation Crawling

- **Intelligent Crawling**: Automatically discovers pages via sitemaps or HTML scraping
- **Progress Tracking**: Real-time crawling progress with Ably WebSocket updates

### Advanced Chat Interface

- **Multi-document Conversations**: Attach multiple documentation sources to a single chat
- **Streaming Responses**: Real-time answer generation with context snippets
- **Source Attribution**: Every answer includes links back to original documentation
- **Code Snippet Highlighting**: Syntax-highlighted code examples with copy functionality

### Intelligent Search & Retrieval

- **Vector Search**: Qdrant-powered semantic search across documentation
- **Smart Document Targeting**: Automatically identifies which docs are most relevant to queries
- **Context-aware Suggestions**: Provides alternative questions when no matches found
- **Comparison Mode**: Compare technologies side-by-side using their documentation

## Tech Stack

### Frontend

- **Next.js** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Ably** - Real-time WebSocket communication
- **React Syntax Highlighter** - Code syntax highlighting
- **Lucide React** - Modern icon library

### Backend & API

- **Next.js API Routes** - Server-side endpoints
- **OpenAI GPT-4** - LLM for answer generation
- **MongoDB** - Document database for sessions and metadata
- **Qdrant** - Vector database for embeddings
- **Inngest** - Background job processing
- **Firecrawl** - Premium web scraping service

### Authentication & Security

- **NextAuth.js** - Authentication framework
- **JWT** - Secure token-based auth
- **URL Validation** - Security checks for crawling targets

### Infrastructure

- **Vercel** - Free Deployment platform
- **Redis** - Caching layer
- **Ably** - Real-time messaging
- **Environment-based Configuration** - Secure credential management

## Quick Start

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/askthedocs.git
cd askthedocs
```

2. **Install dependencies**

```bash
npm install
# or
yarn install
```

3. **Set up environment variables**

```bash
cp .env.example .env.local
```

4. **Run the development server**

```bash
npm run dev
# or
yarn dev
```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

## Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/askthedocs
REDIS_URL=redis://localhost:6379

# Authentication
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-nextauth-secret-here
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key

# Vector Database
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=your-qdrant-api-key (optional for local)

# Real-time Communication
ABLY_API_KEY=your-ably-api-key

# Web Scraping
FIRECRAWL_API_KEY=your-firecrawl-api-key

# Background Jobs
INNGEST_EVENT_KEY=your-inngest-event-key
INNGEST_SIGNING_KEY=your-inngest-signing-key
```

### Required Services Setup

1. **MongoDB**: Set up a MongoDB instance (local or Atlas)
2. **Qdrant**: Run Qdrant locally or use Qdrant Cloud
3. **OpenAI**: Get API key from OpenAI platform
4. **Ably**: Create account for real-time features
5. **Firecrawl**: Optional premium scraping service

## Project Structure

```
askthedocs/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── api/                      # API endpoints
│   │   │   ├── auth/                 # Authentication routes
│   │   │   ├── chat/sessions/        # Chat session management
│   │   │   ├── docs/                 # Documentation endpoints
│   │   │   └── test/                 # Development utilities
│   │   ├── chat/[sessionId]/         # Chat session pages
│   │   ├── components/               # Reusable UI components
│   │   │   ├── auth/                 # Authentication components
│   │   │   ├── chat/                 # Chat interface components
│   │   │   ├── layout/               # Layout components
│   │   │   └── ui/                   # Generic UI components
│   │   └── providers/                # React context providers
│   ├── inngest/                      # Background job functions
│   │   ├── client.ts                 # Inngest client configuration
│   │   └── functions/                # Job definitions
│   │       ├── crawl-documentation.ts # Main crawling job
│   │       └── lib/                  # Crawling utilities
│   ├── lib/                          # Core business logic
│   │   ├── auth/                     # Authentication configuration
│   │   ├── cache/                    # Redis caching
│   │   ├── db/                       # Database operations
│   │   ├── services/                 # Business logic services
│   │   └── vector/                   # Vector database operations
│   ├── types/                        # TypeScript type definitions
│   └── utils/                        # Utility functions
├── public/                           # Static assets
└── README.md                         # Project documentation
```

## API Endpoints

### Authentication

- `GET /api/auth/session` - Get current user session
- `GET /api/auth/check` - Check authentication status
- `POST /api/auth/[...nextauth]` - NextAuth.js authentication

### Documentation Management

- `POST /api/docs` - Submit documentation URL for crawling
- `GET /api/docs` - List user's indexed documentation
- `GET /api/docs/ably-token` - Get real-time communication token

### Chat Sessions

- `GET /api/chat/sessions` - List user's chat sessions
- `POST /api/chat/sessions` - Create new chat session
- `GET /api/chat/sessions/[sessionId]` - Get specific session
- `POST /api/chat/sessions/[sessionId]/attach` - Attach documentation to session
- `POST /api/chat/sessions/[sessionId]/ask/stream` - Ask question (streaming)
- `POST /api/chat/sessions/[sessionId]/ask/compare` - Compare technologies

### Background Jobs

- `POST /api/inngest` - Inngest webhook endpoint

### Development & Testing

- `GET /api/test/crawl-status` - Check crawling status
- `GET /api/test/qdrant-setup` - Initialize Qdrant collection

## Usage

1. **Sign In**: Authenticate using Google or GitHub
2. **Add Documentation**: Enter a documentation URL (e.g., `https://nextjs.org/docs`)
3. **Wait for Indexing**: Watch real-time progress as the docs are crawled
4. **Ask Questions**: Start asking questions about the documentation
5. **Get Contextual Answers**: Receive answers with source links and code examples
6. **Compare Technologies**: Use the comparison feature to understand differences

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions:

1. Tell me directly on LinkedIn (https://www.linkedin.com/in/muhammad-ihsan-171672202/)

---
