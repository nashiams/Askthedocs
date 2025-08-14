export async function checkAuth() {
  try {
    const response = await fetch('/api/auth/session');
    const data = await response.json();
    return !!data?.user;
  } catch {
    return false;
  }
}