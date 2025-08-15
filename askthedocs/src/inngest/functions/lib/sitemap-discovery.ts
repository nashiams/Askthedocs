export async function discoverViaSitemap(baseUrl: string): Promise<string[]> {
  const possibleSitemaps = [
    '/sitemap.xml',
    '/sitemap_index.xml',
    '/sitemap.txt',
    '/docs/sitemap.xml',
    '/api/sitemap.xml',
    '/sitemap',
    '/sitemap-0.xml',
  ];
  
  // Always include the input URL itself
  const discoveredUrls = new Set<string>([baseUrl]);
  
  // Try sitemap discovery first
  for (const path of possibleSitemaps) {
    try {
      const sitemapUrl = new URL(path, baseUrl).href;
      console.log(`Trying sitemap: ${sitemapUrl}`);
      
      const response = await fetch(sitemapUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Documentation-Bot/1.0)'
        }
      });
      if (!response.ok) continue;
      
      const content = await response.text();
      
      // XML sitemap
      if (content.includes('<urlset') || content.includes('<sitemapindex')) {
        // Handle sitemap index (contains multiple sitemaps)
        if (content.includes('<sitemapindex')) {
          const sitemapUrls = [...content.matchAll(/<loc>(.*?)<\/loc>/g)]
            .map(match => match[1].trim());
          
          for (const nestedSitemapUrl of sitemapUrls) {
            try {
              const nestedResponse = await fetch(nestedSitemapUrl);
              if (nestedResponse.ok) {
                const nestedContent = await nestedResponse.text();
                const urls = [...nestedContent.matchAll(/<loc>(.*?)<\/loc>/g)]
                  .map(match => match[1].trim());
                urls.forEach(url => discoveredUrls.add(url));
              }
            } catch (e) {
              console.error(`Failed to fetch nested sitemap: ${nestedSitemapUrl}`);
            }
          }
        } else {
          // Regular sitemap - extract all URLs
          const urls = [...content.matchAll(/<loc>(.*?)<\/loc>/g)]
            .map(match => match[1].trim());
          urls.forEach(url => discoveredUrls.add(url));
        }
      }
      
      // Text sitemap (one URL per line)
      if (!content.includes('<') && content.includes('http')) {
        const urls = content.split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('http'));
        urls.forEach(url => discoveredUrls.add(url));
      }
    } catch (e) {
      console.error(`Failed to fetch sitemap from ${path}:`, e);
      continue;
    }
  }
  
  console.log(`Found ${discoveredUrls.size} URLs from sitemap`);
  
  // If no sitemap found or very few URLs, use HTML scraping
  if (discoveredUrls.size <= 5) {
    console.log('Sitemap incomplete or not found, falling back to HTML scraping');
    const scrapedUrls = await discoverViaHtmlScraping(baseUrl);
    scrapedUrls.forEach(url => discoveredUrls.add(url));
  }
  
  return filterDocumentationUrls(Array.from(discoveredUrls));
}

// Improved HTML discovery with better crawling
export async function discoverViaHtmlScraping(url: string): Promise<string[]> {
  const baseUrl = new URL(url);
  const visited = new Set<string>();
  const toVisit = [url];
  const foundPages: string[] = [];
  const maxPages = 200;
  const maxDepth = 5; // Add depth limit to avoid going too deep
  
  // Track depth of each URL
  const urlDepth = new Map<string, number>();
  urlDepth.set(url, 0);

  while (toVisit.length > 0 && foundPages.length < maxPages) {
    const currentUrl = toVisit.shift()!;
    if (visited.has(currentUrl)) continue;
    
    const currentDepth = urlDepth.get(currentUrl) || 0;
    if (currentDepth > maxDepth) continue;
    
    visited.add(currentUrl);
    console.log(`Scraping: ${currentUrl} (depth: ${currentDepth})`);

    try {
      const response = await fetch(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Documentation-Bot/1.0)'
        }
      });
      
      if (!response.ok) continue;
      
      const html = await response.text();
      foundPages.push(currentUrl);

      // More comprehensive link extraction
      const linkPatterns = [
        /href="([^"#]+)"/gi,
        /href='([^'#]+)'/gi,
        /<a[^>]+href=["']([^"'#]+)["']/gi
      ];
      
      const links = new Set<string>();
      
      for (const pattern of linkPatterns) {
        const matches = [...html.matchAll(pattern)];
        matches.forEach(match => links.add(match[1]));
      }

      for (const link of links) {
        let absoluteLink = link;
        
        // Convert relative URLs to absolute
        if (link.startsWith("/")) {
          absoluteLink = `${baseUrl.origin}${link}`;
        } else if (!link.startsWith("http")) {
          // Handle relative paths
          try {
            absoluteLink = new URL(link, currentUrl).href;
          } catch {
            continue;
          }
        }

        try {
          const linkUrl = new URL(absoluteLink);
          
          // Skip external links
          if (linkUrl.origin !== baseUrl.origin) continue;
          
          // Skip already visited or queued
          if (visited.has(absoluteLink) || toVisit.includes(absoluteLink)) continue;
          
          // Clean up the URL
          linkUrl.hash = ''; // Remove fragment
          const cleanUrl = linkUrl.href;
          
          // Check if this is a documentation-like URL
          const pathname = linkUrl.pathname.toLowerCase();
          
          // More inclusive patterns for Vite docs
          const includePatterns = [
            '/guide/', '/config/', '/plugins/', '/api/',
            '.html', // Include HTML pages
            '/blog/' // Sometimes docs are in blog
          ];
          
          const excludePatterns = [
            '.pdf', '.zip', '.tar', '.gz', 
            '/assets/', '/images/', '/_nuxt/',
            '.png', '.jpg', '.svg', '.css', '.js'
          ];
          
          // Check if we should include this URL
          const shouldInclude = includePatterns.some(p => pathname.includes(p)) ||
                               pathname === '/' || // Include root
                               pathname.split('/').length <= 3; // Include shallow paths
          
          const shouldExclude = excludePatterns.some(p => pathname.includes(p));
          
          if (shouldInclude && !shouldExclude) {
            toVisit.push(cleanUrl);
            urlDepth.set(cleanUrl, currentDepth + 1);
          }
        } catch (e) {
          console.warn(`Invalid URL found: ${absoluteLink}`);
        }
      }
    } catch (error) {
      console.error(`Failed to fetch ${currentUrl}:`, error);
    }
    
    // Add a small delay to be respectful to the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`HTML scraping found ${foundPages.length} pages`);
  return dedupeUrls(foundPages);
}

function filterDocumentationUrls(urls: string[]): string[] {
  const normalizedUrls = new Set<string>();
  
  for (const url of urls) {
    try {
      const urlObj = new URL(url);
      // Remove trailing slashes and fragments
      urlObj.hash = '';
      let normalized = urlObj.href;
      if (urlObj.pathname !== '/' && urlObj.pathname.endsWith('/')) {
        urlObj.pathname = urlObj.pathname.slice(0, -1);
        normalized = urlObj.href;
      }
      normalizedUrls.add(normalized);
    } catch {
      continue;
    }
  }
  
  // Be less aggressive with filtering for Vite-like docs
  const filtered = Array.from(normalizedUrls).filter(url => {
    const lower = url.toLowerCase();
    
    // Skip foreign languages (but be careful not to exclude valid paths)
    const foreignLanguagePatterns = [
      '/zh-cn/', '/zh-tw/', '/ja/', '/ko/', '/es/', '/fr/',
      '/de/', '/ru/', '/pt/', '/it/', '/ar/', '/hi/',
      '/zh/', '/jp/', '/kr/' // Shorter variants
    ];
    
    // Check if it's actually a foreign language path
    const isForeignLanguage = foreignLanguagePatterns.some(pattern => {
      const parts = lower.split('/');
      return parts.some(part => part === pattern.replace(/\//g, ''));
    });
    
    if (isForeignLanguage) return false;
    
    // Skip non-documentation pages
    const skipPatterns = [
      '/signin', '/login', '/register', '/logout',
      '/privacy', '/terms', '/cookies',
      '/careers', '/jobs', '/about/team'
    ];
    
    if (skipPatterns.some(pattern => lower.includes(pattern))) {
      return false;
    }
    
    // For Vite specifically, include most paths under /guide/
    if (url.includes('vite.dev')) {
      // Include everything under /guide/, /config/, /plugins/
      if (lower.includes('/guide/') || 
          lower.includes('/config/') || 
          lower.includes('/plugins/') ||
          lower.includes('/blog/') && lower.includes('announcing')) {
        return true;
      }
    }
    
    return true; // Be inclusive by default
  });
  
  // Sort URLs by path depth (shallower first) and alphabetically
  filtered.sort((a, b) => {
    const depthA = a.split('/').length;
    const depthB = b.split('/').length;
    if (depthA !== depthB) return depthA - depthB;
    return a.localeCompare(b);
  });
  
  console.log(`After filtering: ${filtered.length} URLs`);
  return filtered.slice(0, 200); // Increase limit
}

function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.map(normalizeUrl).filter(url => {
    if (seen.has(url)) return false;
    seen.add(url);
    return true;
  });
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = ''; // remove fragment
    // strip tracking params
    const paramsToRemove: string[] = [];
    u.searchParams.forEach((_, key) => {
      if (key.startsWith('utm_') || key === 'ref' || key === 'source') {
        paramsToRemove.push(key);
      }
    });
    paramsToRemove.forEach(key => u.searchParams.delete(key));
    
    // remove trailing slash (except root)
    if (u.pathname !== '/' && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }
    return u.toString();
  } catch {
    return url;
  }
}

// Main entry point that combines both methods
export async function discoverAllUrls(baseUrl: string): Promise<string[]> {
  console.log(`Starting URL discovery for: ${baseUrl}`);
  
  // Try sitemap first (which now includes HTML fallback)
  const urls = await discoverViaSitemap(baseUrl);
  
  console.log(`Total URLs discovered: ${urls.length}`);
  return urls;
}