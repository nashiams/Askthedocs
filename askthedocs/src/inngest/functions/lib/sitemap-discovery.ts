export async function discoverViaSitemap(baseUrl: string): Promise<string[]> {
  const inputUrl = new URL(baseUrl);
  const scopePath = inputUrl.pathname; // This is the path user wants to scope to
  
  // Determine sitemap locations based on whether we're at root or a subpath
  const possibleSitemaps = scopePath === '/' ? [
    '/sitemap.xml',
    '/sitemap_index.xml',
    '/sitemap.txt',
    '/docs/sitemap.xml',
    '/api/sitemap.xml',
    '/sitemap',
    '/sitemap-0.xml',
  ] : [
    // For subpaths, try both root sitemap and local sitemap
    '/sitemap.xml',
    '/sitemap_index.xml',
    `${scopePath}/sitemap.xml`,
    `${scopePath.replace(/\/$/, '')}/sitemap.xml`,
  ];
  
  // Always include the input URL itself
  const discoveredUrls = new Set<string>([baseUrl]);
  
  console.log(`Discovering URLs scoped to: ${inputUrl.origin}${scopePath}`);
  
  // Try sitemap discovery first
  for (const path of possibleSitemaps) {
    try {
      const sitemapUrl = new URL(path, inputUrl.origin).href;
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
                  .map(match => match[1].trim())
                  .filter(url => isUrlInScope(url, inputUrl)); // Filter by scope
                urls.forEach(url => discoveredUrls.add(url));
              }
            } catch (e) {
              console.error(`Failed to fetch nested sitemap: ${nestedSitemapUrl}`);
            }
          }
        } else {
          // Regular sitemap - extract all URLs and filter by scope
          const urls = [...content.matchAll(/<loc>(.*?)<\/loc>/g)]
            .map(match => match[1].trim())
            .filter(url => isUrlInScope(url, inputUrl));
          urls.forEach(url => discoveredUrls.add(url));
        }
      }
      
      // Text sitemap (one URL per line)
      if (!content.includes('<') && content.includes('http')) {
        const urls = content.split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('http'))
          .filter(url => isUrlInScope(url, inputUrl));
        urls.forEach(url => discoveredUrls.add(url));
      }
    } catch (e) {
      console.error(`Failed to fetch sitemap from ${path}:`, e);
      continue;
    }
  }
  
  console.log(`Found ${discoveredUrls.size} URLs from sitemap within scope`);
  
  // If no sitemap found or very few URLs, use HTML scraping
  if (discoveredUrls.size <= 5) {
    console.log('Sitemap incomplete or not found, falling back to HTML scraping');
    const scrapedUrls = await discoverViaHtmlScraping(baseUrl);
    scrapedUrls.forEach(url => discoveredUrls.add(url));
  }
  
  return filterDocumentationUrls(Array.from(discoveredUrls), inputUrl);
}

// Helper function to check if URL is within the user's specified scope
function isUrlInScope(url: string, inputUrl: URL): boolean {
  try {
    const checkUrl = new URL(url);
    
    // Must be same origin
    if (checkUrl.origin !== inputUrl.origin) return false;
    
    // If user specified a path (not root), URL must be under that path
    if (inputUrl.pathname !== '/' && inputUrl.pathname !== '') {
      // Normalize paths for comparison
      const scopePath = inputUrl.pathname.replace(/\/$/, '').toLowerCase();
      const urlPath = checkUrl.pathname.toLowerCase();
      
      // URL path must start with the scope path
      return urlPath === scopePath || urlPath.startsWith(scopePath + '/');
    }
    
    return true;
  } catch {
    return false;
  }
}

// Improved HTML discovery with better crawling and scope awareness
export async function discoverViaHtmlScraping(url: string): Promise<string[]> {
  const inputUrl = new URL(url);
  const scopePath = inputUrl.pathname;
  const visited = new Set<string>();
  const toVisit = [url];
  const foundPages: string[] = [];
  const maxPages = 200;
  const maxDepth = 5;
  
  // Track depth of each URL
  const urlDepth = new Map<string, number>();
  urlDepth.set(url, 0);

  console.log(`HTML scraping with scope: ${inputUrl.origin}${scopePath}`);

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
          absoluteLink = `${inputUrl.origin}${link}`;
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
          
          // Check if URL is within scope
          if (!isUrlInScope(absoluteLink, inputUrl)) continue;
          
          // Skip already visited or queued
          if (visited.has(absoluteLink) || toVisit.includes(absoluteLink)) continue;
          
          // Clean up the URL
          linkUrl.hash = ''; // Remove fragment
          const cleanUrl = linkUrl.href;
          
          // Check if this is a documentation-like URL
          const pathname = linkUrl.pathname.toLowerCase();
          
          // More inclusive patterns for documentation
          const includePatterns = [
            '/guide/', '/config/', '/plugins/', '/api/',
            '/docs/', '/documentation/', '/reference/',
            '/tutorial/', '/examples/', '/getting-started/',
            '.html', // Include HTML pages
          ];
          
          const excludePatterns = [
            '.pdf', '.zip', '.tar', '.gz', 
            '/assets/', '/images/', '/_nuxt/',
            '.png', '.jpg', '.svg', '.css', '.js',
            '/downloads/', '/media/'
          ];
          
          // For scoped searches, be more inclusive
          const shouldInclude = scopePath !== '/' ? 
            true : // If scoped, include everything under the scope
            includePatterns.some(p => pathname.includes(p)) ||
            pathname === '/' ||
            pathname.split('/').length <= 3;
          
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

  console.log(`HTML scraping found ${foundPages.length} pages within scope`);
  return dedupeUrls(foundPages);
}

function filterDocumentationUrls(urls: string[], inputUrl: URL): string[] {
  const normalizedUrls = new Set<string>();
  const scopePath = inputUrl.pathname.replace(/\/$/, '').toLowerCase();
  
  for (const url of urls) {
    try {
      const urlObj = new URL(url);
      
      // Double-check scope
      if (!isUrlInScope(url, inputUrl)) continue;
      
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
  
  // Filter out foreign languages - only keep English
  const filtered = Array.from(normalizedUrls).filter(url => {
    const lower = url.toLowerCase();
    const pathname = new URL(url).pathname.toLowerCase();
    
    // Foreign language patterns to exclude
    const foreignLanguagePatterns = [
      '/zh-cn/', '/zh-tw/', '/ja/', '/ko/', '/es/', '/fr/',
      '/de/', '/ru/', '/pt/', '/it/', '/ar/', '/hi/',
      '/zh/', '/jp/', '/kr/', '/nl/', '/pl/', '/tr/',
      '/id/', '/th/', '/vi/', '/cs/', '/da/', '/fi/',
      '/el/', '/he/', '/hu/', '/no/', '/ro/', '/sk/',
      '/sv/', '/uk/', '/bg/', '/ca/', '/hr/', '/lt/',
      '/lv/', '/sl/', '/sr/', '/et/', '/is/', '/mk/',
      '/sq/', '/bs/', '/mt/', '/ga/', '/cy/', '/eu/',
      '/gl/', '/lb/', '/fa/', '/ur/', '/bn/', '/ta/',
      '/te/', '/ml/', '/kn/', '/mr/', '/gu/', '/pa/'
    ];
    
    // Check URL path segments for language codes
    const pathSegments = pathname.split('/').filter(s => s);
    const hasLanguageCode = foreignLanguagePatterns.some(pattern => {
      const langCode = pattern.replace(/\//g, '');
      return pathSegments.includes(langCode) || 
             pathSegments.some(seg => seg === langCode || seg.startsWith(langCode + '-'));
    });
    
    if (hasLanguageCode) return false;
    
    // Also check for language in query params
    const urlObj = new URL(url);
    const lang = urlObj.searchParams.get('lang') || urlObj.searchParams.get('locale');
    if (lang && lang !== 'en' && !lang.startsWith('en-')) {
      return false;
    }
    
    // Skip non-documentation pages (but be less aggressive when scoped)
    const skipPatterns = scopePath !== '/' ? [
      // When scoped, only skip authentication and legal pages
      '/signin', '/login', '/register', '/logout',
      '/privacy', '/terms', '/cookies'
    ] : [
      // When not scoped, skip more broadly
      '/signin', '/login', '/register', '/logout',
      '/privacy', '/terms', '/cookies',
      '/careers', '/jobs', '/about/team', '/blog',
      '/pricing', '/contact', '/support'
    ];
    
    if (skipPatterns.some(pattern => lower.includes(pattern))) {
      return false;
    }
    
    return true;
  });
  
  // Sort URLs by path depth (shallower first) and alphabetically
  filtered.sort((a, b) => {
    const depthA = a.split('/').length;
    const depthB = b.split('/').length;
    if (depthA !== depthB) return depthA - depthB;
    return a.localeCompare(b);
  });
  
  console.log(`After filtering: ${filtered.length} URLs (scoped to ${inputUrl.origin}${scopePath})`);
  return filtered.slice(0, 200);
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
  
  // Parse the input URL to understand the scope
  const inputUrl = new URL(baseUrl);
  console.log(`Scope: ${inputUrl.origin}${inputUrl.pathname}`);
  
  // Try sitemap first (which now includes HTML fallback)
  const urls = await discoverViaSitemap(baseUrl);
  
  console.log(`Total URLs discovered: ${urls.length}`);
  return urls;
}