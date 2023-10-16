export const isValidDomain = (url: string) => {
  
  const validDomainsString = process.env.VALID_URL_DOMAINS || '*'
  const validDomainPatterns = validDomainsString.split(',')

  const isMatching = validDomainPatterns.some(pattern => isURLValid(url, pattern))

  return isMatching
}

const isURLValid = (url: string, pattern: string) => {

  if (pattern === '*') return true

  // Escape special characters in the pattern and convert it to a regular expression
  const regexPattern = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
  return regexPattern.test(url)
}