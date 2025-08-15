// inngest/functions/lib/firecrawl-client.ts

interface ApiKey {
  key: string;
  isExhausted: boolean;
  usage: number;
}

interface FirecrawlResponse {
  success: boolean;
  data?: {
    markdown?: string;
    content?: string;
    html?: string;
    metadata?: {
      title?: string;
      description?: string;
      sourceURL?: string;
    };
  };
  error?: string;
}

class FirecrawlClient {
  private apiKeys: ApiKey[] = [
    { key: process.env.FIRECRAWL_KEY_1 || '', isExhausted: false, usage: 0 },
    { key: process.env.FIRECRAWL_KEY_2 || '', isExhausted: false, usage: 0 },
    { key: process.env.FIRECRAWL_KEY_3 || '', isExhausted: false, usage: 0 },
  ].filter(k => k.key); // Remove empty keys
  
  private currentKeyIndex = 0;

  private getNextApiKey(): ApiKey | null {
    const availableKeys = this.apiKeys.filter(k => !k.isExhausted);
    
    if (availableKeys.length === 0) {
      console.log('All Firecrawl API keys exhausted');
      return null;
    }
    
    // Round-robin through available keys
    const keyIndex = this.currentKeyIndex % availableKeys.length;
    const selectedKey = availableKeys[keyIndex];
    this.currentKeyIndex++;
    
    return selectedKey;
  }

  private markKeyExhausted(apiKey: string) {
    const key = this.apiKeys.find(k => k.key === apiKey);
    if (key) {
      key.isExhausted = true;
      console.log(`API key ending in ...${apiKey.slice(-4)} marked as exhausted`);
    }
  }

  async scrapePage(url: string): Promise<{ content: string; method: 'firecrawl' | 'manual' } | null> {
    // Try Firecrawl first
    const apiKey = this.getNextApiKey();
    
    if (!apiKey) {
      // All keys exhausted, use manual fetch
      console.log(`Using manual fetch for ${url} (all API keys exhausted)`);
      return this.manualFetch(url);
    }

    try {
      console.log(`Scraping ${url} with Firecrawl (key ${this.apiKeys.indexOf(apiKey) + 1})`);
      
      const response = await fetch('https://api.firecrawl.dev/v0/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['markdown', 'html'],
        }),
      });

      if (response.status === 429) {
        // Rate limit hit
        console.log(`Rate limit hit for API key ${this.apiKeys.indexOf(apiKey) + 1}`);
        this.markKeyExhausted(apiKey.key);
        // Try again with next key
        return this.scrapePage(url);
      }

      if (!response.ok) {
        console.error(`Firecrawl error for ${url}: ${response.status}`);
        // Try with next key or fallback
        return this.scrapePage(url);
      }

      const data: FirecrawlResponse = await response.json();
      
      if (!data.success || !data.data) {
        console.error(`Firecrawl failed for ${url}:`, data.error);
        return this.manualFetch(url);
      }

      apiKey.usage++;
      
      // Prefer markdown, fallback to HTML
      const content = data.data.markdown || data.data.html || data.data.content || '';
      
      return { content, method: 'firecrawl' };
      
    } catch (error) {
      console.error(`Firecrawl request failed for ${url}:`, error);
      // Fallback to manual fetch
      return this.manualFetch(url);
    }
  }

  private async manualFetch(url: string): Promise<{ content: string; method: 'manual' } | null> {
    try {
      console.log(`Manual fetch for ${url}`);
      const response = await fetch(url);
      
      if (!response.ok) {
        console.error(`Manual fetch failed for ${url}: ${response.status}`);
        return null;
      }
      
      const content = await response.text();
      return { content, method: 'manual' };
      
    } catch (error) {
      console.error(`Manual fetch error for ${url}:`, error);
      return null;
    }
  }

  getStats() {
    return {
      totalKeys: this.apiKeys.length,
      exhaustedKeys: this.apiKeys.filter(k => k.isExhausted).length,
      usage: this.apiKeys.map((k, i) => ({
        key: `Key ${i + 1}`,
        usage: k.usage,
        exhausted: k.isExhausted
      }))
    };
  }
}

export const firecrawlClient = new FirecrawlClient();