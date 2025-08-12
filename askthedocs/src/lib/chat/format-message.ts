export function formatMessageWithCode(content: string): string {
  // Convert inline code
  content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Convert code blocks
  content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code class="language-${lang || 'plaintext'}">${code}</code></pre>`;
  });
  
  // Convert bold
  content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Convert italic
  content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Convert links
  content = content.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  
  return content;
}