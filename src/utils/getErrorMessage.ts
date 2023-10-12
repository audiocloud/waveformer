import z from 'zod'

export const getErrorMessage = (error: any): string => {

  if (error.isAxiosError) {
    if (error.response) {
      // Axios error with a response from the server
      return `Axios Error: ${error.response.status} - Message: ${error.response.data.message}`
    } else {
      // Axios error without a response (e.g., network error)
      return `Axios Network Error: ${error.message}`
    }
  }

  if (awsErrorSchema.safeParse(error).success) {
    return `AWS Error: ${error.name}`
  }

  if ('message' in error) return error.message

  return 'Unknown error type. No message found in the Error object. getErrorMessage function probably needs an update.'
}

const awsErrorSchema = z.object({
  name: z.string(),
  $fault: z.string(),
  $metadata: z.object({
    httpStatusCode: z.number(),
    requestId: z.string(),
    extendedRequestId: z.string(),
    cfId: z.unknown().optional(),
    attempts: z.number(),
    totalRetryDelay: z.number(),
  }),
  message: z.string()
})