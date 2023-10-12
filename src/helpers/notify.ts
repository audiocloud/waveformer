import axios from 'axios'
import { serializeError } from 'serialize-error'
import { AudioFileMeta } from '../types'
import { Logger } from '../utils/logger'
import { getErrorMessage } from '../utils/getErrorMessage'

const logger = new Logger('waveformer/notify')

export const notify = async (notifyUrl: string, id: string, context: any, meta: AudioFileMeta, err: any) =>  {
  try {
    
    logger.info('Notifying:', { notifyUrl, id, context, meta, err })
  
    const data = {
      err: err ? serializeError(err) : null, // not in use and always null atm
      context,
      meta,
      id,
    }
    const { status, statusText } = await axios.post(notifyUrl, data)
    logger.info('Status:', status)
    if (status !== 200) logger.warn(statusText)

  } catch (error) {
    const message = getErrorMessage(error)
    logger.error(message)
    return {
      success: false,
      message
    }
  }
}