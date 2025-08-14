// inngest/functions/lib/sitemap-discovery.ts

export async function discoverViaSitemap(baseUrl: string): Promise<string[]> {
  const possibleSitemaps = [
    '/sitemap.xml',
    '/sitemap_index.xml',
    '/sitemap.txt',
    '/docs/sitemap.xml',
    '/api/sitemap.xml',
    '/sitemap',
  ];
  
  for (const path of possibleSitemaps) {
    try {
      const sitemapUrl = new URL(path, baseUrl).href;
      console.log(`Trying sitemap: ${sitemapUrl}`);
      
      const response = await fetch(sitemapUrl);
      if (!response.ok) continue;
      
      const content = await response.text();
      
      // XML sitemap
      if (content.includes('<urlset') || content.includes('<sitemapindex')) {
        // Handle sitemap index (contains multiple sitemaps)
        if (content.includes('<sitemapindex')) {
          const sitemapUrls = [...content.matchAll(/<loc>(.*?)<\/loc>/g)]
            .map(match => match[1]);
          
          let allUrls: string[] = [];
          for (const nestedSitemapUrl of sitemapUrls) {
            try {
              const nestedResponse = await fetch(nestedSitemapUrl);
              if (nestedResponse.ok) {
                const nestedContent = await nestedResponse.text();
                const urls = [...nestedContent.matchAll(/<loc>(.*?)<\/loc>/g)]
                  .map(match => match[1]);
                allUrls = allUrls.concat(urls);
              }
            } catch (e) {
              console.error(`Failed to fetch nested sitemap: ${nestedSitemapUrl}`);
            }
          }
          
          return filterDocumentationUrls(allUrls);
        }
        
        // Regular sitemap
        const urls = [...content.matchAll(/<loc>(.*?)<\/loc>/g)]
          .map(match => match[1]);
        
        return filterDocumentationUrls(urls);
      }
      
      // Text sitemap (one URL per line)
      if (!content.includes('<')) {
        const urls = content.split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('http'));
        
        return filterDocumentationUrls(urls);
      }
    } catch (e) {
      console.error(`Failed to fetch sitemap from ${path}:`, e);
      continue;
    }
  }
  
  console.log('No sitemap found, will fallback to HTML scraping');
  return [];
}

function filterDocumentationUrls(urls: string[]): string[] {
  const foreignLanguagePatterns = [
    '/zh-cn/', '/zh-tw/', '/ja/', '/ko/', '/es/', '/fr/',
    '/de/', '/ru/', '/pt/', '/it/', '/ar/', '/hi/',
    '/nl/', '/pl/', '/tr/', '/vi/', '/id/', '/th/',
    '/cs/', '/da/', '/fi/', '/el/', '/he/', '/hu/',
    '/no/', '/ro/', '/sk/', '/sv/', '/uk/', '/bg/',
  ];
  
  return urls.filter(url => {
    const lower = url.toLowerCase();
    
    // Skip foreign languages
    if (foreignLanguagePatterns.some(pattern => lower.includes(pattern))) {
      return false;
    }
    
    // Skip non-documentation pages
    if (
      lower.includes('/blog') ||
      lower.includes('/news') ||
      lower.includes('/community') ||
      lower.includes('/about') ||
      lower.includes('/careers') ||
      lower.includes('/privacy') ||
      lower.includes('/terms') ||
      lower.includes('/signin') ||
      lower.includes('/login') ||
      lower.includes('/register')
    ) {
      return false;
    }
    
    // Include documentation-like URLs
    return (
      lower.includes('/docs') ||
      lower.includes('/guide') ||
      lower.includes('/api') ||
      lower.includes('/reference') ||
      lower.includes('/tutorial') ||
      lower.includes('/manual') ||
      lower.includes('/learn') ||
      lower.includes('/documentation') ||
      lower.includes('/getting-started') ||
      lower.includes('/examples')
    );
  });
}

// Fallback HTML discovery if no sitemap
export async function discoverViaHtmlScraping(url: string): Promise<string[]> {
  const baseUrl = new URL(url);
  const visited = new Set<string>();
  const toVisit = [url];
  const foundPages: string[] = [];
  const maxPages = 50;
  
  while (toVisit.length > 0 && foundPages.length < maxPages) {
    const currentUrl = toVisit.shift()!;
    if (visited.has(currentUrl)) continue;
    visited.add(currentUrl);
    
    try {
      const response = await fetch(currentUrl);
      const html = await response.text();
      
      const linkRegex = /href="([^"#]+)"/gi;
      const matches = [...html.matchAll(linkRegex)];
      
      for (const match of matches) {
        let link = match[1];
        
        if (link.startsWith("/")) {
          link = `${baseUrl.origin}${link}`;
        } else if (!link.startsWith("http")) {
          const currentBase = currentUrl.substring(0, currentUrl.lastIndexOf("/"));
          link = `${currentBase}/${link}`;
        }
        
        try {
          const linkUrl = new URL(link);
          if (linkUrl.origin !== baseUrl.origin) continue;
          
          const pathname = linkUrl.pathname.toLowerCase();
          const isDocLike = 
            pathname.includes("/docs") ||
            pathname.includes("/guide") ||
            pathname.includes("/api") ||
            pathname.includes("/reference");
          
          if (isDocLike && !visited.has(link) && !toVisit.includes(link)) {
            toVisit.push(link);
          }
        } catch {
          // Invalid URL
            console.warn(`Invalid URL found in HTML: ${link}`);
        }
      }
      
      foundPages.push(currentUrl);
    } catch (error) {
      console.error(`Failed to fetch ${currentUrl}:`, error);
    }
  }
  
  return filterDocumentationUrls(foundPages);
}