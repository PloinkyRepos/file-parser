# Free Web Search APIs for AI Agents

Research into web search providers available for AI coding agents and applications, with a focus on free and free-tier options.

---

## Table of Contents

- [Provider Comparison](#provider-comparison)
- [Completely Free / Self-Hosted](#completely-free--self-hosted)
- [Generous Free Tiers (No Credit Card)](#generous-free-tiers-no-credit-card)
- [Moderate Free Tiers](#moderate-free-tiers)
- [One-Time Credits Only](#one-time-credits-only)
- [No Free Tier](#no-free-tier)
- [What Coding Agents Use](#what-coding-agents-use)
- [Recommendations](#recommendations)

---

## Provider Comparison

| Provider | Free Allowance | Recurring? | API Key? | Best For |
|----------|---------------|------------|----------|----------|
| **SearXNG** | Unlimited | Yes (self-hosted) | No | Full control, privacy |
| **Stract** | Unlimited | Yes (self-hosted) | No | Independent index |
| **DuckDuckGo** | Unlimited | Yes | No | Quick fallback, no setup |
| **Gemini (Google)** | 5,000/month | Yes | Yes | Most generous official tier |
| **Google Custom Search** | 100/day (~3,000/mo) | Yes | Yes | Real Google results (sunsetting 2027) |
| **WebSearchAPI.ai** | 2,000/month | Yes | Yes | LLM/RAG applications |
| **Tavily** | 1,000/month | Yes | Yes | AI agent integration |
| **Exa** | ~1,000/month | Yes | Yes | Neural search, content extraction |
| **LangSearch** | Free for individuals | Yes | Yes | Hybrid keyword + vector search |
| **Brave** | ~1,000/month ($5 credit) | Yes | Yes | Structured results, LLM context mode |
| **SerpAPI** | 250/month | Yes | Yes | Multi-engine (Google, Bing, Yahoo...) |
| **You.com** | ~20,000 ($100 credit) | No | Yes | High accuracy, full page content |
| **Parallel AI** | 16,000 | No | Yes | AI-optimized excerpts |
| **Jina AI** | 10M tokens | No | Optional | Search + content extraction in one call |
| **Serper** | 2,500 | No | Yes | Live Google results |
| **Firecrawl** | 500 pages | No | Yes | Structured scraping |

---

## Completely Free / Self-Hosted

### SearXNG

- **URL:** https://searxng.org
- **Cost:** Free and unlimited (open-source, self-hosted)
- **API Key:** No
- **License:** AGPL

Metasearch engine aggregating results from 70+ backends including Google, Bing, DuckDuckGo, Brave, Wikipedia, and Startpage. Returns JSON via `/search?format=json`. Docker deployment available. Actively maintained. Integrated with LiteLLM, Open WebUI, and other AI agent frameworks.

**Pros:** No quotas, no rate limits, full privacy, maximum flexibility.
**Cons:** Requires hosting infrastructure. Quality depends on upstream engines. Upstream engines may rate-limit your instance.

### Stract

- **URL:** https://stract.com | https://github.com/StractOrg/stract
- **Cost:** Free (open-source, self-hosted)
- **API Key:** No (self-hosted)
- **License:** AGPL-3.0

Independent search engine with its own web crawler and index (not a metasearch engine). Privacy-focused, no tracking. Funded by NLnet/EU grants. Features an "Optics" system for customizable result filtering.

**Pros:** Fully independent index, no upstream dependencies.
**Cons:** Smaller index than commercial engines. Resource-intensive to self-host.

### Marginalia Search

- **URL:** https://marginalia-search.com | https://github.com/MarginaliaSearch/MarginaliaSearch
- **Cost:** Free for non-commercial use
- **API Key:** Required for API access
- **License:** AGPL-3.0

Independent index that deliberately favors text-heavy, small, and personal websites over commercial content. Useful for niche/indie web content discovery rather than general-purpose search.

### DuckDuckGo (Unofficial)

- **URL:** https://github.com/deedy5/duckduckgo_search
- **Cost:** Free, unlimited (unofficial scraping)
- **API Key:** No

No official API exists. The `duckduckgo-search` library scrapes DuckDuckGo's public endpoints. No documented hard quota, but undocumented rate limits exist (HTTP 202 errors under heavy use).

**Pros:** Zero setup, no API key, no cost.
**Cons:** Unofficial and legally ambiguous for commercial use. Rate limiting under heavy load. No availability guarantees. Marked "for educational purposes only."

---

## Generous Free Tiers (No Credit Card)

### Gemini API (Google Search Grounding)

- **URL:** https://ai.google.dev
- **Free Tier:** 5,000 grounded prompts/month (Flash Preview); 500 requests/day (2.5 Flash)
- **API Key:** Yes (Google AI API key)

The most generous official free tier. Uses Google Search grounding to provide AI-synthesized answers with citations. You are only billed when a prompt returns web results containing at least one grounding support URL. Lower rate limits (RPM/RPD) than paid tier.

**Used by:** Gemini CLI (built-in), OpenClaw (as a provider option).

### Tavily

- **URL:** https://tavily.com
- **Free Tier:** 1,000 credits/month (1 credit = 1 basic search, 2 = advanced search)
- **API Key:** Yes

Purpose-built for AI agents. Supports search depth (basic/advanced), topic filtering (general/news/finance), time ranges, and domain include/exclude filters. Well-documented with broad framework support.

**Used by:** OpenClaw (as a provider option). Available as MCP server for most coding agents.

### Exa

- **URL:** https://exa.ai
- **Free Tier:** ~1,000 credits/month
- **API Key:** Yes

Neural search engine with content extraction capabilities (highlights, full text, summaries). Supports search types: auto, neural, fast, deep. Returns clean content suitable for LLM consumption.

**Used by:** Cursor (built-in), Windsurf (likely), OpenCode (built-in via hosted MCP), OpenClaw (as a provider option).

### LangSearch

- **URL:** https://langsearch.com
- **Free Tier:** Free for individuals and small teams
- **API Key:** Yes

Hybrid keyword + vector search across billions of web documents. Returns long-text summaries with markdown formatting. Integrates with Coze, Dify, Wordware, GLIF. POST endpoint with freshness filters, summary toggle, and up to 10 results.

### WebSearchAPI.ai

- **URL:** https://websearchapi.ai
- **Free Tier:** 2,000 credits/month
- **API Key:** Yes

Designed specifically for LLM/RAG applications. Includes content extraction (1 credit per 10 extractions). Localization support for different countries/languages.

### You.com

- **URL:** https://you.com/apis
- **Free Tier:** $100 in credits (~20,000 searches, one-time)
- **API Key:** Yes

Ranked highly for accuracy in independent benchmarks. Returns up to 100 results per call with full page content included. Offers Web Search API, Research API (deep search with citations), and Contents API.

### Jina AI

- **URL:** https://jina.ai/reader/
- **Free Tier:** 10M tokens for new accounts; 500 RPM Reader, 100 RPM Search
- **API Key:** Optional (not needed for basic Reader at 20 RPM)

Combined search + content extraction in one call. `s.jina.ai` returns top 5 results with full page content as clean markdown. `r.jina.ai` converts any URL to LLM-friendly markdown. Token-based billing (only successful requests charged).

---

## Moderate Free Tiers

### Brave Search

- **URL:** https://brave.com/search/api/
- **Free Tier:** $5 monthly credit (~1,000 queries/month)
- **API Key:** Yes
- **Requirement:** Must attribute Brave Search in your project

Structured results with snippets. Supports country, language, freshness, and date range filters. Has an LLM context mode (`mode: "llm-context"`) that returns pre-processed results optimized for language models.

**Used by:** Claude Code (server-side, via Anthropic), OpenClaw (default provider).

### SerpAPI

- **URL:** https://serpapi.com
- **Free Tier:** 250 searches/month
- **API Key:** Yes

The broadest multi-engine support: Google, Bing, DuckDuckGo, Yahoo, Yandex, YouTube, Amazon, eBay, and more. Only successful searches count. Includes ZeroTrace Mode for privacy.

### Google Custom Search JSON API

- **URL:** https://developers.google.com/custom-search/v1/overview
- **Free Tier:** 100 queries/day (~3,000/month)
- **API Key:** Yes (Google Cloud API key + Programmable Search Engine ID)

Real Google results in JSON format. Supports image search. Well-documented.

**Warning:** Being sunset. Existing users must migrate by January 1, 2027. Not recommended for new projects.

### Serper

- **URL:** https://serper.dev
- **Free Tier:** 2,500 queries (one-time, expires after 6 months)
- **API Key:** Yes

Scrapes live Google results. Very fast (1-2 second responses). Returns organic results, knowledge graph, images, news, places, videos, shopping, scholar, patents, and autocomplete.

**Used by:** Continue.dev (`@google` context provider).

### Parallel AI

- **URL:** https://parallel.ai
- **Free Tier:** 16,000 search requests (one-time)
- **API Key:** Yes

Search API with AI-optimized excerpts, Task API for deep research, and Extract API for URL-to-markdown. Built specifically for AI agents. MCP server available.

### Grok / xAI

- **URL:** https://docs.x.ai
- **Free Tier:** $25 signup credit (one-time); +$150/month if opted into data sharing program
- **API Key:** Yes

AI-synthesized answers with citations via xAI web grounding. The ongoing $150/month credit requires agreeing to let xAI use your API traffic for training.

**Used by:** OpenClaw (as a provider option).

---

## One-Time Credits Only

| Provider | Credits | Notes |
|----------|---------|-------|
| **Firecrawl** (firecrawl.dev) | 500 pages lifetime | Structured scraping. Testing/prototyping only. |
| **SearchAPI.io** (searchapi.io) | 100 requests | 40+ platforms (Google, Bing, LinkedIn, TikTok...) |
| **SearchCans** (searchcans.com) | 100 credits | Combined SERP + URL-to-markdown. Valid 1 year. |
| **LinkUp** (linkup.so) | ~5 EUR/month | Fast retrieval + deep research modes. |
| **HasData** (hasdata.com) | 1,000 credits on signup | Google SERP data. 10 credits per request. |

---

## No Free Tier

| Provider | Starting Cost | Notes |
|----------|--------------|-------|
| **Perplexity API** | Pay-as-you-go ($1-15/M tokens) | $5/month credit if Perplexity Pro subscriber ($20/mo) |
| **Kimi / Moonshot** | $1 minimum recharge | Very cheap ($0.005/search call) but no free option |
| **Kagi API** | $25/1,000 queries | Closed beta. No free tier. |
| **Yandex Search API** | $0.21-4.00/1K requests | Best for Russian/Turkish content. No free tier. |
| **Bing Web Search API** | **Retired Aug 2025** | Replaced by Azure AI Foundry grounding. |

---

## What Coding Agents Use

### Built-in (No User Setup)

| Agent | Provider | Free to User? |
|-------|----------|--------------|
| Claude Code | Brave Search (server-side) | Included in subscription; $10/1K on API |
| Codex (OpenAI) | OpenAI proprietary web index | Yes (included) |
| Gemini CLI | Google Search (grounding) | Yes (included with Gemini API free tier) |
| GitHub Copilot | Bing / model-native (transitioning) | Yes (included in subscription) |
| Cursor | Exa AI | Yes (included in subscription) |
| Windsurf | Undisclosed (likely Exa-related) | Yes (included in subscription) |
| OpenCode | Exa AI (hosted MCP) | Yes, no API key needed |

### Configurable

| Agent | Provider(s) | Notes |
|-------|-------------|-------|
| OpenClaw (Roo Code) | 9 providers (Brave default) | DuckDuckGo is key-free fallback |
| Continue.dev | Serper (@google) / proxy (@web) | @web is free; @google needs free Serper key |
| Cline | Proprietary backend | Requires paid Cline credits; otherwise MCP |

### No Built-in Search

| Agent | Alternative |
|-------|------------|
| Aider | URL scraping only (`/web <url>`) |
| Augment Code | MCP servers (Google scraping, DuckDuckGo, Brave) |
| Kilo Code | MCP servers only |
| Amp (Sourcegraph) | Code search only (Librarian) |

### Key Patterns

- **Exa AI** is the most popular among IDE-based agents (Cursor, Windsurf, OpenCode)
- **Big players use their own infrastructure** -- OpenAI (proprietary index), Google (Google Search), Microsoft/Copilot (Bing)
- **Brave Search** powers Claude Code via Anthropic's server-side integration
- **MCP servers** are the universal escape hatch for agents without built-in search

---

## Recommendations

### For Personal Projects / Prototyping

1. **Tavily** (1,000/month free) -- easiest setup, purpose-built for AI agents
2. **Gemini** (5,000/month free) -- most generous, but returns AI-synthesized results rather than raw links
3. **DuckDuckGo** (unlimited, no key) -- zero friction but unreliable under load

### For Production / Higher Volume

1. **SearXNG** (self-hosted) -- unlimited, no API costs, aggregates multiple engines
2. **Jina AI** -- generous token allowance, combined search + extraction
3. **You.com** -- $100 credit goes far, high-quality results with full content

### For Maximum Coverage (Multiple Providers)

Use OpenClaw's approach: configure a primary provider (Tavily or Brave) with DuckDuckGo as a key-free fallback. Add SearXNG self-hosted for unlimited backup.

---

*Research conducted March 2026. Pricing and availability subject to change.*
