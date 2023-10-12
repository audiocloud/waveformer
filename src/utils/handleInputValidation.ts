import { z } from 'zod'

export const handleInputValidation = <T extends z.ZodTypeAny>(Schema: T, body: Record<string, unknown>): z.infer<T> => {
  const result = Schema.safeParse(body)
  
  if (!result.success) {
    const error = result.error.errors[0]
    if (error.code === 'invalid_type')      throw Error(`Invalid type of '${error.path}'. Expected '${error.expected}', but received '${error.received}'.`)
    if (error.code === 'unrecognized_keys') throw Error(error.message)
    throw Error(`Zod '${error.code}' error on '${error.path}'. ${error.message}.`)
  }

  return body
}