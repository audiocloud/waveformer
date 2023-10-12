import wmatch from 'wildcard-match'

const is_domain_valid = wmatch(
  (process.env.VALID_URL_DOMAINS || '*').split(',')
)

export const is_url_valid = (url: string) => {
  const parsed = new URL(url)
  return is_domain_valid(parsed.host)
}