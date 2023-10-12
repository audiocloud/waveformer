export const getErrorStatusCode = (error: any): number => {
  if ('statusCode' in error) return error.statusCode
  return 500
}