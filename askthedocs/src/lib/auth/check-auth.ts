export function checkAuthCookie() {
  if (typeof document === 'undefined') {
    console.log("❌ Document is undefined");
    return false;
  }
  
  // Log all cookies for debugging
  console.log("🍪 All cookies:", document.cookie);
  
  const cookies = document.cookie
    .split(';')
    .map(cookie => cookie.trim());
  
  // Log cookie names
  const cookieNames = cookies.map(c => c.split('=')[0]);
  console.log("📝 Cookie names found:", cookieNames);
  
  // NextAuth uses different cookie names in dev vs production
  const possibleCookieNames = [
    'authjs.session-token',
    '__Secure-authjs.session-token',
    'next-auth.session-token',
    '__Secure-next-auth.session-token',
    'authjs.session-token' // Sometimes without prefix in dev
  ];
  
  let foundSessionCookie = false;
  
  for (const cookieName of possibleCookieNames) {
    const cookie = cookies.find(c => c.startsWith(`${cookieName}=`));
    if (cookie) {
      const value = cookie.split('=')[1];
      if (value && value !== '') {
        console.log(`✅ Found valid session cookie: ${cookieName}`);
        foundSessionCookie = true;
        break;
      }
    }
  }
  
  if (!foundSessionCookie) {
    console.log("❌ No valid session cookie found");
  }
  
  return foundSessionCookie;
}